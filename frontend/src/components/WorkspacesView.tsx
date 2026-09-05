import type { WorkspaceInfo } from '../api/workspaceTypes';
import { WorkspaceEditor } from './WorkspaceEditor';

interface WorkspacesViewProps {
  workspaces: WorkspaceInfo[];
  /** Wurde die Liste bereits geladen? Trennt "laedt" von "leer". */
  workspacesLoaded: boolean;
  activeWorkspace: string | null;
  /** Fuer den Klarnamen-Hinweis beim Kommentieren. */
  contacts: string[];
}

/**
 * Die Workspaces-Ansicht: ein Arbeitsdokument aus 2_ai-ready/workspaces
 * lesen, kommentieren und bearbeiten.
 *
 * Rendert ihr eigenes <main>, wie AzureBoardsView - anders als die
 * Notizansicht, deren <main className="tables-wrap"> in App.tsx liegt.
 *
 * Angelegt und aufgeloest werden Workspaces ausserhalb der App, per Befehl in
 * VS Code. Hier gibt es daher bewusst weder "Neu" noch "Loeschen".
 */
export function WorkspacesView({
  workspaces,
  workspacesLoaded,
  activeWorkspace,
  contacts,
}: WorkspacesViewProps) {
  if (!workspacesLoaded) {
    return (
      <main className="workspaces-view">
        <p className="loading-hint">Lade Workspaces…</p>
      </main>
    );
  }

  if (workspaces.length === 0) {
    return (
      <main className="workspaces-view">
        <div className="ws-empty">
          <p>Derzeit ist kein Workspace angelegt.</p>
          <p className="ws-empty-hint">
            Workspaces entstehen in VS Code und liegen als Markdown-Datei in{' '}
            <code>2_ai-ready/workspaces</code>.
          </p>
        </div>
      </main>
    );
  }

  const active = workspaces.find((w) => w.name === activeWorkspace);

  if (!active) {
    return (
      <main className="workspaces-view">
        <div className="ws-empty">
          <p>Bitte oben einen Workspace auswählen.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="workspaces-view">
      {/* key erzwingt einen Neuaufbau beim Dokumentwechsel: der Editor haelt
          Bearbeitungsstand und Modus, die beim Wechsel nicht mitwandern
          duerfen. Dasselbe Mittel wie beim Zell-Remount in DataGrid. */}
      <WorkspaceEditor
        key={active.name}
        name={active.name}
        title={active.title}
        contacts={contacts}
      />
    </main>
  );
}
