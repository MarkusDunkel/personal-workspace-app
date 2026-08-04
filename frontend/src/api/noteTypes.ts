// Mirrors at.anlagenbauaustria.aiapp.notes.model.ColumnType
export type ColumnType = 'TEXT' | 'DATE' | 'PERSON';

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
  columns: ColumnDefinition[];
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
