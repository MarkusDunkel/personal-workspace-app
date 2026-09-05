import { useCallback, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface GridPosition {
  row: number;
  col: number;
}

export interface UseGridNavigationOptions {
  /**
   * Legt eine neue Zeile an (Strg+Enter). Gibt true zurueck, wenn eine
   * entstanden ist - dann wandert der Fokus dorthin.
   *
   * Bewusst ein ausdrueckliches Tastenkuerzel und nicht mehr an das
   * Tabellenende gebunden: seit alle Notizen in EINER Liste stehen, neueste
   * zuerst, stehen unten die AELTESTEN Zeilen - dort eine neue anzulegen
   * waere sinnlos. Die neue Zeile erscheint automatisch oben, weil die
   * Anzeige nach created absteigend sortiert.
   *
   * Strg+Enter und nicht Shift+Enter: Shift+Enter ist als moveUp() belegt
   * (siehe handleKeyDown), das zu ueberschreiben wuerde bestehende
   * Navigation brechen.
   */
  onInsertRow?: () => boolean;
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
  /** Legt oben eine Zeile an und fokussiert sie (Strg+Enter). */
  insertRow: () => void;
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

  const onInsertRow = options.onInsertRow;

  /**
   * Legt eine Zeile an und setzt den Fokus darauf.
   *
   * onInsertRow() laeuft synchron aus dem Closure heraus und VOR setFocused -
   * nie innerhalb eines Updater-Callbacks. Der Grund ist zweimal teuer
   * gelernt worden: (1) es loest in NoteSection ein setState in einer
   * ANDEREN Komponente aus, waehrend React noch mitten in der Berechnung des
   * Updaters steckt ("Cannot update a component while rendering a different
   * component"); (2) ein Versuch, das per Flag INNERHALB des Updaters zu
   * setzen und ausserhalb zu pruefen, ging von synchroner Ausfuehrung des
   * Updaters aus - unter Concurrent Rendering laeuft er erst spaeter, die
   * Pruefung sah immer den Ausgangswert false und die Zeile entstand nie.
   *
   * Fokusziel ist {0,0}: die neue Zeile traegt created = jetzt und steht
   * damit in der nach created absteigend sortierten Anzeige an Position 0.
   * Der Fokus-Reparatur-Effect in DataGrid holt den DOM-Fokus nach, sobald
   * die Zeile tatsaechlich in rows erscheint (rows steht dort in den
   * Dependencies).
   */
  const insertRow = useCallback(() => {
    if (!onInsertRow) return;
    if (!onInsertRow()) return;
    setFocused({ row: 0, col: 0 });
  }, [onInsertRow]);

  const moveDown = useCallback(() => {
    setFocused((pos) => {
      // Am unteren Ende bleibt der Fokus stehen. Frueher entstand hier eine
      // neue Zeile bzw. der Fokus wanderte in die naechste Archiv-Sektion -
      // beides entfaellt: neue Zeilen entstehen nur per Strg+Enter (siehe
      // insertRow), und es gibt nur noch EIN Grid.
      if (pos.row >= rowCount - 1) return pos;
      const row = pos.row + 1;
      return { row, col: Math.min(pos.col, getColCountForRow(row) - 1) };
    });
  }, [rowCount, getColCountForRow]);

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
      setFocused((pos) => {
        let { row, col } = pos;
        col += delta;
        if (col >= getColCountForRow(row)) {
          // Hinter der letzten Zelle der letzten Zeile bleibt der Fokus
          // stehen (siehe moveDown).
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Strg+Enter legt eine neue Zeile an - in JEDEM Zustand, auch mitten
      // im Editieren. Steht vor der Zustandsunterscheidung, damit das
      // Kuerzel nicht in einem der beiden Enter-Zweige untergeht.
      //
      // Die fuenf Zellkomponenten (BulletTextCell, TypCell,
      // AutocompleteCell, DatePickerCell, TextCell) lassen Strg+Enter
      // ausdruecklich zu diesem Handler durch - sie fangen "Enter" sonst
      // selbst ab und rufen stopPropagation(), das Kuerzel kaeme hier also
      // nie an (in BulletTextCell haette es stattdessen eine Bullet-Zeile
      // eingefuegt).
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (editing) stopEditing();
        insertRow();
        return;
      }

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
    [editing, moveUp, moveDown, moveHorizontal, moveTab, startEditing, stopEditing, insertRow],
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
    insertRow,
    handleKeyDown,
  };
}
