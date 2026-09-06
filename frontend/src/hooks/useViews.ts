import { useCallback, useEffect, useState } from 'react';
import { listViews } from '../api/viewsApi';
import type { ViewInfo } from '../api/viewsTypes';

/**
 * Die verfuegbaren Ansichten (Cockpit, Stakeholder, Costs) samt Stand.
 *
 * Die Liste selbst ist fest (sie kommt aus dem ViewKind-Enum im Backend) -
 * geladen wird sie trotzdem, weil "available" und "generatedAt" vom
 * Dateizustand in 5_output abhaengen und sich nach jedem Neuerzeugen aendern.
 * Genau dafuer gibt es reload().
 *
 * loaded trennt "noch nicht geladen" von "geladen": ohne das erschiene beim
 * Start kurz der Hinweis, es sei keine Ansicht erzeugt.
 */
export function useViews() {
  const [views, setViews] = useState<ViewInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listViews()
      .then((infos) => {
        if (cancelled) return;
        setViews(infos);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setViews([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return { views, loaded, reload };
}
