import { useEffect, useState } from 'react';
import type { TableDefinition, TableRow } from '../api/noteTypes';
import { useNoteTableData } from '../hooks/useNoteTableData';
import { DataGrid } from './DataGrid';
import { LabeledAutocompleteInput } from './LabeledAutocompleteInput';

interface NoteSectionProps {
  definition: TableDefinition;
  contacts: string[];
  projekte: string[];
  meetings: string[];
  currentProjekt: string;
  currentMeeting: string;
  reloadToken: number;
  onStatusChange: (status: { label: string; saveStatus: string; rowCount: number }) => void;
}

export function NoteSection({
  definition,
  contacts,
  projekte,
  meetings,
  currentProjekt,
  currentMeeting,
  reloadToken,
  onStatusChange,
}: NoteSectionProps) {
  const table = useNoteTableData(definition.id, reloadToken);
  const [focusedRow, setFocusedRow] = useState<TableRow | null>(null);

  useEffect(() => {
    onStatusChange({ label: definition.label, saveStatus: table.saveStatus, rowCount: table.rows.length });
  }, [definition.label, table.saveStatus, table.rows.length, onStatusChange]);

  const addRowWithDefaultTyp = () => {
    const defaultTyp = definition.typValues[0];
    // Datum/Personen-Spalten werden von der letzten Zeile DESSELBEN Typs
    // vorbelegt (nicht zwingend der unmittelbar vorherigen Zeile in der
    // Tabelle) - erspart wiederholtes Eintippen bei Folgeeintraegen mit
    // denselben Beteiligten/Terminen. Gibt es keine solche Zeile, bleiben
    // die Felder leer.
    const previousOfSameTyp = [...table.rows]
      .reverse()
      .find((r) => r.cells[definition.typColumn.id] === defaultTyp);

    table.addRow({
      [definition.typColumn.id]: defaultTyp,
      projekt: currentProjekt || null,
      meeting: currentMeeting || null,
      ...(previousOfSameTyp
        ? {
            bis: previousOfSameTyp.cells.bis ?? null,
            von: previousOfSameTyp.cells.von ?? null,
            an: previousOfSameTyp.cells.an ?? null,
            quelle: previousOfSameTyp.cells.quelle ?? null,
          }
        : {}),
    });
  };

  return (
    <section className="table-section">
      <div className="focused-row-fields">
        <LabeledAutocompleteInput
          label="Projekt (Zeile)"
          value={focusedRow?.cells.projekt ?? ''}
          onCommit={(v) => focusedRow && table.setCell(focusedRow.id, 'projekt', v)}
          suggestions={projekte}
          allowFreeText={false}
          disabled={!focusedRow}
        />
        <LabeledAutocompleteInput
          label="Meeting (Zeile)"
          value={focusedRow?.cells.meeting ?? ''}
          onCommit={(v) => focusedRow && table.setCell(focusedRow.id, 'meeting', v)}
          suggestions={meetings}
          allowFreeText={false}
          disabled={!focusedRow}
        />
      </div>
      <div className="data-grid-scroll">
        <DataGrid
          definition={definition}
          rows={table.rows}
          onCellCommit={table.setCell}
          onAddRow={addRowWithDefaultTyp}
          onDeleteRow={table.deleteRow}
          onReorderRow={table.reorderRow}
          onFocusedRowChange={setFocusedRow}
          contacts={contacts}
        />
      </div>
    </section>
  );
}
