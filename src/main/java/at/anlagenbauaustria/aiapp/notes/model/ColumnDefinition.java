package at.anlagenbauaustria.aiapp.notes.model;

public record ColumnDefinition(
        String id,
        String label,
        ColumnType type
) {}
