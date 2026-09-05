import { useCallback, useMemo, useRef, useState } from 'react';
import type { TableDefinition, TableRow } from '../api/noteTypes';
import {
  columnOwnerTyps,
  comparatorFor,
  isTypExclusive,
  type SortDirection,
} from '../utils/noteSort';

/**
 * Sortier- und Filterzustand der Notiz-Ansicht, plus die daraus abgeleitete
 * sichtbare Zeilenliste.
 *
 * Liegt bewusst hier und nicht in App: App besitzt currentProjekt/
 * currentMeeting, weil die TopBar sie schreibt und sie als Vorbelegung neuer
 * Zeilen dienen. Die FILTER sind ein anderes Anliegen (welche Zeilen sichtbar
 * sind) mit genau einem Konsumenten - in App wuerden sie TopBar und
 * AzureBoardsView bei jedem Tastendruck neu rendern.
 */

/**
 * Pseudowert fuer "Zelle ist leer". Ohne ihn liesse sich die wohl
 * nuetzlichste Abfrage ueber "Bis" gar nicht ausdruecken ("kein Termin
 * gesetzt") - allein in der laufenden Notiz hatten beim Einbau 24 von 29
 * Zeilen kein Bis-Datum. Die spitzen Klammern halten ihn von echten Werten
 * fern.
 */
export const EMPTY_VALUE = '‹leer›';

export interface NoteFilterState {
  /** null = Standardsortierung (created absteigend). */
  sort: { columnId: string; direction: SortDirection } | null;
  /**
   * Pro Spalte die AUSGEWAEHLTEN Werte. Fehlender Schluessel oder leeres Set
   * bedeutet "alle", NICHT "nichts": waeren alle Werte vorbelegt, wuerde
   * jeder neu eingetippte Wert (die Quelle-Spalte kennt Dutzende, staendig
   * kommen neue dazu) automatisch herausgefiltert.
   */
  columnValues: Record<string, Set<string>>;
  /** Projekt und Meeting sind keine Grid-Spalten, daher getrennt. */
  projekt: Set<string>;
  meeting: Set<string>;
  /**
   * Von einer Spaltenaktion erzwungene Typ-Einschraenkung, plus der
   * Ausloeser fuer die sichtbare Begruendung. Getrennt von
   * columnValues.typ gehalten, damit automatische Einschraenkung und
   * manuelle Auswahl unterscheidbar bleiben - nur so ist der Hinweis
   * erklaerbar und das Aufheben verlustfrei.
   */
  typScope: { typs: string[]; causedBy: string } | null;
}

const EMPTY_STATE: NoteFilterState = {
  sort: null,
  columnValues: {},
  projekt: new Set(),
  meeting: new Set(),
  typScope: null,
};

/** Spalten, die ueberhaupt gefiltert werden koennen. */
const FILTERABLE = ['typ', 'von', 'an', 'quelle', 'bis'] as const;

export interface UseNoteViewFilters {
  state: NoteFilterState;
  visibleRows: TableRow[];
  /** Zeilen, die nur noch aus Kulanz sichtbar sind (siehe keepVisible). */
  graceRowIds: ReadonlySet<string>;
  /** Welche Werte in einer Spalte ueberhaupt vorkommen, alphabetisch. */
  availableValues: (columnId: string) => string[];
  /** Ist irgendein Filter oder eine Sortierung aktiv? */
  isActive: boolean;
  /** Die aktuell wirksamen Typen - auch die vom Scope erzwungenen. */
  effectiveTyps: string[];
  toggleSort: (columnId: string) => void;
  setColumnValues: (columnId: string, values: Set<string>) => void;
  setProjektValues: (values: Set<string>) => void;
  setMeetingValues: (values: Set<string>) => void;
  clearTypScope: () => void;
  clearAll: () => void;
  /**
   * Haelt eine Zeile sichtbar, obwohl sie nicht mehr zum Filter passt. Wird
   * nach jeder echten Zellaenderung mit dem BEREITS geaenderten Stand der
   * Zeile aufgerufen; passt sie weiterhin zum Filter, passiert nichts.
   */
  keepVisible: (row: TableRow) => void;
}

export function useNoteViewFilters(
  definition: TableDefinition | undefined,
  rows: TableRow[],
  extraProjekte: string[],
  extraMeetings: string[],
): UseNoteViewFilters {
  const [state, setState] = useState<NoteFilterState>(EMPTY_STATE);

  /**
   * Zeilen, die durch eine Bearbeitung aus dem Filter gefallen sind, aber
   * stehen bleiben sollen. Ohne diese Kulanz verschwindet eine Zeile unter
   * dem Cursor, sobald man genau die Zelle aendert, von der der Filter
   * abhaengt (Filter "nur Aufgaben", dann Typ dieser Zeile auf Info) - die
   * Aenderung waere nicht mehr nachvollziehbar.
   *
   * Eine Ref plus Zaehler statt State: keepVisible wird aus dem
   * Commit-Pfad des Grids aufgerufen, wo ein zusaetzlicher Renderzyklus
   * zwischen Commit und Neuberechnung der sichtbaren Zeilen die Zeile
   * kurzzeitig verschwinden liesse.
   */
  const graceIdsRef = useRef<Set<string>>(new Set());
  const [graceVersion, setGraceVersion] = useState(0);

  const clearGrace = () => {
    if (graceIdsRef.current.size === 0) return;
    graceIdsRef.current = new Set();
    setGraceVersion((n) => n + 1);
  };

  const owners = useMemo(
    () => (definition ? columnOwnerTyps(definition) : new Map<string, string[]>()),
    [definition],
  );

  /**
   * Jede Sortier- oder Filteraktion auf einer typ-exklusiven Spalte
   * schraenkt automatisch auf die zugehoerigen Typen ein: nach "Bis"
   * sortieren heisst "nur Aufgaben", weil es Bis nur dort gibt.
   *
   * Die Spaltenaktion GEWINNT dabei gegen eine manuelle Typ-Auswahl. Die
   * Alternative waere, dass "sortiere nach Bis" bei manuell gewaehltem
   * Typ=Info eine garantiert leere Tabelle ergibt - nicht von einem Fehler
   * zu unterscheiden und ohne Handlungsmoeglichkeit. Die manuelle Auswahl
   * wird dabei NICHT geloescht, nur ueberstimmt: beim Aufheben des Scopes
   * kommt sie unveraendert zurueck.
   */
  const applyColumnAction = useCallback(
    (columnId: string, next: Partial<NoteFilterState>) => {
      clearGrace();
      setState((prev) => {
        if (!definition || !isTypExclusive(definition, columnId)) {
          return { ...prev, ...next };
        }
        return {
          ...prev,
          ...next,
          typScope: { typs: owners.get(columnId) ?? [], causedBy: columnId },
        };
      });
    },
    [definition, owners],
  );

  const toggleSort = useCallback(
    (columnId: string) => {
      setState((prev) => {
        // Dritter Klick hebt die Sortierung wieder auf - mit ihr auch die
        // dadurch erzwungene Typ-Einschraenkung, sonst bliebe eine
        // Einschraenkung ohne sichtbaren Ausloeser stehen.
        const current = prev.sort;
        let sort: NoteFilterState['sort'];
        if (current?.columnId !== columnId) sort = { columnId, direction: 'asc' };
        else if (current.direction === 'asc') sort = { columnId, direction: 'desc' };
        else sort = null;

        const scopeCausedByThis = prev.typScope?.causedBy === columnId;
        if (sort === null) {
          return { ...prev, sort: null, typScope: scopeCausedByThis ? null : prev.typScope };
        }
        if (!definition || !isTypExclusive(definition, columnId)) {
          return { ...prev, sort };
        }
        return { ...prev, sort, typScope: { typs: owners.get(columnId) ?? [], causedBy: columnId } };
      });
      clearGrace();
    },
    [definition, owners],
  );

  const setColumnValues = useCallback(
    (columnId: string, values: Set<string>) => {
      applyColumnAction(columnId, {
        columnValues: { ...state.columnValues, [columnId]: values },
      });
    },
    [applyColumnAction, state.columnValues],
  );

  const setProjektValues = useCallback((values: Set<string>) => {
    clearGrace();
    setState((prev) => ({ ...prev, projekt: values }));
  }, []);

  const setMeetingValues = useCallback((values: Set<string>) => {
    clearGrace();
    setState((prev) => ({ ...prev, meeting: values }));
  }, []);

  const clearTypScope = useCallback(() => {
    clearGrace();
    // Loescht NUR die Einschraenkung, nicht die Sortierung: nach dem
    // Aufheben erscheinen Info-Zeilen wieder, mit leerem Bis und zuletzt
    // sortiert. Das ist kohaerent und nicht destruktiv.
    setState((prev) => ({ ...prev, typScope: null }));
  }, []);

  const clearAll = useCallback(() => {
    clearGrace();
    setState(EMPTY_STATE);
  }, []);

  /**
   * Die tatsaechlich vorkommenden Werte je Spalte. Fuer die Typ-Spalte ist
   * die Definition maßgeblich (NoteRegistry ist die einzige Quelle), fuer
   * alle anderen die Daten - eine Person, die nur in einer alten Notiz
   * vorkommt, muss filterbar sein, auch wenn sie in keiner Vorschlagsliste
   * mehr steht.
   */
  const valuesByColumn = useMemo(() => {
    const acc = new Map<string, Set<string>>();
    for (const id of [...FILTERABLE, 'projekt', 'meeting']) {
      acc.set(id, new Set<string>());
    }
    for (const row of rows) {
      for (const [id, values] of acc) {
        const value = row.cells[id];
        values.add(value ? value : EMPTY_VALUE);
      }
    }
    if (definition) acc.set('typ', new Set(definition.typValues));
    for (const p of extraProjekte) acc.get('projekt')?.add(p);
    for (const m of extraMeetings) acc.get('meeting')?.add(m);
    return acc;
  }, [rows, definition, extraProjekte, extraMeetings]);

  const availableValues = useCallback(
    (columnId: string) => {
      const values = [...(valuesByColumn.get(columnId) ?? [])];
      const hasEmpty = values.includes(EMPTY_VALUE);
      const sorted = values
        .filter((v) => v !== EMPTY_VALUE)
        .sort((a, b) => a.localeCompare(b, 'de-AT', { sensitivity: 'base', numeric: true }));
      // Der Leer-Pseudowert steht immer am Ende, damit die echten Werte
      // vorne stehen.
      return hasEmpty ? [...sorted, EMPTY_VALUE] : sorted;
    },
    [valuesByColumn],
  );

  const effectiveTyps = useMemo(() => {
    if (!definition) return [];
    if (state.typScope) return state.typScope.typs;
    const manual = state.columnValues.typ;
    return manual && manual.size > 0 ? [...manual] : definition.typValues;
  }, [definition, state.typScope, state.columnValues]);

  /**
   * Passt die Zeile zum aktuellen Filter? Ausserhalb von visibleRows
   * definiert, weil keepVisible dieselbe Frage stellen muss.
   */
  const matchesFilter = useCallback(
    (row: TableRow): boolean => {
      const typSet = new Set(effectiveTyps);
      const restrictsTyp = definition ? typSet.size < definition.typValues.length : false;
      if (restrictsTyp) {
        const typ = row.cells[definition!.typColumn.id];
        if (!typ || !typSet.has(typ)) return false;
      }
      for (const columnId of FILTERABLE) {
        // Die Typ-Spalte ist ueber effectiveTyps schon behandelt - hier
        // erneut zu filtern wuerde die Ueberstimmung durch den Scope
        // aushebeln.
        if (columnId === 'typ') continue;
        const selected = state.columnValues[columnId];
        if (!selected || selected.size === 0) continue;
        const value = row.cells[columnId];
        if (!selected.has(value ? value : EMPTY_VALUE)) return false;
      }
      for (const [columnId, selected] of [
        ['projekt', state.projekt],
        ['meeting', state.meeting],
      ] as const) {
        if (selected.size === 0) continue;
        const value = row.cells[columnId];
        if (!selected.has(value ? value : EMPTY_VALUE)) return false;
      }
      return true;
    },
    [definition, effectiveTyps, state.columnValues, state.projekt, state.meeting],
  );

  /**
   * Nimmt die Zeile nur dann in die Kulanzmenge, wenn sie tatsaechlich nicht
   * mehr zum Filter passt. Ohne diese Pruefung landete JEDE bearbeitete
   * Zeile darin und wurde ausgegraut - auch bei voellig inaktivem Filter,
   * was wie "hier wurde etwas veraendert" aussah, obwohl die Ausgrauung nur
   * "passt nicht mehr zum Filter" bedeuten soll.
   *
   * Die Zeile wird als Objekt uebergeben und nicht per id nachgeschlagen:
   * der Aufrufer (NoteSection.handleCellCommit) kennt den frisch geaenderten
   * Stand, waehrend rows in diesem Renderzyklus noch den alten enthaelt -
   * ein Nachschlagen hier wuerde gegen den Zustand VOR der Aenderung pruefen
   * und die Zeile nie als herausgefallen erkennen.
   */
  const keepVisible = useCallback(
    (row: TableRow) => {
      if (graceIdsRef.current.has(row.id)) return;
      if (matchesFilter(row)) return;
      graceIdsRef.current = new Set(graceIdsRef.current).add(row.id);
      setGraceVersion((n) => n + 1);
    },
    [matchesFilter],
  );

  const visibleRows = useMemo(() => {
    const grace = graceIdsRef.current;
    return rows
      .filter((row) => matchesFilter(row) || grace.has(row.id))
      .sort(comparatorFor(state.sort));
    // graceVersion als Dependency: die Kulanzmenge liegt in einer Ref, ihre
    // Aenderung muss die Neuberechnung dennoch anstossen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state.sort, matchesFilter, graceVersion]);

  const isActive =
    state.sort !== null
    || state.typScope !== null
    || state.projekt.size > 0
    || state.meeting.size > 0
    || Object.values(state.columnValues).some((s) => s.size > 0);

  return {
    state,
    visibleRows,
    graceRowIds: graceIdsRef.current,
    availableValues,
    isActive,
    effectiveTyps,
    toggleSort,
    setColumnValues,
    setProjektValues,
    setMeetingValues,
    clearTypScope,
    clearAll,
    keepVisible,
  };
}
