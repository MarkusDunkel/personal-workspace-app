import { useEffect } from 'react';
import type { TableDefinition } from '../api/tableTypes';
import { useTableData } from '../hooks/useTableData';
import { DataGrid } from './DataGrid';

interface TableSectionProps {
  definition: TableDefinition;
  contacts: string[];
  onStatusChange: (status: { label: string; saveStatus: string; rowCount: number }) => void;
}

export function TableSection({ definition, contacts, onStatusChange }: TableSectionProps) {
  const table = useTableData(definition.id);

  useEffect(() => {
    onStatusChange({ label: definition.label, saveStatus: table.saveStatus, rowCount: table.rows.length });
  }, [definition.label, table.saveStatus, table.rows.length, onStatusChange]);

  return (
    <section className="table-section">
      <header className="table-section-header">
        <h2>{definition.label}</h2>
        <span className="table-section-count">{table.rows.length} Zeilen</span>
      </header>
      <DataGrid
        definition={definition}
        rows={table.rows}
        onCellCommit={table.setCell}
        onAddRow={table.addRow}
        onDeleteRow={table.deleteRow}
        onReorderRow={table.reorderRow}
        contacts={contacts}
      />
    </section>
  );
}
