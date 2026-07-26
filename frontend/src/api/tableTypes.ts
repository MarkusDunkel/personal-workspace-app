// Mirrors at.anlagenbauaustria.aiapp.tables.model.ColumnType
export type ColumnType = 'TEXT' | 'DATE' | 'PERSON';

// Mirrors at.anlagenbauaustria.aiapp.tables.model.ColumnDefinition
export interface ColumnDefinition {
  id: string;
  label: string;
  type: ColumnType;
}

// Mirrors at.anlagenbauaustria.aiapp.tables.model.TableDefinition
export interface TableDefinition {
  id: string;
  label: string;
  columns: ColumnDefinition[];
}

// Mirrors at.anlagenbauaustria.aiapp.tables.model.TableRow
export interface TableRow {
  id: string;
  cells: Record<string, string | null>;
  order: number;
}

// Mirrors at.anlagenbauaustria.aiapp.tables.model.TableData
export interface TableData {
  tableId: string;
  rows: TableRow[];
}
