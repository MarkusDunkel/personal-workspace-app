package at.anlagenbauaustria.aiapp.workspaces.model;

/**
 * Request-Body zum Speichern. revision ist der Wert, den das GET geliefert
 * hat - weicht er vom aktuellen Stand der Datei ab, wird abgelehnt (siehe
 * WorkspaceConflictException).
 */
public record WorkspaceSaveRequest(String markdown, String revision) {}
