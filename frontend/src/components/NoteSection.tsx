import { useCallback, useEffect, useRef, useState } from 'react';
import type { TableDefinition, TableRow } from '../api/noteTypes';
import { useMergedNoteData } from '../hooks/useMergedNoteData';
import { useNoteViewFilters } from '../hooks/useNoteViewFilters';
import { DataGrid } from './DataGrid';
import { LabeledAutocompleteInput } from './LabeledAutocompleteInput';
import { NoteFilterBar } from './NoteFilterBar';

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

/**
 * Die gesamte Notiz-Ansicht: laufende Notiz und abgelegte Notizen in EINEM
 * Grid, neueste zuerst, mit Sortier- und Filterleiste darueber.
 *
 * Frueher gab es hier nur die laufende Notiz und daneben je eine
 * aufklappbare Sektion pro Archivdatei (jede mit eigenem Grid, eigenem
 * Autosave-Timer und eigener Statuszeile). Bei ueber 80 Zeilen in fuenf
 * Dateien liess sich so nicht beantworten, was offen ist oder was von wem
 * kam.
 */
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
  const table = useMergedNoteData(definition.id, reloadToken);
  const [focusedRow, setFocusedRow] = useState<TableRow | null>(null);
  const filters = useNoteViewFilters(definition, table.rows, projekte, meetings);

  useEffect(() => {
    onStatusChange({
      label: definition.label,
      saveStatus: table.saveStatus,
      rowCount: table.rows.length,
    });
  }, [definition.label, table.saveStatus, table.rows.length, onStatusChange]);

  /**
   * Nach einer Sortier- oder Filteraenderung ist die alte Scrollposition
   * bedeutungslos - die Liste kann von 80 auf 3 Zeilen schrumpfen. Also nach
   * oben scrollen.
   *
   * Bewusst getrennt vom Scroll-Erhalt in DataGrid (pendingScrollTopRef):
   * der stellt die Position ueber einen Zell-Remount hinweg WIEDER HER und
   * wuerde hier dagegen arbeiten. Der erste Durchlauf wird uebersprungen,
   * damit das Laden der Seite nicht als Filteraenderung zaehlt.
   */
  const lastFilterStateRef = useRef(filters.state);
  useEffect(() => {
    if (lastFilterStateRef.current === filters.state) return;
    lastFilterStateRef.current = filters.state;
    document.querySelector<HTMLElement>('.tables-wrap')?.scrollTo({ top: 0 });
  }, [filters.state]);

  const insertRow = useCallback(() => {
    const defaultTyp = definition.typValues[0];
    // Datum/Personen-Spalten werden von der letzten Zeile DESSELBEN Typs
    // vorbelegt (nicht zwingend der optisch benachbarten Zeile) - erspart
    // wiederholtes Eintippen bei Folgeeintraegen mit denselben
    // Beteiligten/Terminen. "Letzte" bezieht sich auf table.rows in
    // Ladereihenfolge, also auf die zuletzt ANGELEGTE Zeile - nicht auf die
    // Anzeigereihenfolge, die durch Sortierung beliebig sein kann.
    const previousOfSameTyp = [...table.rows]
      .reverse()
      .find((r) => r.cells[definition.typColumn.id] === defaultTyp);

    table.insertRow({
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
  }, [definition, table, currentProjekt, currentMeeting]);

  const handleCellCommit = useCallback(
    (rowId: string, columnId: string, value: string | null) => {
      table.setCell(rowId, columnId, value);
      // Haelt die Zeile sichtbar, falls die Aenderung sie aus dem aktiven
      // Filter faellt - sonst verschwindet sie unter dem Cursor.
      filters.keepVisible(rowId);
    },
    [table, filters],
  );

  return (
    <section className="table-section">
      <NoteFilterBar
        definition={definition}
        filters={filters}
        visibleCount={filters.visibleRows.length}
        totalCount={table.rows.length}
      />
      {table.problems.length > 0 && (
        <ul className="note-problems">
          {table.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <div className="focused-row-fields">
        <LabeledAutocompleteInput
          label="Projekt (Zeile)"
          value={focusedRow?.cells.projekt ?? ''}
          onCommit={(v) => focusedRow && table.setCell(focusedRow.id, 'projekt', v)}
          suggestions={projekte}
          allowFreeText
          disabled={!focusedRow}
        />
        <LabeledAutocompleteInput
          label="Meeting (Zeile)"
          value={focusedRow?.cells.meeting ?? ''}
          onCommit={(v) => focusedRow && table.setCell(focusedRow.id, 'meeting', v)}
          suggestions={meetings}
          allowFreeText
          disabled={!focusedRow}
        />
      </div>
      <div className="data-grid-scroll">
        <DataGrid
          definition={definition}
          rows={filters.visibleRows}
          onCellCommit={handleCellCommit}
          onInsertRow={insertRow}
          onDeleteRow={table.deleteRow}
          onFocusedRowChange={setFocusedRow}
          contacts={contacts}
          isLiveRow={table.isLiveRow}
          graceRowIds={filters.graceRowIds}
        />
      </div>
      {table.pendingFileCount > 0 && (
        <button type="button" className="note-load-more" onClick={table.loadMore}>
          Weitere abgelegte Notizen laden ({table.pendingFileCount})
        </button>
      )}
    </section>
  );
}
