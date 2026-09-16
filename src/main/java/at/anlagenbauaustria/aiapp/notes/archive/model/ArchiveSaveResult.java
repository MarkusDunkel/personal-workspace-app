package at.anlagenbauaustria.aiapp.notes.archive.model;

import java.util.List;

/**
 * Ergebnis eines Archiv-Schreibvorgangs.
 *
 * Kommt dieses Objekt zurueck, ist die Datei IMMER geschrieben -
 * unmappedNames ist ein Hinweis, keine Ablehnung (siehe
 * NoteArchiveService.write fuer die Begruendung).
 *
 * Wrapper-Record statt einer nackten Liste: die Antwort bleibt ein
 * JSON-Objekt wie alle uebrigen im Repo und ist ohne Bruch erweiterbar.
 */
public record ArchiveSaveResult(List<UnmappedName> unmappedNames) {}
