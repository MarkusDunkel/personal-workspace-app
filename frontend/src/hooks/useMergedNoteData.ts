import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveSaveRejectedError,
  getArchiveTable,
  getTable,
  putArchiveTable,
  putTable,
} from '../api/notesApi';
import type { RowOrigin, TableData, TableRow } from '../api/noteTypes';
import { originKey, originLabel, parseOriginKey } from '../utils/noteSort';
import { useArchiveFiles } from './useArchiveFiles';
import { useDebouncedCallback } from './useDebouncedCallback';

/**
 * Laedt die laufende Notiz (0_sources/notes/notes.json) UND die abgelegten
 * Notizen (2_ai-ready/notes/notes-*.json) in EINE Zeilenliste und schreibt
 * jede Aenderung an ihren Herkunftsendpunkt zurueck.
 *
 * Ersetzt useNoteTableData, das pro Tabelle eine eigene Instanz brauchte -
 * und damit pro sichtbarer Notiz eine eigene Debounce UND ein eigenes
 * 30s-Intervall. Hier gibt es genau eine Debounce und ein Intervall; der
 * Fan-out beim Speichern trifft nur die tatsaechlich geaenderten Dateien.
 *
 * Die teuer erarbeiteten Eigenschaften von useNoteTableData sind absichtlich
 * uebernommen und NICHT neu erfunden - der Updater-Vertrag von mutateRows,
 * die Debounce plus Fallback-Intervall und das bewusste dirty-Bleiben nach
 * einem abgelehnten Archiv-Speichern. Die alte Datei traegt den Hinweis, dass
 * eine Kopie stillschweigend auseinanderlaufen wuerde; dies ist deshalb ihr
 * Ersatz, nicht ihre Kopie.
 */

/**
 * Wie viele Archivdateien beim Seitenaufruf sofort geladen werden. Der Rest
 * folgt auf Anforderung (loadMore) - jede Datei ist eine eigene Anfrage, ein
 * Sammelendpunkt existiert nicht.
 *
 * 2 ist bewusst klein: die beiden neuesten Dateien deckten beim Einbau 46 von
 * 52 Archivzeilen ab, die Ansicht ist also praktisch vollstaendig, waehrend
 * beim Start nur drei Anfragen laufen. Aeltere Notizen braucht man selten,
 * und wer sie braucht, klickt einmal.
 */
const INITIAL_ARCHIVE_BATCH = 2;

/** Wie viele weitere Dateien ein Klick auf "weitere laden" nachlaedt. */
const ARCHIVE_BATCH_SIZE = 5;

export interface MergedNoteData {
  rows: TableRow[];
  /** Aggregierter Speicherstatus fuer die StatusBar. */
  saveStatus: string;
  /** Meldungen einzelner Dateien, die Aufmerksamkeit brauchen (z.B. 409). */
  problems: string[];
  /** Wie viele Archivdateien noch nicht geladen sind. */
  pendingFileCount: number;
  loadMore: () => void;
  isLiveRow: (rowId: string) => boolean;
  /**
   * Setzt eine Zelle. Gibt die geaenderte Zeile zurueck - oder null, wenn
   * der Wert unveraendert war und daher nichts geschrieben wurde.
   */
  setCell: (rowId: string, columnId: string, value: string | null) => TableRow | null;
  insertRow: (initialCells?: Record<string, string | null>) => string;
  deleteRow: (rowId: string) => void;
  saveNow: () => Promise<void>;
}

export function useMergedNoteData(liveTableId: string, reloadToken: number = 0): MergedNoteData {
  const [rows, setRowsState] = useState<TableRow[]>([]);
  const [statusByKey, setStatusByKey] = useState<Map<string, string>>(new Map());
  const [dirtyCount, setDirtyCount] = useState(0);

  const archiveFiles = useArchiveFiles(reloadToken);
  const [loadLimit, setLoadLimit] = useState(INITIAL_ARCHIVE_BATCH);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  /**
   * rowId -> Herkunftsdatei. Bewusst eine Ref und kein State: gelesen wird
   * sie in doSave und in jedem Mutator, wo eine veraltete Closure ein
   * Korrektheitsfehler waere (derselbe Grund, aus dem dirtyRef in
   * useNoteTableData eine Ref war). Die Karte beeinflusst das Rendern nicht
   * direkt - was sie sichtbar macht (der Herkunftsmarker) haengt an rows,
   * das ohnehin gemeinsam mit ihr aktualisiert wird.
   */
  const originByRowIdRef = useRef<Map<string, RowOrigin>>(new Map());

  /** Herkunftsdateien mit ungespeicherten Aenderungen. */
  const dirtyKeysRef = useRef<Set<string>>(new Set());

  const setStatus = useCallback((key: string, status: string) => {
    setStatusByKey((prev) => new Map(prev).set(key, status));
  }, []);

  /**
   * Liest die Herkunft aus der Ref, ist also immer aktuell - im Gegensatz zu
   * einem Wert, der ueber den Render-Zyklus transportiert wuerde. Wird sowohl
   * innerhalb von Updatern als auch beim Rendern des Herkunftsmarkers
   * benutzt.
   */
  const isLiveRowId = useCallback(
    (rowId: string) => originByRowIdRef.current.get(rowId)?.kind === 'live',
    [],
  );

  /**
   * Markiert eine Herkunftsdatei als geaendert. Wird IMMER vor mutateRows
   * aufgerufen, nie innerhalb des Updaters: der Updater laeuft unter
   * Concurrent Rendering asynchron, ein dort gesetztes Ref-Flag ist beim
   * Lesen in doSave noch nicht gesetzt. Genau dieser Fehler ist in
   * useGridNavigation (moveDown/moveTab) zweimal aufgetreten und dort
   * ausfuehrlich dokumentiert.
   */
  const markDirty = useCallback((key: string) => {
    dirtyKeysRef.current.add(key);
    setDirtyCount(dirtyKeysRef.current.size);
  }, []);

  const doSave = useCallback(async () => {
    const keys = [...dirtyKeysRef.current];
    if (keys.length === 0) return;

    // Zeilen nach Herkunft gruppieren. Die Gruppierung passiert hier, nicht
    // beim Bearbeiten: nur so ist garantiert, dass geschrieben wird, was
    // gerade in rowsRef steht.
    const byKey = new Map<string, TableRow[]>();
    for (const row of rowsRef.current) {
      const origin = originByRowIdRef.current.get(row.id);
      if (!origin) continue;
      const key = originKey(origin);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(row);
      else byKey.set(key, [row]);
    }

    // allSettled, nicht all: lehnt eine Archivdatei ab (409, siehe unten),
    // muessen die uebrigen trotzdem geschrieben werden.
    await Promise.allSettled(
      keys.map(async (key) => {
        const origin = parseOriginKey(key);
        const fileRows = [...(byKey.get(key) ?? [])].sort((a, b) => a.order - b.order);
        setStatus(key, 'speichert…');
        // tableId ist IMMER die der laufenden Notiz ('notes'), auch fuer
        // Archivdateien - der Dateiname steckt im Endpunkt, nicht im Body.
        // Die alte ArchiveNoteSection uebergab hier den Dateinamen, wodurch
        // zwei Archivdateien einen falschen tableId auf die Platte bekamen
        // (ArchiveNotesMigration raeumt das nach, dies verhindert die
        // Wiederkehr).
        const data: TableData = { tableId: liveTableId, rows: fileRows };
        try {
          if (origin.kind === 'live') await putTable(origin.tableId, data);
          else await putArchiveTable(origin.fileName, data);
          dirtyKeysRef.current.delete(key);
          setDirtyCount(dirtyKeysRef.current.size);
          setStatus(key, 'Gespeichert ' + new Date().toLocaleTimeString());
        } catch (err) {
          if (err instanceof ArchiveSaveRejectedError) {
            // Diese Datei bleibt absichtlich dirty: die Aenderung steht in
            // der Oberflaeche, wurde aber nicht geschrieben. Sobald der Name
            // im Register steht, greift der naechste Speicherversuch. Die
            // Servermeldung nennt Zeile und Spalte und wird deshalb
            // unveraendert weitergegeben.
            setStatus(key, `${originLabel(origin)}: ${err.message}`);
            return;
          }
          setStatus(
            key,
            err instanceof TypeError
              ? 'Fehler beim Speichern (offline?)'
              : `Fehler beim Speichern (${originLabel(origin)})`,
          );
        }
      }),
    );
  }, [liveTableId, setStatus]);

  const scheduleSave = useDebouncedCallback(doSave, 800);

  /**
   * Nimmt bewusst eine Updater-FUNKTION (wie setState selbst), nicht ein
   * fertiges Array: setCell und insertRow koennen beide innerhalb desselben
   * Tastendruck-Handlers aufgerufen werden. Ohne Updater-Funktion wuerden
   * beide denselben, zwischen den Aufrufen NICHT aktualisierten
   * rowsRef.current-Stand lesen (die Ref wird erst beim naechsten Render neu
   * zugewiesen) - der zweite Aufruf haette die Aenderung des ersten
   * unwissentlich verworfen. React garantiert dagegen, dass
   * Updater-Funktionen bei mehreren setState-Aufrufen im selben Tick
   * nacheinander auf dem jeweils schon aktualisierten Zwischenstand laufen.
   *
   * markDirty ist NICHT Teil dieser Funktion - siehe Kommentar dort.
   */
  const mutateRows = useCallback(
    (updater: (current: TableRow[]) => TableRow[]) => {
      setRowsState((current) => {
        const next = updater(current);
        rowsRef.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  /**
   * Gibt true zurueck, wenn dieser Commit den Zellwert tatsaechlich aendert.
   *
   * Notwendig, weil das Grid bei JEDEM Fokuswechsel committet, nicht nur
   * nach einer Eingabe: ein Klick auf eine Zelle startet den Editiermodus
   * (Auto-Edit-Effect in DataGrid, damit man sofort tippen kann), und beim
   * Verlassen ruft die Zelle onCommit mit ihrem unveraenderten Entwurf auf.
   * Ohne diese Pruefung galt allein das ANKLICKEN einer Zeile als Aenderung -
   * mit drei sichtbaren Folgen: die Datei wurde als geaendert markiert,
   * lastChanged bekam einen neuen Zeitstempel, und bei einer abgelegten
   * Notiz lehnte der Server das anschliessende Speichern mit "Nicht
   * pseudonymisierbar" ab, sobald irgendwo in DERSELBEN Datei ein Name
   * steht, den das Register nicht kennt (rejectUnmappedPersonNames prueft
   * die ganze Datei, nicht nur die geaenderte Zeile).
   *
   * Leerstring und null gelten als derselbe Zustand: eine leere Zelle
   * kommt aus den Dateien in beiden Formen (siehe NoteArchiveService -
   * aeltere Dateien kennen manche Spalten gar nicht), und die Zellen
   * committen "" konsequent als null.
   */
  const isRealChange = (row: TableRow, columnId: string, value: string | null) => {
    const previous = row.cells[columnId];
    const normalize = (v: string | null | undefined) => (v === undefined || v === '' ? null : v);
    return normalize(previous) !== normalize(value);
  };

  /**
   * Liefert die geaenderte Zeile zurueck, wenn wirklich etwas geaendert
   * wurde - sonst null. Der Aufrufer braucht diesen Rueckgabewert, um die
   * Zeile bei Bedarf sichtbar zu halten (siehe
   * useNoteViewFilters.keepVisible): rows enthaelt in diesem Renderzyklus
   * noch den alten Stand.
   */
  const setCell = useCallback(
    (rowId: string, columnId: string, value: string | null): TableRow | null => {
      const origin = originByRowIdRef.current.get(rowId);
      if (!origin) return null;
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row || !isRealChange(row, columnId, value)) return null;
      const updated: TableRow = {
        ...row,
        cells: { ...row.cells, [columnId]: value, lastChanged: new Date().toISOString() },
      };
      markDirty(originKey(origin));
      mutateRows((current) => current.map((r) => (r.id === rowId ? updated : r)));
      return updated;
    },
    [markDirty, mutateRows],
  );

  const insertRow = useCallback(
    (initialCells?: Record<string, string | null>) => {
      const now = new Date().toISOString();
      const newRow: TableRow = {
        id: crypto.randomUUID(),
        cells: { ...initialCells, created: now, lastChanged: now },
        order: 0,
      };
      // Neue Zeilen gehoeren IMMER in die laufende Notiz - abgelegte Notizen
      // sind bearbeitbar, aber dort entstehen keine neuen Eintraege.
      const origin: RowOrigin = { kind: 'live', tableId: liveTableId };
      originByRowIdRef.current.set(newRow.id, origin);
      markDirty(originKey(origin));
      mutateRows((current) => {
        // order bleibt PRO DATEI dicht und 0-basiert. Wichtig, weil
        // NoteArchiveService.rejectUnmappedPersonNames order+1 als
        // Zeilennummer in seiner Fehlermeldung nennt - eine ueber alle
        // Dateien durchlaufende Nummerierung machte diese Meldung unbrauchbar.
        newRow.order = current.filter((r) => isLiveRowId(r.id)).length;
        // Haengt hinten an, obwohl die Zeile oben ERSCHEINEN soll: die
        // Anzeigereihenfolge entsteht in useNoteViewFilters (created
        // absteigend), und created ist hier "jetzt". Ein Prepend waere
        // wirkungslos und wuerde nur die Datei-order verwirren.
        return [...current, newRow];
      });
      return newRow.id;
    },
    [liveTableId, markDirty, mutateRows, isLiveRowId],
  );

  const deleteRow = useCallback(
    (rowId: string) => {
      const origin = originByRowIdRef.current.get(rowId);
      if (!origin) return;
      const key = originKey(origin);
      markDirty(key);
      mutateRows((current) => {
        // Renummeriert NUR die betroffene Datei. useNoteTableData
        // renummerierte alle Zeilen, was fuer eine einzelne Tabelle richtig
        // war, in einer gemischten Liste aber die order jeder anderen Datei
        // zerstoeren wuerde - ohne dass diese als dirty markiert und damit
        // gespeichert wuerde.
        let n = 0;
        return current
          .filter((r) => r.id !== rowId)
          .map((r) => {
            const rowOrigin = originByRowIdRef.current.get(r.id);
            return rowOrigin && originKey(rowOrigin) === key ? { ...r, order: n++ } : r;
          });
      });
      originByRowIdRef.current.delete(rowId);
    },
    [markDirty, mutateRows],
  );

  useEffect(() => {
    const id = window.setInterval(doSave, 30000);
    return () => window.clearInterval(id);
  }, [doSave]);

  // Jeder Ladevorgang haengt an reloadToken: nach einem Absenden ist die
  // laufende Notiz serverseitig geleert und eine Archivdatei dazugekommen.
  useEffect(() => {
    originByRowIdRef.current = new Map();
    dirtyKeysRef.current = new Set();
    setDirtyCount(0);
    setRowsState([]);
    setStatusByKey(new Map());
    setLoadLimit(INITIAL_ARCHIVE_BATCH);
  }, [reloadToken]);

  /**
   * Fuegt die Zeilen einer Herkunftsdatei ein. Bewusst pro Datei und nicht
   * gesammelt: so ist das Grid benutzbar, sobald die erste Antwort da ist.
   * Jede Datei sortiert beim Eintreffen nach order - die Anzeigereihenfolge
   * kommt spaeter aus useNoteViewFilters, aber die Datei-order muss stimmen,
   * damit sie beim Speichern unveraendert zurueckgeht.
   */
  const mergeFile = useCallback(
    (origin: RowOrigin, data: TableData) => {
      const sorted = [...data.rows].sort((a, b) => a.order - b.order);
      for (const row of sorted) {
        if (import.meta.env.DEV && originByRowIdRef.current.has(row.id)) {
          console.error(
            `Zeilen-ID ${row.id} kommt in mehreren Herkunftsdateien vor - `
              + 'Bearbeitungen dieser Zeile landen in nur einer davon.',
          );
        }
        originByRowIdRef.current.set(row.id, origin);
      }
      // Ohne markDirty: Laden ist keine Aenderung. Deshalb auch nicht ueber
      // mutateRows, das eine Speicherung anstossen wuerde.
      setRowsState((current) => {
        const next = [...current, ...sorted];
        rowsRef.current = next;
        return next;
      });
    },
    [],
  );

  const loadedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadedKeysRef.current = new Set();
  }, [reloadToken]);

  useEffect(() => {
    const origin: RowOrigin = { kind: 'live', tableId: liveTableId };
    const key = originKey(origin);
    if (loadedKeysRef.current.has(key)) return;
    loadedKeysRef.current.add(key);
    getTable(liveTableId)
      .then((data) => mergeFile(origin, data))
      .catch(() => setStatus(key, 'Konnte die laufende Notiz nicht laden'));
  }, [liveTableId, reloadToken, mergeFile, setStatus]);

  useEffect(() => {
    for (const file of archiveFiles.slice(0, loadLimit)) {
      const origin: RowOrigin = { kind: 'archive', fileName: file.fileName };
      const key = originKey(origin);
      if (loadedKeysRef.current.has(key)) continue;
      loadedKeysRef.current.add(key);
      // Eigenes catch pro Datei: eine ungefangene Rejection wuerde in einer
      // gemeinsamen Liste die ganze Ansicht leeren, waehrend fruehere
      // eingeklappte Sektionen nur sich selbst mitrissen.
      getArchiveTable(file.fileName)
        .then((data) => mergeFile(origin, data))
        .catch(() => setStatus(key, `Konnte ${file.fileName} nicht laden`));
    }
  }, [archiveFiles, loadLimit, mergeFile, setStatus]);

  const loadMore = useCallback(() => {
    setLoadLimit((n) => n + ARCHIVE_BATCH_SIZE);
  }, []);

  /**
   * Fuer den Herkunftsmarker im Grid. Bewusst ein Praedikat und kein
   * Herkunftsobjekt: das Grid soll nie einen Archivdateinamen sehen, damit er
   * gar nicht in den Render-Baum gelangen kann.
   *
   * rows als Dependency, obwohl die Funktion nur die Ref liest: die Identitaet
   * muss sich aendern, sobald neue Zeilen dazukommen, sonst zeichnet ein
   * memoisiertes Grid den Marker der neuen Zeilen nicht neu.
   */
  const isLiveRow = useCallback(
    (rowId: string) => isLiveRowId(rowId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, isLiveRowId],
  );

  /**
   * Ein Eintrag fuer die StatusBar statt einem pro Datei. Die Reihenfolge ist
   * bewusst gewaehlt: die Ablehnungsmeldung steht weit oben, weil sie die
   * einzige umsetzbare Meldung ist und Zeile plus Spalte nennt.
   */
  const saveStatus = useMemo(() => {
    const values = [...statusByKey.values()];
    if (values.some((v) => v.startsWith('speichert'))) return 'speichert…';
    const blocked = values.filter((v) => v.includes('Nicht pseudonymisierbar'));
    if (blocked.length > 0) return blocked[0];
    if (dirtyCount > 0) {
      return `Ungespeicherte Änderungen… (${dirtyCount} ${dirtyCount === 1 ? 'Datei' : 'Dateien'})`;
    }
    const failed = values.filter((v) => v.startsWith('Fehler') || v.startsWith('Konnte'));
    if (failed.length > 0) return failed[0];
    const saved = values.filter((v) => v.startsWith('Gespeichert')).sort();
    return saved.length > 0 ? saved[saved.length - 1] : 'Bereit';
  }, [statusByKey, dirtyCount]);

  const problems = useMemo(
    () =>
      [...statusByKey.values()].filter(
        (v) => v.includes('Nicht pseudonymisierbar') || v.startsWith('Konnte'),
      ),
    [statusByKey],
  );

  const pendingFileCount = Math.max(0, archiveFiles.length - loadLimit);

  return {
    rows,
    saveStatus,
    problems,
    pendingFileCount,
    loadMore,
    isLiveRow,
    setCell,
    insertRow,
    deleteRow,
    saveNow: doSave,
  };
}
