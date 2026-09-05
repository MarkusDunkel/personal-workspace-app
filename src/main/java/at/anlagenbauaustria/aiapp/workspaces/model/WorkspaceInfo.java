package at.anlagenbauaustria.aiapp.workspaces.model;

/**
 * Kopfzeile eines Workspace-Dokuments fuer die Auswahlliste.
 *
 * name ist der Dateiname OHNE ".md" - genau der Wert, der als Pfadvariable
 * zurueckkommt (siehe WorkspaceController).
 *
 * Bewusst ohne "Anzahl Kommentare": das wuerde jede Datei beim Auflisten
 * komplett lesen und tokenisieren. NoteArchiveService.countRows() macht genau
 * das und ist dort ein bekanntes N+1 - fuer eine Auswahlliste ist die Angabe
 * ihren Preis nicht wert.
 */
public record WorkspaceInfo(String name, String title, String lastModified) {}
