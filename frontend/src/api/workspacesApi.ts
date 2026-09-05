import type { WorkspaceDocument, WorkspaceInfo } from './workspaceTypes';

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  const res = await fetch('/api/workspaces');
  if (!res.ok) throw new Error(`GET /api/workspaces failed: ${res.status}`);
  return res.json();
}

export async function getWorkspace(name: string): Promise<WorkspaceDocument> {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`GET /api/workspaces/${name} failed: ${res.status}`);
  return res.json();
}

export async function putWorkspace(
  name: string,
  markdown: string,
  revision: string | null,
): Promise<void> {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, revision }),
  });
  if (res.ok) return;
  // 409 = die Datei wurde seit dem Laden von aussen geaendert, in der Regel
  // durch VS Code. Die Servermeldung sagt dem Nutzer, was zu tun ist, und
  // muss ihn daher erreichen - dasselbe Muster wie bei
  // ArchiveSaveRejectedError in notesApi.ts.
  if (res.status === 409) {
    throw new WorkspaceConflictError(await readProblemMessage(res));
  }
  throw new Error(`PUT /api/workspaces/${name} failed: ${res.status}`);
}

export class WorkspaceConflictError extends Error {}

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
