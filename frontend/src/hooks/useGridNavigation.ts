import { useCallback, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface GridPosition {
  row: number;
  col: number;
}

export interface UseGridNavigationOptions {
  /**
   * Wird am unteren Tabellenende aufgerufen, wenn dort eine neue Zeile
   * entstehen soll. Gibt false zurueck, wenn keine angelegt wurde (leere
   * letzte Zeile oder Tabelle ohne Anlegen-Recht) - dann uebernimmt
   * onLeaveBottom.
   */
  onRequestAddRow: () => boolean;
  /**
   * Der Fokus verlaesst die Tabelle nach unten (siehe App.tsx: weiter zur
   * naechsten Notiz-Sektion).
   */
  onLeaveBottom?: () => void;
}

export interface UseGridNavigation {
  focused: GridPosition;
  editing: boolean;
  initialChar: string | undefined;
  editSession: number;
  setFocused: (pos: GridPosition) => void;
  startEditing: (initialChar?: string) => void;
  stopEditing: () => void;
  moveUp: () => void;
  moveDown: () => void;
  moveHorizontal: (delta: 1 | -1) => void;
  moveTab: (delta: 1 | -1) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
}

const PRINTABLE_KEY = /^[^\s]$/u;

export function useGridNavigation(
  rowCount: number,
  getColCountForRow: (row: number) => number,
  options: UseGridNavigationOptions,
): UseGridNavigation {
  const [focused, setFocused] = useState<GridPosition>({ row: 0, col: 0 });
  const [editing, setEditing] = useState(false);
  const [initialChar, setInitialChar] = useState<string | undefined>(undefined);
  // Wird bei jedem startEditing hochgezaehlt und als React-key an die Zelle
  // durchgereicht - erzwingt einen kompletten Remount statt einer Effect-
  // basierten State-Synchronisierung, damit useState(initialChar ?? value)
  // garantiert mit dem richtigen Wert initialisiert, ohne Race zwischen
  // useLayoutEffect (liest den noch alten DOM-Wert) und useEffect (setzt
  // draft erst danach).
  const [editSession, setEditSession] = useState(0);

  const startEditing = useCallback((char?: string) => {
    setInitialChar(char);
    setEditing(true);
    setEditSession((n) => n + 1);
  }, []);

  const stopEditing = useCallback(() => {
    setEditing(false);
    setInitialChar(undefined);
  }, []);

  const onRequestAddRow = options.onRequestAddRow;
  const onLeaveBottom = options.onLeaveBottom;

  const moveDown = useCallback(() => {
    // onRequestAddRow() darf NICHT innerhalb des setFocused-Updater-
    // Callbacks aufgerufen werden: es loest in NoteSection ein setState in
    // einer ANDEREN Komponente aus, waehrend React noch mitten in der
    // Berechnung dieses Updaters steckt ("Cannot update a component while
    // rendering a different component"). Ein frueherer Versuch, das per
    // Flag INNERHALB des Updaters zu setzen und ausserhalb zu pruefen, ging
    // von einer synchronen Ausfuehrung des Updaters aus - der Updater laeuft
    // aber tatsaechlich erst spaeter (Concurrent Rendering), wodurch die
    // Pruefung immer den Ausgangswert false sah und onRequestAddRow() nie
    // aufgerufen wurde (Symptom: Enter/Tab am Tabellenende verliess die
    // Zelle, legte aber keine neue Zeile an). Da focused hier bereits als
    // aktueller State-Wert im Closure vorliegt, braucht es den
    // Updater-Trick gar nicht - die Bedingung laesst sich direkt daraus
    // berechnen, synchron, bevor setFocused ueberhaupt aufgerufen wird.
    //
    // NoteSection setzt seinen State innerhalb von onRequestAddRow weiterhin
    // ausserhalb eines laufenden Updaters - der Aufruf erfolgt jetzt sogar
    // noch vor setFocused, der beschriebene Fehler kann also nicht auftreten.
    const atBottom = focused.row >= rowCount - 1;
    // onRequestAddRow() muss VOR setFocused laufen: nur so ist bekannt, ob es
    // ueberhaupt eine neue Zeile gibt, auf die der Fokus wandern darf. Wurde
    // keine angelegt (leere letzte Zeile, oder abgelegte Notiz ohne
    // Anlegen-Recht), bleibt der Fokus stehen und wird stattdessen an die
    // naechste Sektion abgegeben.
    const addedRow = atBottom && onRequestAddRow();
    if (atBottom && !addedRow) {
      onLeaveBottom?.();
      return;
    }
    setFocused((pos) => {
      if (pos.row >= rowCount - 1) {
        return { row: rowCount, col: 0 };
      }
      const row = pos.row + 1;
      return { row, col: Math.min(pos.col, getColCountForRow(row) - 1) };
    });
  }, [focused, rowCount, onRequestAddRow, onLeaveBottom, getColCountForRow]);

  const moveUp = useCallback(() => {
    setFocused((pos) => {
      if (pos.row === 0) return pos;
      const row = pos.row - 1;
      return { row, col: Math.min(pos.col, getColCountForRow(row) - 1) };
    });
  }, [getColCountForRow]);

  const moveHorizontal = useCallback(
    (delta: 1 | -1) => {
      setFocused((pos) => {
        let { row, col } = pos;
        col += delta;
        if (col >= getColCountForRow(row)) {
          if (row >= rowCount - 1) return pos;
          row += 1;
          col = 0;
        } else if (col < 0) {
          if (row <= 0) return pos;
          row -= 1;
          col = getColCountForRow(row) - 1;
        }
        return { row, col };
      });
    },
    [getColCountForRow, rowCount],
  );

  const moveTab = useCallback(
    (delta: 1 | -1) => {
      // Siehe ausfuehrlichen Kommentar in moveDown - needsNewRow wird
      // synchron aus dem aktuellen focused-Wert berechnet, NICHT innerhalb
      // des setFocused-Updater-Callbacks (der laeuft asynchron und lieferte
      // hier denselben Bug wie in moveDown: onRequestAddRow() wurde nie
      // erreicht).
      const atBottom = delta > 0
          && focused.col + delta >= getColCountForRow(focused.row)
          && focused.row >= rowCount - 1;
      // Siehe moveDown: erst anlegen, dann fokussieren.
      const addedRow = atBottom && onRequestAddRow();
      if (atBottom && !addedRow) {
        onLeaveBottom?.();
        return;
      }
      setFocused((pos) => {
        let { row, col } = pos;
        col += delta;
        if (col >= getColCountForRow(row)) {
          if (row >= rowCount - 1) {
            return { row: rowCount, col: 0 };
          }
          row += 1;
          col = 0;
        } else if (col < 0) {
          if (row <= 0) return pos;
          row -= 1;
          col = getColCountForRow(row) - 1;
        }
        return { row, col };
      });
    },
    [focused, getColCountForRow, rowCount, onRequestAddRow, onLeaveBottom],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!editing) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            if (e.shiftKey) return;
            moveUp();
            return;
          case 'ArrowDown':
            e.preventDefault();
            moveDown();
            return;
          case 'ArrowLeft':
            e.preventDefault();
            moveHorizontal(-1);
            return;
          case 'ArrowRight':
            e.preventDefault();
            moveHorizontal(1);
            return;
          case 'Tab':
            e.preventDefault();
            moveTab(e.shiftKey ? -1 : 1);
            return;
          case 'Enter':
            e.preventDefault();
            if (e.shiftKey) {
              moveUp();
            } else {
              moveDown();
            }
            return;
          case 'F2':
            e.preventDefault();
            startEditing();
            return;
          case 'Delete':
          case 'Backspace':
            // handled by the cell itself (needs onCellCommit), grid only
            // owns navigation - see DataGrid's keydown wiring.
            return;
          default:
            if (PRINTABLE_KEY.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
              // preventDefault ist noetig, obwohl das <div role="cell">
              // selbst kein Standardverhalten fuer Tastendruecke hat: ohne
              // sie liefert der Browser das native keypress/input-Event
              // trotzdem an das neu gemountete <input>, das startEditing
              // synchron per useLayoutEffect fokussiert (noch im selben
              // Event-Zyklus) - das Zeichen wuerde dann doppelt landen
              // (einmal ueber initialChar, einmal nativ).
              e.preventDefault();
              startEditing(e.key);
            }
        }
        return;
      }

      // editing === true
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          stopEditing();
          return;
        case 'Enter':
          e.preventDefault();
          stopEditing();
          moveDown();
          return;
        case 'Tab':
          e.preventDefault();
          stopEditing();
          moveTab(e.shiftKey ? -1 : 1);
          return;
        default:
          return;
      }
    },
    [editing, moveUp, moveDown, moveHorizontal, moveTab, startEditing, stopEditing],
  );

  return {
    focused,
    editing,
    initialChar,
    editSession,
    setFocused,
    startEditing,
    stopEditing,
    moveUp,
    moveDown,
    moveHorizontal,
    moveTab,
    handleKeyDown,
  };
}
