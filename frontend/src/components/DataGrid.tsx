import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { ColumnDefinition, TableDefinition, TableRow } from '../api/noteTypes';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { Cell } from './Cell';

interface DataGridProps {
  definition: TableDefinition;
  rows: TableRow[];
  onCellCommit: (rowId: string, columnId: string, value: string | null) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onReorderRow: (rowId: string, newIndex: number) => void;
  onFocusedRowChange?: (row: TableRow | null) => void;
  contacts: string[];
}

function columnsForRow(definition: TableDefinition, row: TableRow | undefined): ColumnDefinition[] {
  const typ = row?.cells[definition.typColumn.id];
  const variantColumns: ColumnDefinition[] = (typ ? definition.columnsByTyp[typ] : undefined) ?? [];
  return [definition.typColumn, ...variantColumns];
}

export function DataGrid({
  definition,
  rows,
  onCellCommit,
  onAddRow,
  onDeleteRow,
  onReorderRow,
  onFocusedRowChange,
  contacts,
}: DataGridProps) {
  const cellRefs = useRef<Map<string, HTMLDivElement | HTMLButtonElement>>(new Map());
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const getColCountForRow = (row: number) => columnsForRow(definition, rows[row]).length;

  const nav = useGridNavigation(rows.length, getColCountForRow, {
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
    // rows als Dependency: nach einem moveDown()/moveTab() ueber die letzte
    // Zeile hinaus (neue Zeile wird angelegt) steht nav.focused schon auf
    // der neuen Position, WAEHREND rows die neue Zeile in diesem Render-
    // Zyklus noch nicht enthaelt - ohne rows hier wuerde dieser Effect kein
    // zweites Mal laufen, sobald die neue Zeile tatsaechlich erscheint, und
    // der Fokus ginge sichtbar verloren (siehe DataGrid.tsx-Bug: doppeltes
    // Enter in der letzten Zeile legte zwar eine Zeile an, fokussierte sie
    // aber nie).
  }, [nav.focused, nav.editing, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (nav.editing) return;
    const column = columnsForRow(definition, rows[nav.focused.row])[nav.focused.col];
    if (column?.label === 'Inhalt') {
      // Bewusst OHNE Klickposition: dieser Effect ist der automatische
      // "sofort tippen koennen"-Trigger, der bei JEDEM Fokuswechsel auf eine
      // "Inhalt"-Zelle greift - egal ob per Klick, Pfeiltaste, Tab oder
      // Enter. Der Cursor soll dabei immer ans Textende springen (direkt
      // weiterschreiben), niemals an eine Klickposition - eine praezise
      // Zielposition liefert ausschliesslich der explizite
      // onDoubleClick-Handler unten, der seine eigene, frische Koordinate
      // hat.
      nav.startEditing();
    }
    // rows als Dependency aus demselben Grund wie im Effect oben - siehe
    // Kommentar dort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.focused, nav.editing, rows]);

  useEffect(() => {
    onFocusedRowChange?.(rows[nav.focused.row] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.focused.row, rows]);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>, row: number, col: number, columns: ColumnDefinition[]) => {
    if (nav.editing) {
      nav.handleKeyDown(e);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && rows[row] && columns[col]) {
      e.preventDefault();
      onCellCommit(rows[row].id, columns[col].id, null);
      return;
    }
    nav.handleKeyDown(e);
  };

  return (
    <div className="data-grid" role="table">
      {rows.length === 0 ? (
        <div
          className="data-grid-empty"
          role="row"
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
        </div>
      ) : (
        rows.map((row, rowIndex) => {
          const columns = columnsForRow(definition, row);
          return (
            <div
              key={row.id}
              role="row"
              className={`data-grid-row${dragOverIndex === rowIndex ? ' drag-over' : ''}`}
              onDragOver={(e: DragEvent<HTMLDivElement>) => {
                if (!dragRowId) return;
                e.preventDefault();
                setDragOverIndex(rowIndex);
              }}
              onDrop={(e: DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                if (dragRowId) onReorderRow(dragRowId, rowIndex);
                setDragRowId(null);
                setDragOverIndex(null);
              }}
            >
              <div className="data-grid-grip-col">
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
              </div>
              {columns.map((col, colIndex) => {
                const isFocused = nav.focused.row === rowIndex && nav.focused.col === colIndex;
                const isEditing = isFocused && nav.editing;
                return (
                  <div
                    key={col.id}
                    role="cell"
                    ref={(el) => {
                      if (el) cellRefs.current.set(`${rowIndex}:${colIndex}`, el);
                      else cellRefs.current.delete(`${rowIndex}:${colIndex}`);
                    }}
                    tabIndex={isFocused ? 0 : -1}
                    className={`data-grid-cell data-grid-cell--${col.id}${isFocused ? ' focused' : ''}${isEditing ? ' editing' : ''}`}
                    onMouseDown={() => {
                      // Bewusst hier statt in onClick: mousedown feuert VOR
                      // dem blur der zuvor editierten Zelle, dessen commit()
                      // einen Rerender ausloest, der das urspruengliche
                      // Klick-Ziel im DOM ersetzen kann - der nachfolgende
                      // "click" landet dann u.U. gar nicht mehr auf dieser
                      // Zelle, sondern bubbelt zu einem stabilen Vorfahren
                      // hoch (Symptom: Klick auf Zelle B fokussierte
                      // stattdessen wieder die zuvor editierte Zelle A).
                      // mousedown ist robust dagegen, weil es bereits laeuft,
                      // bevor der Blur-getriebene Rerender das Ziel veraendert.
                      nav.setFocused({ row: rowIndex, col: colIndex });
                    }}
                    onClick={() => {
                      focusCell(rowIndex, colIndex);
                    }}
                    onDoubleClick={() => {
                      nav.setFocused({ row: rowIndex, col: colIndex });
                      nav.startEditing();
                    }}
                    onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex, columns)}
                  >
                    <Cell
                      key={isEditing ? `editing-${nav.editSession}` : 'idle'}
                      column={col}
                      value={row.cells[col.id] ?? null}
                      focused={isFocused}
                      editing={isEditing}
                      initialChar={isEditing ? nav.initialChar : undefined}
                      contacts={contacts}
                      typValues={definition.typValues}
                      onCommit={(value) => {
                        onCellCommit(row.id, col.id, value);
                        nav.stopEditing(true);
                      }}
                      onCancelEdit={() => nav.stopEditing(false)}
                      onMoveUp={nav.moveUp}
                      onMoveDown={nav.moveDown}
                      onMoveHorizontal={nav.moveHorizontal}
                      onMoveTab={nav.moveTab}
                    />
                  </div>
                );
              })}
              <div className="data-grid-actions-col">
                <button
                  type="button"
                  className="row-delete-button"
                  title="Zeile löschen"
                  aria-label="Zeile löschen"
                  tabIndex={-1}
                  onClick={() => onDeleteRow(row.id)}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
