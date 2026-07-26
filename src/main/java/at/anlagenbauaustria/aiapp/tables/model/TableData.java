package at.anlagenbauaustria.aiapp.tables.model;

import java.util.List;

public record TableData(
        String tableId,
        List<TableRow> rows
) {}
