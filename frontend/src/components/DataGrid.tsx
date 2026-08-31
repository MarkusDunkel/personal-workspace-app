import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { ColumnDefinition, TableDefinition, TableRow } from '../api/noteTypes';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { Cell } from './Cell';
import type { CellHandle } from './Cell';
import { improveCellText, IMPROVE_READABILITY_PROMPT_ID } from '../api/claudeApi';
import { toDisplayText, fromDisplayText } from '../utils/bulletText';

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
  const gridRootRef = useRef<HTMLDivElement>(null);
  // Zeigt immer auf die aktuell editierende Zellinstanz (oder null, wenn
  // keine Zelle editiert wird). Wird vor JEDEM Weg, eine Zelle zu verlassen,
  // aufgerufen (Klick auf andere Zelle, Magic-Button) - committet den
  // aktuellen Draft synchron, BEVOR der Rerender die editierende Instanz
  // unmountet (key={editing ? ... : 'idle'} unten). Ohne das ging der lokale
  // draft-State jeder Zelle beim Verlassen ohne echten DOM-blur verloren.
  const editingCellRef = useRef<CellHandle | null>(null);
  const commitEditingCell = () => editingCellRef.current?.commitPending();

  // Haelt die scrollTop-Position von .data-grid-scroll fest, direkt bevor
  // ein Klick/Doppelklick einen Fokus- oder Editier-Wechsel ausloest. Ein
  // solcher Wechsel laesst React die betroffene Zelle remounten (key
  // "idle" -> "editing-N" oder umgekehrt, siehe Cell key unten) - zwischen
  // dem Entfernen der alten Zellinstanz und dem Einfuegen der neuen aendert
  // sich kurzzeitig deren Layout-Hoehe (z.B. Anzeige-<div> vs. Textarea),
  // was die Gesamthoehe von .data-grid-scroll veraendert. Steht der
  // Container zu diesem Zeitpunkt bereits nahe seinem Scroll-Maximum,
  // klemmt der Browser scrollTop sofort auf das neue (kleinere) Maximum -
  // eine anschliessende Vergroesserung (z.B. durch BulletTextCells eigenes
  // resize()) stellt diese Position NICHT von selbst wieder her. Sichtbar
  // als Scroll-Sprung nach oben bei jedem Klick/Tastendruck, besonders in
  // der letzten Zeile. Der Wert wird hier - synchron vor dem Rerender -
  // gesichert und im useLayoutEffect unten, NACH dem vollstaendigen
  // Remount, zurueckgesetzt.
  const pendingScrollTopRef = useRef<number | null>(null);
  const saveScrollTop = () => {
    const scrollParent = gridRootRef.current?.closest<HTMLElement>('.data-grid-scroll');
    if (scrollParent) pendingScrollTopRef.current = scrollParent.scrollTop;
  };

  useLayoutEffect(() => {
    if (pendingScrollTopRef.current === null) return;
    const scrollParent = gridRootRef.current?.closest<HTMLElement>('.data-grid-scroll');
    if (scrollParent) scrollParent.scrollTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;
  });

  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [magicLoading, setMagicLoading] = useState<Set<string>>(new Set());
  const [magicError, setMagicError] = useState<{ key: string; message: string } | null>(null);
  const [magicUndo, setMagicUndo] = useState<Map<string, string | null>>(new Map());

  const getColCountForRow = (row: number) => columnsForRow(definition, rows[row]).length;

  const nav = useGridNavigation(rows.length, getColCountForRow, {
    onRequestAddRow: onAddRow,
  });

  const focusCell = (row: number, col: number) => {
    const el = cellRefs.current.get(`${row}:${col}`);
    // Bereits fokussiertes Element NICHT erneut fokussieren: ein erneutes
    // element.focus() auf dem schon aktiven Element scrollt den Browser-
    // Viewport neu zu dessen aktueller Position, sobald sich die Layout-
    // Hoehe irgendeiner ANDEREN Zeile aendert (z.B. weil eine
    // Magic-Button-Antwort dort mehr/weniger Zeilen erzeugt) - das
    // Symptom war ein sichtbarer Scroll-Sprung, obwohl die fokussierte
    // Zelle selbst gar nicht betroffen war.
    if (el && el !== document.activeElement) {
      el.focus();
    }
  };

  // Haelt fest, ob der Browser-Fokus GERADE (zuletzt bekannt) irgendwo im
  // Grid lag - im Gegensatz zu einem einmal gesetzten "war schon mal
  // fokussiert"-Flag wird dieser Wert bei JEDEM Fokuswechsel aktualisiert,
  // auch wenn der Fokus das Grid wieder verlaesst (z.B. Klick in ein Feld
  // ausserhalb des Grids wie "Projekt (Zeile)"/"Meeting (Zeile)" in
  // NoteSection.tsx). Das ist noetig, weil der Fokus-Reparatur-Effect unten
  // bei JEDER Aenderung von rows erneut laeuft - auch wenn diese Aenderung
  // ganz woanders ausgeloest wurde (z.B. table.setCell aus dem
  // Projekt-Feld). Ohne diese Live-Pruefung reisst der Effect den
  // DOM-Fokus aktiv zurueck ins Grid, WAEHREND der Nutzer bewusst in einem
  // Feld ausserhalb tippt - Symptom: eine im Projekt-Feld getroffene
  // Vorschlagsauswahl feuerte durch den zurueckgerissenen Fokus ein
  // natives blur auf dem Projekt-Input, dessen commit() den frisch
  // gesetzten Wert sofort wieder verwarf.
  //
  // focusin am document (statt onFocus direkt am Grid-Container) wird
  // bewusst verwendet, um JEDEN Fokuswechsel im gesamten Dokument zu sehen -
  // nicht nur den ersten. Bewusst NUR focusin, kein focusout: focusout
  // liefert zwar relatedTarget (das neu fokussierte Element), aber bei
  // einem Zell-Unmount (Escape/Commit auf einer editierenden Zelle) wirft
  // der Browser den Fokus zwischenzeitlich auf <body> - relatedTarget waere
  // dann body, also "ausserhalb des Grids", obwohl der nachfolgende
  // Fokus-Reparatur-Effect ihn im SELBEN Layout-Effect-Durchlauf wieder
  // zurueckholt. Ein focusout-Handler wuerde diesen technischen
  // Zwischenzustand faelschlich als "Nutzer hat das Grid bewusst verlassen"
  // werten. focusin allein reicht: jeder ECHTE Wechsel zu einem Element
  // ausserhalb des Grids (z.B. Klick ins Projekt-Feld) loest dort ein
  // eigenes focusin aus, das explizit "false" setzt.
  const focusInGridRef = useRef(false);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target;
      // Gegen den Grid-Root-Container pruefen (gridRootRef), NICHT gegen
      // die cellRefs-Map einzelner Zellen: waehrend eines Zell-Remounts
      // (Key-Wechsel idle -> editing-N, z.B. durch den Auto-Edit-Effect)
      // ruft React ref-Callbacks fuer die alten und neuen Elemente in einer
      // Reihenfolge auf, die cellRefs.current fuer einen kurzen Moment
      // unvollstaendig macht - ein focusin, das GENAU in diesem Moment auf
      // das frisch gemountete <input> feuert, saehe seine eigene Elternzelle
      // faelschlich als "nicht in cellRefs", da deren ref-Callback zu diesem
      // Zeitpunkt noch nicht (erneut) gelaufen war. Der Grid-Root-Container
      // wird dagegen nur einmal gemountet und bleibt stabil.
      focusInGridRef.current = target instanceof Node && !!gridRootRef.current?.contains(target);
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  useLayoutEffect(() => {
    if (nav.editing) return;
    // Nur fokussieren, wenn der Fokus zuletzt tatsaechlich im Grid lag -
    // sonst scrollt element.focus() den Browser-Viewport zu nav.focused
    // (Default {row:0, col:0}) und reisst die Ansicht an den Tabellenanfang,
    // obwohl der Nutzer gar keine Zelle angeklickt hat oder gerade bewusst
    // in einem Feld ausserhalb des Grids tippt (siehe Kommentar bei
    // focusInGridRef oben).
    if (focusInGridRef.current) {
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
    //
    // useLayoutEffect statt useEffect: laeuft synchron nach dem DOM-Update,
    // aber VOR dem Browser-Paint - verhindert ein sichtbares Aufblitzen von
    // "Grid ohne jeden Fokus", das mit useEffect (laeuft erst nach dem
    // naechsten Paint) kurz sichtbar waere.
  }, [nav.focused, nav.editing, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merkt sich, fuer welche Fokusposition der Auto-Edit-Effekt unten
  // zuletzt startEditing() ausgeloest hat. Ohne dieses Gedaechtnis wuerde
  // Escape (stopEditing(), OHNE die Fokusposition zu aendern) die Zelle
  // sofort wieder in den Editiermodus zurueckreissen: der Effect haengt an
  // nav.editing, und ein Wechsel von true -> false auf DERSELBEN Zelle
  // wuerde erneut greifen, weil sich column/row nicht geaendert haben. Mit
  // diesem Ref feuert startEditing() nur bei einem tatsaechlichen Wechsel
  // der Fokusposition - Escape laesst die Zelle danach im reinen
  // Anzeigemodus, so wie man es von Tabellenkalkulationen kennt.
  const autoEditedPosRef = useRef<string | null>(null);

  useEffect(() => {
    if (nav.editing) return;
    const posKey = `${nav.focused.row}:${nav.focused.col}`;
    if (autoEditedPosRef.current === posKey) return;
    const column = columnsForRow(definition, rows[nav.focused.row])[nav.focused.col];
    if (column) {
      // Bewusst OHNE Klickposition: dieser Effect ist der automatische
      // "sofort tippen koennen"-Trigger, der bei JEDEM Fokuswechsel auf
      // IRGENDEINE Zelle greift - egal welche Spalte, egal ob per Klick,
      // Pfeiltaste, Tab oder Enter. Vorher war das auf label === 'Inhalt'
      // beschraenkt, wodurch jeder Fokuswechsel auf eine andere Spalte
      // (Typ, Datum, Person) einen "Fake-Fokus" erzeugte: der aeussere
      // <div role="cell"> bekam DOM-Fokus (blauer Rahmen), aber ohne
      // startEditing() wurde nie ein echtes Eingabefeld gemountet - Tippen
      // bewirkte nichts. Alle Zelltypen haben laengst einen eigenen,
      // funktionierenden editing-Zustand (siehe TypCell, DatePickerCell,
      // AutocompleteCell), der nur nie automatisch ausgeloest wurde.
      autoEditedPosRef.current = posKey;
      // Dieser automatische startEditing() loest denselben Zell-Remount
      // (Anzeige-<div> -> Textarea) aus wie ein manueller Doppelklick -
      // scrollTop muss daher genauso davor gesichert werden, siehe
      // Kommentar bei pendingScrollTopRef oben. Ohne diesen Aufruf hier
      // blieb GENAU dieser Remount ungeschuetzt: der vorherige
      // Fokus-Klick (onMouseDown) hatte bereits gesichert UND der
      // useLayoutEffect unten bereits wiederhergestellt (er laeuft nach
      // JEDEM Render, auch dem reinen Fokus-Render), BEVOR dieser Effect
      // hier ueberhaupt startEditing() aufruft - der eigentliche,
      // sichtbare Sprung passierte also erst in diesem zweiten,
      // separaten Commit.
      saveScrollTop();
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
    <div className="data-grid" role="table" ref={gridRootRef}>
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
                      //
                      // commitEditingCell() MUSS hier, vor setFocused, laufen:
                      // setFocused aendert isFocused/isEditing der zuvor
                      // editierten Zelle auf false, wodurch ihr key (editing-*
                      // -> idle) wechselt und React sie unmountet, OHNE dass
                      // je ein echtes blur-Event feuert (die Zelle wird ja
                      // nicht per Fokuswechsel verlassen, sondern per Klick
                      // auf ein anderes Element, dessen mousedown keinen
                      // nativen Blur ausloest, solange kein preventDefault
                      // etwas anderes bewirkt). Ohne diesen Aufruf ging der
                      // noch nicht committete draft-Text der Zelle beim Klick
                      // in eine andere Zelle komplett verloren.
                      saveScrollTop();
                      commitEditingCell();
                      nav.setFocused({ row: rowIndex, col: colIndex });
                    }}
                    onClick={() => {
                      focusCell(rowIndex, colIndex);
                    }}
                    onDoubleClick={() => {
                      saveScrollTop();
                      nav.setFocused({ row: rowIndex, col: colIndex });
                      nav.startEditing();
                    }}
                    onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex, columns)}
                  >
                    <Cell
                      key={isEditing ? `editing-${nav.editSession}` : 'idle'}
                      ref={(handle) => {
                        if (isEditing) editingCellRef.current = handle;
                        else if (editingCellRef.current === handle) editingCellRef.current = null;
                      }}
                      column={col}
                      value={row.cells[col.id] ?? null}
                      focused={isFocused}
                      editing={isEditing}
                      initialChar={isEditing ? nav.initialChar : undefined}
                      contacts={contacts}
                      typValues={definition.typValues}
                      onCommit={(value) => {
                        onCellCommit(row.id, col.id, value);
                        nav.stopEditing();
                        const cellKey = `${row.id}:${col.id}`;
                        setMagicUndo((m) => {
                          if (!m.has(cellKey)) return m;
                          const next = new Map(m);
                          next.delete(cellKey);
                          return next;
                        });
                      }}
                      onCancelEdit={() => nav.stopEditing()}
                      onMoveUp={nav.moveUp}
                      onMoveDown={nav.moveDown}
                      onMoveHorizontal={nav.moveHorizontal}
                      onMoveTab={nav.moveTab}
                    />
                    {col.label === 'Inhalt' && row.cells[col.id] && (() => {
                      const cellKey = `${row.id}:${col.id}`;
                      const isLoading = magicLoading.has(cellKey);
                      const canUndo = magicUndo.has(cellKey);
                      return (
                        <>
                          {canUndo && (
                            <button
                              type="button"
                              className="magic-undo-button"
                              title="Verbesserung rückgängig machen"
                              aria-label="Verbesserung rückgängig machen"
                              tabIndex={-1}
                              onMouseDown={(e) => {
                                // preventDefault verhindert den nativen
                                // Fokuswechsel auf den Button selbst - ohne
                                // das wuerde ein Klick hier die eigentlich
                                // fokussierte Zelle (die der Nutzer gerade
                                // bearbeitet) aus dem DOM-Fokus verdraengen,
                                // wodurch der Scroll-Stabilitaets-Effect
                                // weiter oben faelschlich annimmt, das Grid
                                // habe keinen Fokus mehr.
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const previousValue = magicUndo.get(cellKey) ?? null;
                                onCellCommit(row.id, col.id, previousValue);
                                setMagicUndo((m) => {
                                  const next = new Map(m);
                                  next.delete(cellKey);
                                  return next;
                                });
                              }}
                            >
                              ↩
                            </button>
                          )}
                          <button
                            type="button"
                            className="magic-button"
                            title={magicError?.key === cellKey ? magicError.message : 'Text verbessern (Claude)'}
                            aria-label="Text verbessern"
                            tabIndex={-1}
                            disabled={isLoading}
                            onMouseDown={(e) => {
                              // Siehe Kommentar am Undo-Button oben - selbes
                              // preventDefault, damit dieser Klick der
                              // fokussierten Zelle nicht den DOM-Fokus raubt.
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={async (e) => {
                              e.stopPropagation();
                              // commitEditingCell() liefert den frisch
                              // committeten Wert direkt zurueck, statt
                              // row.cells[col.id] zu lesen: row ist eine
                              // Prop und zeigt erst im naechsten Render den
                              // neuen Stand (onCellCommit loest nur ein
                              // asynchrones State-Update aus). Vorher wurde
                              // hier nav.stopEditing(true) aufgerufen, das
                              // trotz seines Namens nie etwas committet hat
                              // - Tippen unmittelbar vor dem Klick auf diesen
                              // Button ging dadurch verloren.
                              const committedValue = isFocused && nav.editing ? commitEditingCell() : undefined;
                              setMagicError(null);
                              setMagicLoading((s) => new Set(s).add(cellKey));
                              const previousValue = committedValue !== undefined ? committedValue : (row.cells[col.id] ?? null);
                              try {
                                const improvedDisplay = await improveCellText(
                                  IMPROVE_READABILITY_PROMPT_ID,
                                  toDisplayText(previousValue!),
                                  { projekt: row.cells.projekt, meeting: row.cells.meeting },
                                );
                                onCellCommit(row.id, col.id, fromDisplayText(improvedDisplay));
                                setMagicUndo((m) => new Map(m).set(cellKey, previousValue));
                              } catch (err) {
                                setMagicError({
                                  key: cellKey,
                                  message: err instanceof Error ? err.message : 'Fehler',
                                });
                              } finally {
                                setMagicLoading((s) => {
                                  const next = new Set(s);
                                  next.delete(cellKey);
                                  return next;
                                });
                              }
                            }}
                          >
                            {isLoading ? '⏳' : '✨'}
                          </button>
                        </>
                      );
                    })()}
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
