import { useCallback, useEffect, useRef, useState } from 'react';
import { ArchiveSaveRejectedError, getTable, putTable } from '../api/notesApi';
import type { TableData, TableRow } from '../api/noteTypes';
import { useDebouncedCallback } from './useDebouncedCallback';

/**
 * Erlaubt es, dieselbe Lade-/Speicherlogik gegen eine andere Quelle laufen zu
 * lassen (siehe ArchiveNoteSection: abgelegte Notizen in 2_ai-ready). Bewusst
 * parametrisiert statt kopiert - dieser Hook traegt mehrere teuer erarbeitete
 * Bugfixes (Updater-Vertrag von mutateRows, Debounce plus Fallback-Intervall,
 * dirtyRef), die in einer Kopie stillschweigend auseinanderlaufen wuerden.
 */
export interface NoteTableIo {
  load: () => Promise<TableData>;
  save: (data: TableData) => Promise<void>;
}

export function useNoteTableData(tableId: string, reloadToken: number = 0, io?: NoteTableIo) {
  const [rows, setRowsState] = useState<TableRow[]>([]);
  const [saveStatus, setSaveStatus] = useState('Bereit');

  const dirtyRef = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const ioRef = useRef(io);
  ioRef.current = io;

  const doSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    setSaveStatus('speichert…');
    const data: TableData = { tableId, rows: rowsRef.current };
    try {
      await (ioRef.current ? ioRef.current.save(data) : putTable(tableId, data));
      dirtyRef.current = false;
      setSaveStatus('Gespeichert ' + new Date().toLocaleTimeString());
    } catch (err) {
      if (err instanceof ArchiveSaveRejectedError) {
        // Die Aenderung bleibt absichtlich "dirty": sie steht noch in der
        // Oberflaeche, wurde aber nicht geschrieben. Sobald der Name
        // korrigiert ist, greift der naechste Speicherversuch.
        setSaveStatus(err.message);
        return;
      }
      setSaveStatus(
        err instanceof TypeError ? 'Fehler beim Speichern (offline?)' : 'Fehler beim Speichern',
      );
    }
  }, [tableId]);

  const scheduleSave = useDebouncedCallback(doSave, 800);

  // mutateRows nimmt bewusst eine Updater-FUNKTION (wie setState selbst),
  // nicht ein fertiges Array: setCell (Text speichern) und addRow (neue
  // Zeile anlegen) koennen beide innerhalb desselben Tastendruck-Handlers
  // aufgerufen werden (z.B. Enter auf leerer Bullet-Zeile am Tabellenende -
  // committet zuerst den Text, ruft dann sofort onRequestAddRow auf). Ohne
  // Updater-Funktion wuerden beide Aufrufe denselben, zwischen den beiden
  // Aufrufen NICHT aktualisierten rowsRef.current-Stand lesen (die Ref wird
  // erst beim naechsten Render neu zugewiesen) - der zweite Aufruf haette
  // dann die Aenderung des ersten unwissentlich wieder verworfen (Symptom:
  // Text der letzten Zeile ging beim Anlegen der naechsten Zeile verloren).
  // React garantiert dagegen, dass Updater-Funktionen bei mehreren
  // aufeinanderfolgenden setState-Aufrufen im selben Tick nacheinander auf
  // dem jeweils schon aktualisierten Zwischenstand aufgerufen werden.
  const mutateRows = useCallback(
    (updater: (current: TableRow[]) => TableRow[]) => {
      setRowsState((current) => {
        const next = updater(current);
        rowsRef.current = next;
        return next;
      });
      dirtyRef.current = true;
      setSaveStatus('Ungespeicherte Änderungen…');
      scheduleSave();
    },
    [scheduleSave],
  );

  const setCell = useCallback(
    (rowId: string, columnId: string, value: string | null) => {
      mutateRows((current) =>
        current.map((r) =>
          r.id === rowId
            ? { ...r, cells: { ...r.cells, [columnId]: value, lastChanged: new Date().toISOString() } }
            : r,
        ),
      );
    },
    [mutateRows],
  );

  const addRow = useCallback(
    (initialCells?: Record<string, string | null>) => {
      const now = new Date().toISOString();
      const newRow: TableRow = {
        id: crypto.randomUUID(),
        cells: { ...initialCells, created: now, lastChanged: now },
        order: 0,
      };
      mutateRows((current) => {
        newRow.order = current.length;
        return [...current, newRow];
      });
      return newRow.id;
    },
    [mutateRows],
  );

  const deleteRow = useCallback(
    (rowId: string) => {
      mutateRows((current) => current.filter((r) => r.id !== rowId).map((r, i) => ({ ...r, order: i })));
    },
    [mutateRows],
  );

  const reorderRow = useCallback(
    (rowId: string, newIndex: number) => {
      mutateRows((current) => {
        const fromIndex = current.findIndex((r) => r.id === rowId);
        if (fromIndex === -1) return current;
        const withoutMoved = current.filter((r) => r.id !== rowId);
        const clampedIndex = Math.max(0, Math.min(newIndex, withoutMoved.length));
        const moved = current[fromIndex];
        const next = [...withoutMoved.slice(0, clampedIndex), moved, ...withoutMoved.slice(clampedIndex)];
        return next.map((r, i) => ({ ...r, order: i }));
      });
    },
    [mutateRows],
  );

  useEffect(() => {
    const id = window.setInterval(doSave, 30000);
    return () => window.clearInterval(id);
  }, [doSave]);

  useEffect(() => {
    (ioRef.current ? ioRef.current.load() : getTable(tableId))
      .then((data) => {
        setRowsState([...data.rows].sort((a, b) => a.order - b.order));
        dirtyRef.current = false;
      })
      .catch(() => setSaveStatus('Konnte Tabelle nicht laden'));
    // reloadToken erzwingt einen erneuten Ladevorgang (z.B. nach
    // erfolgreichem Absenden, wenn die Quelle serverseitig geleert wurde).
  }, [tableId, reloadToken]);

  return { rows, saveStatus, setCell, addRow, deleteRow, reorderRow, saveNow: doSave };
}
