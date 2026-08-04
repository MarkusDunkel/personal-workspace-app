package at.anlagenbauaustria.aiapp.notes.model;

import java.util.List;

public record NoteTableDefinition(
        String id,
        String label,
        List<ColumnDefinition> columns
) {}
