// Mirrors at.anlagenbauaustria.aiapp.workspaces.model.WorkspaceInfo
export interface WorkspaceInfo {
  /** Dateiname OHNE ".md" - genau der Wert fuer die Pfadvariable. */
  name: string;
  title: string;
  lastModified: string;
}

// Mirrors at.anlagenbauaustria.aiapp.workspaces.model.WorkspaceDocument
export interface WorkspaceDocument {
  name: string;
  markdown: string;
  /**
   * Opaker Aenderungsmarker. Wird beim Speichern unveraendert zurueckgeschickt,
   * damit der Server erkennt, ob die Datei zwischenzeitlich von aussen (VS
   * Code) geaendert wurde. Nie interpretieren - der Server kann das Format
   * jederzeit wechseln.
   */
  revision: string;
}
