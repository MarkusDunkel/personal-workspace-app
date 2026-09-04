package at.anlagenbauaustria.aiapp.notes.archive.model;

/**
 * Kopfzeilen-Information einer abgelegten Notiz. rowCount kommt mit, damit
 * die Oberflaeche die Zeilenanzahl anzeigen kann, ohne die Datei aufklappen
 * (und laden) zu muessen.
 */
public record ArchiveFileInfo(String fileName, String timestamp, int rowCount) {}
