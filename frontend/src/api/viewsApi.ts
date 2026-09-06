import type { ViewId, ViewInfo, ViewRefreshResult } from './viewsTypes';

export async function listViews(): Promise<ViewInfo[]> {
  const res = await fetch('/api/views');
  if (!res.ok) throw new Error(`GET /api/views failed: ${res.status}`);
  return res.json();
}

export async function refreshView(id: ViewId): Promise<ViewRefreshResult> {
  const res = await fetch(`/api/views/refresh/${encodeURIComponent(id)}`, { method: 'POST' });
  const body = await res.json();
  if (!res.ok && !body?.error) {
    throw new Error(`POST /api/views/refresh/${id} failed: ${res.status}`);
  }
  return body;
}

/**
 * Adresse der HTML-Datei fuer das iframe - bewusst KEIN fetch.
 *
 * Die Seite wird vom Browser selbst geladen (src), nicht von uns eingelesen
 * und per srcdoc eingesetzt: es sind in sich geschlossene Dokumente von 0,7
 * bis 1,3 MB mit eingebettetem vis.js/Plotly. Ueber JS eingelesen waeren sie
 * unnoetig teuer, und das Attribut-Escaping eines Dokuments mit eigenen
 * <script>-Bloecken ist fehleranfaellig. Ueber src laufen sie in einem
 * normalen, gleichnamigen Ursprung - genau wie beim direkten Oeffnen der Datei.
 *
 * cacheBust wird nach jedem erfolgreichen Neuerzeugen hochgezaehlt. Der
 * Server schickt zwar no-store, aber iframes sind die zuverlaessigste Stelle,
 * an der Browser-Caching doch noch zuschlaegt.
 */
export function viewHtmlUrl(id: ViewId, cacheBust: number = 0): string {
  const base = `/api/views/html/${encodeURIComponent(id)}`;
  return cacheBust > 0 ? `${base}?t=${cacheBust}` : base;
}
