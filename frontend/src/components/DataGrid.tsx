import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { TableDefinition, TableRow } from '../api/tableTypes';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { Cell } from './Cell';

interface DataGridProps {
  definition: TableDefinition;
  rows: TableRow[];
  onCellCommit: (rowId: string, columnId: string, value: string | null) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onReorderRow: (rowId: string, newIndex: number) => void;
  contacts: string[];
}

export function DataGrid({
  definition,
  rows,
  onCellCommit,
  onAddRow,
  onDeleteRow,
  onReorderRow,
  contacts,
}: DataGridProps) {
  const colCount = definition.columns.length;
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const nav = useGridNavigation(rows.length, colCount, {
    onRequestAddRow: onAddRow,
  });

  const focusCell = (row: number, col: number) => {
    const el = cellRefs.current.get(`${row}:${col}`);
    el?.focus();
  };

  useEffect(() => {
    if (!nav.editing) {
      focusCell(nav.focused.row, nav.focused.col);
    }
  }, [nav.focused, nav.editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e: KeyboardEvent<HTMLTableCellElement>, row: number, col: number) => {
    if (nav.editing) {
      nav.handleKeyDown(e);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && rows[row]) {
      e.preventDefault();
      onCellCommit(rows[row].id, definition.columns[col].id, null);
      return;
    }
    nav.handleKeyDown(e);
  };

  return (
    <table className="data-grid">
      <thead>
        <tr>
          <th className="data-grid-grip-col" aria-hidden="true" />
          {definition.columns.map((col) => (
            <th key={col.id}>{col.label}</th>
          ))}
          <th className="data-grid-actions-col" aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              className="data-grid-empty"
              colSpan={colCount + 2}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddRow();
                }
              }}
              onClick={onAddRow}
            >
              Noch keine Einträge – Eingabe zum Hinzufügen
            </td>
          </tr>
        ) : (
          rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              className={dragOverIndex === rowIndex ? 'drag-over' : undefined}
              onDragOver={(e: DragEvent<HTMLTableRowElement>) => {
                if (!dragRowId) return;
                e.preventDefault();
                setDragOverIndex(rowIndex);
              }}
              onDrop={(e: DragEvent<HTMLTableRowElement>) => {
                e.preventDefault();
                if (dragRowId) onReorderRow(dragRowId, rowIndex);
                setDragRowId(null);
                setDragOverIndex(null);
              }}
            >
              <td className="data-grid-grip-col">
                <span
                  className="row-grip"
                  draggable
                  title="Zeile ziehen zum Umsortieren"
                  aria-label="Zeile ziehen zum Umsortieren"
                  onDragStart={(e: DragEvent<HTMLSpanElement>) => {
                    e.dataTransfer.effectAllowed = 'move';
                    setDragRowId(row.id);
                  }}
                  onDragEnd={() => {
                    setDragRowId(null);
                    setDragOverIndex(null);
                  }}
                >
                  ⠿
                </span>
              </td>
              {definition.columns.map((col, colIndex) => {
                const isFocused = nav.focused.row === rowIndex && nav.focused.col === colIndex;
                const isEditing = isFocused && nav.editing;
                return (
                  <td
                    key={col.id}
                    ref={(el) => {
                      if (el) cellRefs.current.set(`${rowIndex}:${colIndex}`, el);
                      else cellRefs.current.delete(`${rowIndex}:${colIndex}`);
                    }}
                    tabIndex={isFocused ? 0 : -1}
                    className={`cell${isFocused ? ' focused' : ''}${isEditing ? ' editing' : ''}`}
                    onClick={() => {
                      nav.setFocused({ row: rowIndex, col: colIndex });
                      focusCell(rowIndex, colIndex);
                    }}
                    onDoubleClick={() => {
                      nav.setFocused({ row: rowIndex, col: colIndex });
                      nav.startEditing();
                    }}
                    onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                  >
                    <Cell
                      column={col}
                      value={row.cells[col.id] ?? null}
                      focused={isFocused}
                      editing={isEditing}
                      initialChar={isEditing ? nav.initialChar : undefined}
                      contacts={contacts}
                      onCommit={(value) => {
                        onCellCommit(row.id, col.id, value);
                        nav.stopEditing(true);
                      }}
                      onCancelEdit={() => nav.stopEditing(false)}
                    />
                  </td>
                );
              })}
              <td className="data-grid-actions-col">
                <button
                  type="button"
                  className="row-delete-button"
                  title="Zeile löschen"
                  aria-label="Zeile löschen"
                  onClick={() => onDeleteRow(row.id)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
