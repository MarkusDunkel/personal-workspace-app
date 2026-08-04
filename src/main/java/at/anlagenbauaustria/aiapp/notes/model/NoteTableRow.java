package at.anlagenbauaustria.aiapp.notes.model;

import java.util.Map;

public record NoteTableRow(
        String id,
        Map<String, String> cells,
        int order
) {}
