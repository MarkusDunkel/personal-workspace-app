package at.anlagenbauaustria.aiapp.tables.model;

import java.util.Map;

public record TableRow(
        String id,
        Map<String, String> cells,
        int order
) {}
