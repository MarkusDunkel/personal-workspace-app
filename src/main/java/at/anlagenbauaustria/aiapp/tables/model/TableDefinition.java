package at.anlagenbauaustria.aiapp.tables.model;

import java.util.List;

public record TableDefinition(
        String id,
        String label,
        List<ColumnDefinition> columns
) {}
