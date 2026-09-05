import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ColumnDefinition, TableDefinition, TableRow } from '../api/noteTypes';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { Cell } from './Cell';
import type { CellHandle } from './Cell';
import { improveCellText, IMPROVE_READABILITY_PROMPT_ID } from '../api/claudeApi';
import { toDisplayText, fromDisplayText } from '../utils/bulletText';

interface DataGridProps {
  definition: TableDefinition;
  /**
   * Die SICHTBARE, sortierte und gefilterte Zeilenliste (siehe
   * useNoteViewFilters). Das Grid adressiert Zeilen weiterhin ueber ihren
   * numerischen Index - der bedeutet damit "Position in dieser Liste", nicht
   * "Position in der Datei".
   */
  rows: TableRow[];
  onCellCommit: (rowId: string, columnId: string, value: string | null) => void;
  /** Legt oben eine neue Zeile an (Strg+Enter). */
  onInsertRow?: () => void;
  onDeleteRow: (rowId: string) => void;
  onFocusedRowChange?: (row: TableRow | null) => void;
  contacts: string[];
  /**
   * Liegt die Zeile noch in 0_sources, ist also noch nicht abgesendet? Bewusst
   * ein Praedikat und kein Herkunftsobjekt: so kann kein Archivdateiname in
   * den Render-Baum gelangen.
   */
  isLiveRow: (rowId: string) => boolean;
  /**
   * Zeilen, die nach einer Aenderung nicht mehr zum Filter passen, aber
   * absichtlich noch stehen bleiben (siehe useNoteViewFilters) - sie werden
   * gedimmt dargestellt.
   */
  graceRowIds?: ReadonlySet<string>;
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
  onInsertRow,
  onDeleteRow,
  onFocusedRowChange,
  contacts,
  isLiveRow,
  graceRowIds,
}: DataGridProps) {
  /**
   * Zellen-Elemente, geschluesselt nach "zeilenId:spaltenId" - bewusst NICHT
   * nach Index. Sortieren und Filtern laesst Zeilenidentitaeten zwischen
   * Indizes wandern, waehrend key={row.id} React dazu bringt, die DOM-Knoten
   * UMZUORDNEN statt sie neu zu mounten. Die Reihenfolge, in der React dabei
   * die ref-Callbacks der alten (null) und neuen Elemente fuer denselben
   * Schluesselstring aufruft, ist nicht garantiert: eine Zeile, die auf Index
   * 3 landet, kann "3:0" setzen, BEVOR die Zeile, die Index 3 verlaesst, ihn
   * loescht - die Karte zeigte dann auf einen abgeloesten Knoten. Mit
   * Identitaets-Schluesseln kann das nicht passieren, weil jede Zeile ihren
   * eigenen Schluessel besitzt.
   */
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

  // Haelt die scrollTop-Position von .tables-wrap fest (dem einen,
  // durchgehenden Scrollbereich der Notizansicht - siehe app.css), direkt
  // bevor ein Klick/Doppelklick einen Fokus- oder Editier-Wechsel ausloest.
  // Ein solcher Wechsel laesst React die betroffene Zelle remounten (key
  // "idle" -> "editing-N" oder umgekehrt, siehe Cell key unten) - zwischen
  // dem Entfernen der alten Zellinstanz und dem Einfuegen der neuen aendert
  // sich kurzzeitig deren Layout-Hoehe (z.B. Anzeige-<div> vs. Textarea),
  // was die Gesamthoehe des Scrollbereichs veraendert. Steht der
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
    const scrollParent = gridRootRef.current?.closest<HTMLElement>('.tables-wrap');
    if (scrollParent) pendingScrollTopRef.current = scrollParent.scrollTop;
  };

  useLayoutEffect(() => {
    if (pendingScrollTopRef.current === null) return;
    const scrollParent = gridRootRef.current?.closest<HTMLElement>('.tables-wrap');
    if (scrollParent) scrollParent.scrollTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;
  });

  const [magicLoading, setMagicLoading] = useState<Set<string>>(new Set());
  const [magicError, setMagicError] = useState<{ key: string; message: string } | null>(null);
  const [magicUndo, setMagicUndo] = useState<Map<string, string | null>>(new Map());

  const getColCountForRow = (row: number) => columnsForRow(definition, rows[row]).length;

  // Der Fokus liegt ausserhalb dieses Grids, z.B. in der Filterleiste.
  // Solange das gilt, darf keine Zelle als fokussiert gelten: sonst behaelt
  // die verlassene Zelle ihren Rahmen, waehrend der echte DOM-Fokus schon
  // woanders sitzt (Symptom: zwei sichtbare Fokusse, Pfeiltasten
  // wirkungslos). Wichtiger noch: der Fokus-Reparatur-Effect unten wuerde
  // den DOM-Fokus sonst aktiv aus dem Bedienelement zurueckreissen, in dem
  // der Nutzer gerade arbeitet.
  const [handedOffFocus, setHandedOffFocus] = useState(false);

  const nav = useGridNavigation(rows.length, getColCountForRow, {
    onInsertRow: onInsertRow && (() => {
      onInsertRow();
      return true;
    }),
  });

  const focusCell = (row: number, col: number) => {
    // Index -> Identitaet erst hier aufloesen, passend zur Schluesselung von
    // cellRefs (siehe Kommentar dort).
    const targetRow = rows[row];
    const targetColumn = targetRow && columnsForRow(definition, targetRow)[col];
    if (!targetRow || !targetColumn) return;
    const el = cellRefs.current.get(`${targetRow.id}:${targetColumn.id}`);
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
      const insideGrid = target instanceof Node && !!gridRootRef.current?.contains(target);
      focusInGridRef.current = insideGrid;
      if (insideGrid) {
        // Kommt der Fokus zurueck (Klick in eine Zelle, Tab von oben), gilt
        // die Abgabe nicht mehr - ab dann fuehrt das Grid wieder.
        setHandedOffFocus(false);
      } else if (target instanceof Element && target.closest('.note-filter-bar')) {
        // Der Fokus sitzt in der Filterleiste, also in KEINEM Grid. Das Grid
        // muss seine Fokusmarkierung abgeben und der Fokus-Reparatur-Effect
        // unten muss sich zurueckhalten - sonst reisst er den DOM-Fokus
        // mitten in der Bedienung eines Filtermenues zurueck in die Tabelle.
        // Genau dieser Fehler trat mit den Feldern "Projekt (Zeile)" /
        // "Meeting (Zeile)" auf (siehe Kommentar bei focusInGridRef): das
        // zurueckgerissene focus() feuerte ein natives blur auf dem Feld,
        // dessen commit() den frisch gewaehlten Wert sofort wieder verwarf.
        setHandedOffFocus(true);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  useLayoutEffect(() => {
    if (nav.editing) return;
    // Nach der Fokusabgabe nach unten darf dieser Effect den Fokus NICHT
    // zurueckholen - er wuerde ihn der naechsten Sektion sofort wieder
    // entreissen.
    if (handedOffFocus) return;
    // Nur fokussieren, wenn der Fokus zuletzt tatsaechlich im Grid lag -
    // sonst scrollt element.focus() den Browser-Viewport zu nav.focused
    // (Default {row:0, col:0}) und reisst die Ansicht an den Tabellenanfang,
    // obwohl der Nutzer gar keine Zelle angeklickt hat oder gerade bewusst
    // in einem Feld ausserhalb des Grids tippt (siehe Kommentar bei
    // focusInGridRef oben).
    if (focusInGridRef.current) {
      focusCell(nav.focused.row, nav.focused.col);
    }
    // rows als Dependency, aus zwei Gruenden:
    //
    // 1. Sortieren und Filtern aendern, WELCHE Zeile an einem Index steht.
    //    nav.focused zeigt auf einen Index, das DOM-Element haengt aber an
    //    der Zeilenidentitaet - ohne diesen Durchlauf blieb der DOM-Fokus
    //    auf der Zelle der alten Zeile stehen, waehrend der Rahmen schon
    //    woanders sass.
    // 2. Legt Strg+Enter eine Zeile an, steht nav.focused schon auf {0,0},
    //    WAEHREND rows die neue Zeile in diesem Render-Zyklus noch nicht
    //    enthaelt - ohne rows hier liefe der Effect kein zweites Mal, sobald
    //    sie erscheint, und der Fokus ginge sichtbar verloren.
    //
    // useLayoutEffect statt useEffect: laeuft synchron nach dem DOM-Update,
    // aber VOR dem Browser-Paint - verhindert ein sichtbares Aufblitzen von
    // "Grid ohne jeden Fokus", das mit useEffect (laeuft erst nach dem
    // naechsten Paint) kurz sichtbar waere.
  }, [nav.focused, nav.editing, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merkt sich, fuer welche Zelle der Auto-Edit-Effekt unten zuletzt
  // startEditing() ausgeloest hat. Ohne dieses Gedaechtnis wuerde
  // Escape (stopEditing(), OHNE die Fokusposition zu aendern) die Zelle
  // sofort wieder in den Editiermodus zurueckreissen: der Effect haengt an
  // nav.editing, und ein Wechsel von true -> false auf DERSELBEN Zelle
  // wuerde erneut greifen, weil sich column/row nicht geaendert haben. Mit
  // diesem Ref feuert startEditing() nur bei einem tatsaechlichen Wechsel
  // der Zelle - Escape laesst die Zelle danach im reinen Anzeigemodus, so
  // wie man es von Tabellenkalkulationen kennt.
  //
  // Geschluesselt nach Identitaet, nicht nach Index (wie cellRefs): unter
  // Sortierung kann derselbe Index eine ANDERE Zeile sein. Mit
  // Index-Schluesseln haette eine Neusortierung den Editiermodus auf einer
  // frisch an diese Position gerueckten Zelle unterdrueckt (Schluessel
  // unveraendert) bzw. ihn ungewollt ausgeloest.
  const autoEditedPosRef = useRef<string | null>(null);

  useEffect(() => {
    if (nav.editing) return;
    // Kein Auto-Editiermodus, wenn der Fokus das Grid verlassen hat: sonst
    // mountet die verlassene Zelle ein Eingabefeld, das den DOM-Fokus des
    // gerade bedienten Elements wieder wegnimmt.
    if (handedOffFocus) return;
    const focusedRow = rows[nav.focused.row];
    const column = focusedRow && columnsForRow(definition, focusedRow)[nav.focused.col];
    const posKey = focusedRow && column ? `${focusedRow.id}:${column.id}` : null;
    if (posKey === null || autoEditedPosRef.current === posKey) return;
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
            if (e.key === 'Enter' && onInsertRow) {
              e.preventDefault();
              onInsertRow();
            }
          }}
          onClick={onInsertRow}
        >
          {onInsertRow ? 'Keine Einträge – Eingabe zum Hinzufügen' : 'Keine Einträge'}
        </div>
      ) : (
        rows.map((row, rowIndex) => {
          const columns = columnsForRow(definition, row);
          const isGrace = graceRowIds?.has(row.id) ?? false;
          return (
            <div
              key={row.id}
              role="row"
              className={`data-grid-row${isGrace ? ' data-grid-row--grace' : ''}`}
            >
              {/* Vorspalte: fruehere Position des Ziehgriffs. Zeigt jetzt, ob
                  die Zeile noch in 0_sources liegt, also noch nicht
                  abgesendet wurde. Nur dieser Zustand wird markiert -
                  abgelegte Zeilen bleiben leer, damit das Auffaellige der
                  offene Posten ist. */}
              <div className="data-grid-grip-col">
                {isLiveRow(row.id) && (
                  <span
                    className="row-pending-marker"
                    title="Noch nicht übermittelt (liegt in 0_sources)"
                    aria-label="Noch nicht übermittelt"
                  >
                    ✎
                  </span>
                )}
              </div>
              {columns.map((col, colIndex) => {
                const isFocused = !handedOffFocus
                    && nav.focused.row === rowIndex && nav.focused.col === colIndex;
                const isEditing = isFocused && nav.editing;
                return (
                  <div
                    key={col.id}
                    role="cell"
                    ref={(el) => {
                      const refKey = `${row.id}:${col.id}`;
                      if (el) cellRefs.current.set(refKey, el);
                      else cellRefs.current.delete(refKey);
                    }}
                    // Nach der Fokusabgabe behaelt die gemerkte Position den
                    // Tab-Einstieg (ohne den Fokusrahmen), damit das Grid per
                    // Tab wieder erreichbar bleibt - waere ueberall -1, waere
                    // die Tabelle aus der Tab-Reihenfolge verschwunden.
                    tabIndex={
                      nav.focused.row === rowIndex && nav.focused.col === colIndex ? 0 : -1
                    }
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
