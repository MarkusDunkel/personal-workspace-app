import type { TableData, TableDefinition } from './tableTypes';

export async function getTableDefinitions(): Promise<TableDefinition[]> {
  const res = await fetch('/api/tables');
  if (!res.ok) throw new Error(`GET /api/tables failed: ${res.status}`);
  return res.json();
}

export async function getTable(tableId: string): Promise<TableData> {
  const res = await fetch(`/api/tables/${tableId}`);
  if (!res.ok) throw new Error(`GET /api/tables/${tableId} failed: ${res.status}`);
  return res.json();
}

export async function putTable(tableId: string, data: TableData): Promise<void> {
  const res = await fetch(`/api/tables/${tableId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT /api/tables/${tableId} failed: ${res.status}`);
}
