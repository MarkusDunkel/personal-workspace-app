package at.anlagenbauaustria.aiapp.notes.model;

import java.util.List;
import java.util.Map;

public record NoteTableDefinition(
        String id,
        String label,
        ColumnDefinition typColumn,
        List<String> typValues,
        Map<String, List<ColumnDefinition>> columnsByTyp
) {}
