import type { ArchiveFileInfo, TableData, TableDefinition } from './noteTypes';

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

export async function listArchiveFiles(): Promise<ArchiveFileInfo[]> {
  const res = await fetch('/api/notes/archive');
  if (!res.ok) throw new Error(`GET /api/notes/archive failed: ${res.status}`);
  return res.json();
}

export async function getArchiveTable(fileName: string): Promise<TableData> {
  const res = await fetch(`/api/notes/archive/${encodeURIComponent(fileName)}`);
  if (!res.ok) throw new Error(`GET /api/notes/archive/${fileName} failed: ${res.status}`);
  return res.json();
}

export async function putArchiveTable(fileName: string, data: TableData): Promise<void> {
  const res = await fetch(`/api/notes/archive/${encodeURIComponent(fileName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (res.ok) return;
  // 409 = ein Name in einer Personenspalte fehlt im Register (siehe
  // NotPseudonymizableException). Die Servermeldung nennt Zeile und Spalte
  // und muss den Nutzer erreichen, statt als generischer Fehler zu enden.
  if (res.status === 409) {
    throw new ArchiveSaveRejectedError(await readProblemMessage(res));
  }
  throw new Error(`PUT /api/notes/archive/${fileName} failed: ${res.status}`);
}

export class ArchiveSaveRejectedError extends Error {}

async function readProblemMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.message === 'string' && body.message
      ? body.message
      : 'Speichern abgelehnt.';
  } catch {
    return 'Speichern abgelehnt.';
  }
}
