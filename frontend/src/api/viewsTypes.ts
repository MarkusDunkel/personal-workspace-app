// Mirrors at.anlagenbauaustria.aiapp.views.model.*

export type ViewId = 'cockpit' | 'stakeholder' | 'costs';

export interface ViewInfo {
  id: ViewId;
  label: string;
  /** Wurde die Ansicht schon einmal erzeugt? Trennt "leer" von "fehlt". */
  available: boolean;
  /** Aenderungszeit der Ausgabedatei (ISO-8601) oder null. */
  generatedAt: string | null;
}

export interface ViewRefreshResult {
  success: boolean;
  /** ai-vault-relativer Pfad der erzeugten Datei. */
  outputPath: string | null;
  generatedAt: string | null;
  log: string | null;
  error: string | null;
}
