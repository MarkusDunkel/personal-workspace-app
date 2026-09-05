// Mirrors at.anlagenbauaustria.aiapp.notes.model.ColumnType
export type ColumnType = 'TEXT' | 'DATE' | 'PERSON' | 'TYP';

// Mirrors at.anlagenbauaustria.aiapp.notes.model.ColumnDefinition
export interface ColumnDefinition {
  id: string;
  label: string;
  type: ColumnType;
}

// Mirrors at.anlagenbauaustria.aiapp.notes.model.NoteTableDefinition
export interface TableDefinition {
  id: string;
  label: string;
  typColumn: ColumnDefinition;
  typValues: string[];
  columnsByTyp: Record<string, ColumnDefinition[]>;
}

// Mirrors at.anlagenbauaustria.aiapp.notes.model.NoteTableRow
export interface TableRow {
  id: string;
  cells: Record<string, string | null>;
  order: number;
}

// Mirrors at.anlagenbauaustria.aiapp.notes.model.NoteTableData
export interface TableData {
  tableId: string;
  rows: TableRow[];
}

/**
 * Herkunftsdatei einer Zeile. 'live' = 0_sources/notes/notes.json (die
 * laufende Notiz), 'archive' = eine abgelegte Notiz in 2_ai-ready/notes.
 * Beide erscheinen in EINER Liste (siehe useMergedNoteData), muessen aber
 * beim Speichern an unterschiedliche Endpunkte zurueckgehen.
 *
 * Bewusst NICHT Teil von TableRow: TableRow spiegelt den Java-Record
 * NoteTableRow und wird beim Speichern unveraendert serialisiert - ein
 * zusaetzliches Feld landete damit in der Datei bzw. in der KI-Zone. Die
 * Herkunft lebt daher in einer parallelen Map<rowId, RowOrigin>; die Objekte,
 * die zum Server gehen, sind genau die, die von dort kamen.
 */
export type RowOrigin =
  | { kind: 'live'; tableId: string }
  | { kind: 'archive'; fileName: string };

// Mirrors at.anlagenbauaustria.aiapp.notes.archive.model.ArchiveFileInfo
export interface ArchiveFileInfo {
  fileName: string;
  timestamp: string;
  rowCount: number;
}
