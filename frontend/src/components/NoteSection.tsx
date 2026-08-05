import { useEffect } from 'react';
import type { TableDefinition } from '../api/noteTypes';
import { useNoteTableData } from '../hooks/useNoteTableData';
import { DataGrid } from './DataGrid';

interface NoteSectionProps {
  definition: TableDefinition;
  contacts: string[];
  onStatusChange: (status: { label: string; saveStatus: string; rowCount: number }) => void;
}

export function NoteSection({ definition, contacts, onStatusChange }: NoteSectionProps) {
  const table = useNoteTableData(definition.id);

  useEffect(() => {
    onStatusChange({ label: definition.label, saveStatus: table.saveStatus, rowCount: table.rows.length });
  }, [definition.label, table.saveStatus, table.rows.length, onStatusChange]);

  const addRowWithDefaultTyp = () => {
    table.addRow({ [definition.typColumn.id]: definition.typValues[0] });
  };

  return (
    <section className="table-section">
      <DataGrid
        definition={definition}
        rows={table.rows}
        onCellCommit={table.setCell}
        onAddRow={addRowWithDefaultTyp}
        onDeleteRow={table.deleteRow}
        onReorderRow={table.reorderRow}
        contacts={contacts}
      />
    </section>
  );
}
