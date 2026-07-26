package at.anlagenbauaustria.aiapp.tables.model;

public record ColumnDefinition(
        String id,
        String label,
        ColumnType type
) {}
