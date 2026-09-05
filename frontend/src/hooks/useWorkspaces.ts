import { useEffect, useState } from 'react';
import { listWorkspaces } from '../api/workspacesApi';
import type { WorkspaceInfo } from '../api/workspaceTypes';

/**
 * Die Arbeitsdokumente in 2_ai-ready/workspaces, alphabetisch nach Titel -
 * sortiert wird serverseitig.
 *
 * reloadToken erlaubt ein erneutes Laden, wenn ausserhalb der App (in VS
 * Code) ein Workspace angelegt oder aufgeloest wurde. Anders als bei den
 * Notizen gibt es dafuer kein Ereignis in der App selbst; die Ansicht zaehlt
 * den Wert hoch, wenn der Nutzer die Liste bewusst aktualisiert.
 *
 * loaded trennt "noch nicht geladen" von "geladen und leer": eine leere
 * Liste ist der Normalfall (gerade kein Workspace aktiv) und darf nicht wie
 * ein Fehler aussehen - die Meldung "Keine Workspaces" darf erst danach
 * erscheinen.
 */
export function useWorkspaces(reloadToken: number = 0) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listWorkspaces()
      .then((files) => {
        if (cancelled) return;
        setWorkspaces(files);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setWorkspaces([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { workspaces, loaded };
}
