package at.anlagenbauaustria.aiapp.notes.model;

import java.util.List;

public record NoteTableData(
        String tableId,
        List<NoteTableRow> rows
) {}
