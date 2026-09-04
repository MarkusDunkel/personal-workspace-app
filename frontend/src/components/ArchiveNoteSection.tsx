import { useMemo } from 'react';
import { getArchiveTable, putArchiveTable } from '../api/notesApi';
import type { TableData, TableDefinition } from '../api/noteTypes';
import { useNoteTableData } from '../hooks/useNoteTableData';
import { DataGrid } from './DataGrid';

interface ArchiveNoteSectionProps {
  definition: TableDefinition;
  fileName: string;
  contacts: string[];
  onLeaveBottom?: () => void;
}

/**
 * Eine bereits abgesendete Notiz aus 2_ai-ready/notes. Bearbeitbar, aber ohne
 * Anlegen neuer Zeilen - neue Eintraege gehoeren immer in die laufende Notiz.
 *
 * Bewusst ohne die Projekt-/Meeting-Fokusfelder aus NoteSection: die speisen
 * die Vorschlagslisten, und abgelegte Notizen duerfen dort nichts eintragen.
 */
export function ArchiveNoteSection({
  definition,
  fileName,
  contacts,
  onLeaveBottom,
}: ArchiveNoteSectionProps) {
  const io = useMemo(
    () => ({
      load: () => getArchiveTable(fileName),
      save: (data: TableData) => putArchiveTable(fileName, data),
    }),
    [fileName],
  );

  const table = useNoteTableData(fileName, 0, io);

  return (
    <div className="archive-section">
      <p className="archive-hint">
        Personennamen kommen aus dem Register und werden beim Speichern wieder
        pseudonymisiert. Im Inhalt-Text werden neue, noch unbekannte Namen nicht
        erkannt.
      </p>
      <div className="data-grid-scroll">
        <DataGrid
          definition={definition}
          rows={table.rows}
          onCellCommit={table.setCell}
          onDeleteRow={table.deleteRow}
          onReorderRow={table.reorderRow}
          contacts={contacts}
          canAddRows={false}
          onLeaveBottom={onLeaveBottom}
        />
      </div>
      <p className="archive-status">{table.saveStatus}</p>
    </div>
  );
}
