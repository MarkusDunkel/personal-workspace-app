import type { TableData, TableDefinition } from './noteTypes';

export async function getTableDefinitions(): Promise<TableDefinition[]> {
  const res = await fetch('/api/notes');
  if (!res.ok) throw new Error(`GET /api/notes failed: ${res.status}`);
  return res.json();
}

export async function getTable(tableId: string): Promise<TableData> {
  const res = await fetch(`/api/notes/${tableId}`);
  if (!res.ok) throw new Error(`GET /api/notes/${tableId} failed: ${res.status}`);
  return res.json();
}

export async function putTable(tableId: string, data: TableData): Promise<void> {
  const res = await fetch(`/api/notes/${tableId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT /api/notes/${tableId} failed: ${res.status}`);
}
