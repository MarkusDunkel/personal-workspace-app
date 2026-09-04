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

// Mirrors at.anlagenbauaustria.aiapp.notes.archive.model.ArchiveFileInfo
export interface ArchiveFileInfo {
  fileName: string;
  timestamp: string;
  rowCount: number;
}
