package at.anlagenbauaustria.aiapp.notes.model;

import java.util.List;

/**
 * Eine einzelne Informationseinheit (Konzept Kapitel 7/13) - entsteht aus
 * genau einer geparsten Zeile (plus etwaigen Fortsetzungszeilen, Kapitel
 * 10.6) oder, bei einem zweiten Typ-Praefix in einem spaeteren Segment, als
 * verknuepfte Zweiteinheit (Beispiel 19 im Konzept).
 * <p>
 * status/history/id werden hier bewusst nicht gefuehrt: der Parser
 * (NoteSyntaxParser) erzeugt nur die aus der reinen Syntax ableitbaren
 * Felder. Pipeline-Status, IDs und History entstehen erst beim Ingest-Lauf
 * (Python, 01_parse) bzw. beim Persistieren durch NoteFileService.
 */
public record Note(
        NoteType type,
        String source,
        boolean sourceForced,
        String text,
        String due,
        String dueRaw,
        Priority priority,
        String project,
        String assignee,
        List<String> tags,
        boolean confidential,
        boolean done,
        String fileRef,
        List<Warning> warnings,
        Note linkedFollowUp
) {
}
