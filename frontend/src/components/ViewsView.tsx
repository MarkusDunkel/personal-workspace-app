import { useState } from 'react';
import { viewHtmlUrl } from '../api/viewsApi';
import type { ViewId, ViewInfo } from '../api/viewsTypes';
import { useViewRefresh } from '../hooks/useViewRefresh';
import { SubmitProgressModal } from './submit/SubmitProgressModal';

interface ViewsViewProps {
  views: ViewInfo[];
  /** Wurde die Liste bereits geladen? Trennt "laedt" von "leer". */
  viewsLoaded: boolean;
  activeView: ViewId | null;
  /** Nach erfolgreichem Neuerzeugen: Stand/Verfuegbarkeit neu laden. */
  onViewsReload: () => void;
}

function formatStand(value: string | null): string {
  if (!value) return 'noch nie erzeugt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Die Ansichten: Cockpit, Stakeholder und Costs aus 5_output.
 *
 * Rendert ihr eigenes <main>, wie AzureBoardsView und WorkspacesView - anders
 * als die Notizansicht, deren <main> in App.tsx liegt.
 *
 * Die Seiten werden als iframe eingebunden, nicht in den React-DOM gehaengt:
 * es sind vollstaendige HTML-Dokumente mit eigenem <html>, eigenen Styles und
 * eingebettetem vis.js/Plotly. In die App injiziert wuerden sich Styles und
 * Skripte gegenseitig stoeren.
 *
 * Erzeugt werden sie ausschliesslich von den ai-vault-Skripten; hier gibt es
 * daher nur "Neu erzeugen" (Reidentifikation + Publish), kein Bearbeiten.
 */
export function ViewsView({ views, viewsLoaded, activeView, onViewsReload }: ViewsViewProps) {
  const refresh = useViewRefresh();
  // Zaehlt nach jedem erfolgreichen Lauf hoch und geht in die iframe-URL und
  // den key ein - erzwingt ein echtes Neuladen statt einer Cache-Anzeige.
  const [cacheBust, setCacheBust] = useState(0);

  if (!viewsLoaded) {
    return (
      <main className="views-view">
        <p className="loading-hint">Lade Ansichten…</p>
      </main>
    );
  }

  const active = views.find((v) => v.id === activeView);

  if (!active) {
    return (
      <main className="views-view">
        <div className="views-empty">
          <p>Bitte oben eine Ansicht auswählen.</p>
          <p className="views-empty-hint">
            Cockpit, Stakeholder und Costs entstehen aus den Azure-Boards-Daten in{' '}
            <code>2_ai-ready</code> und liegen als HTML in <code>5_output</code>.
          </p>
        </div>
      </main>
    );
  }

  const busy = refresh.phase === 'refreshing';

  const handleRefresh = async () => {
    const ok = await refresh.refresh(active.id);
    if (!ok) return;
    // Nur bei Erfolg neu laden - sonst ersetzte eine Fehlerseite den noch
    // gueltigen alten Stand.
    setCacheBust((n) => n + 1);
    onViewsReload();
  };

  return (
    <main className="views-view">
      <div className="views-header">
        <h2 className="views-title">{active.label}</h2>
        <span className="views-generated">Stand: {formatStand(active.generatedAt)}</span>
        <button
          type="button"
          className="views-refresh-button"
          disabled={busy}
          onClick={handleRefresh}
        >
          {busy ? 'Wird neu erzeugt…' : 'Neu erzeugen'}
        </button>
      </div>

      {busy && (
        // Der Hinweis auf die Dauer ist wichtig: die Reidentifikation startet
        // einen Prozess je Datei, ein stummer Dialog wirkt sonst wie ein Haenger.
        <SubmitProgressModal label="Reidentifiziert und erzeugt die Ansicht neu… (kann einige Minuten dauern)" />
      )}

      {refresh.phase === 'error' && (
        <p className="views-status views-status-error">{refresh.errorMessage}</p>
      )}

      {refresh.log && (
        <details className="views-log">
          <summary>Log anzeigen</summary>
          <pre>{refresh.log}</pre>
        </details>
      )}

      {active.available ? (
        <iframe
          key={`${active.id}-${cacheBust}`}
          className="views-frame"
          src={viewHtmlUrl(active.id, cacheBust)}
          title={active.label}
        />
      ) : (
        <div className="views-empty">
          <p>Diese Ansicht wurde noch nicht erzeugt.</p>
          <p className="views-empty-hint">
            „Neu erzeugen“ startet Reidentifikation und Aufbereitung aus{' '}
            <code>2_ai-ready</code>.
          </p>
        </div>
      )}
    </main>
  );
}
