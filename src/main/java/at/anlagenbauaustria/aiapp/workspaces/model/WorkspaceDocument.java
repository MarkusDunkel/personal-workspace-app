package at.anlagenbauaustria.aiapp.workspaces.model;

/**
 * Ein Workspace-Dokument mit seinem vollstaendigen Markdown-Inhalt.
 *
 * Der Inhalt reist als JSON-Feld, nicht als text/markdown-Body: die App
 * spricht durchgehend JSON (siehe NoteController, NoteArchiveController,
 * AzureBoardsController). Ein einzelner text/plain-Endpunkt braeuchte einen
 * eigenen Converter-Pfad und eine eigene Fehlerbehandlung, ohne etwas zu
 * gewinnen.
 *
 * revision ist ein OPAKER Aenderungsmarker - die App gibt ihn beim Speichern
 * unveraendert zurueck, damit der Dienst erkennt, ob die Datei
 * zwischenzeitlich von aussen (in der Regel VS Code) geaendert wurde. Bewusst
 * ein String und keine Zahl: die Implementierung kann damit ohne
 * API-Aenderung vom Zeitstempel auf einen Inhalts-Hash wechseln (siehe
 * WorkspaceService.revisionOf).
 */
public record WorkspaceDocument(String name, String markdown, String revision) {}
