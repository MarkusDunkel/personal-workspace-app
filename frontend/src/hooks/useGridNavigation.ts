import { useCallback, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface GridPosition {
  row: number;
  col: number;
}

export interface UseGridNavigationOptions {
  onRequestAddRow: () => void;
}

export interface UseGridNavigation {
  focused: GridPosition;
  editing: boolean;
  initialChar: string | undefined;
  setFocused: (pos: GridPosition) => void;
  startEditing: (initialChar?: string) => void;
  stopEditing: (commit: boolean) => void;
  moveDown: () => void;
  moveTab: (delta: 1 | -1) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
}

const PRINTABLE_KEY = /^[^\s]$/u;

export function useGridNavigation(
  rowCount: number,
  colCount: number,
  options: UseGridNavigationOptions,
): UseGridNavigation {
  const [focused, setFocused] = useState<GridPosition>({ row: 0, col: 0 });
  const [editing, setEditing] = useState(false);
  const [initialChar, setInitialChar] = useState<string | undefined>(undefined);

  const startEditing = useCallback((char?: string) => {
    setInitialChar(char);
    setEditing(true);
  }, []);

  const stopEditing = useCallback((_commit: boolean) => {
    setEditing(false);
    setInitialChar(undefined);
  }, []);

  const onRequestAddRow = options.onRequestAddRow;

  const moveDown = useCallback(() => {
    setFocused((pos) => {
      if (pos.row >= rowCount - 1) {
        onRequestAddRow();
        return { row: rowCount, col: 0 };
      }
      return { row: pos.row + 1, col: pos.col };
    });
  }, [rowCount, onRequestAddRow]);

  const moveUp = useCallback(() => {
    setFocused((pos) => (pos.row === 0 ? pos : { row: pos.row - 1, col: pos.col }));
  }, []);

  const moveHorizontal = useCallback(
    (delta: 1 | -1) => {
      setFocused((pos) => {
        let { row, col } = pos;
        col += delta;
        if (col >= colCount) {
          if (row >= rowCount - 1) return pos;
          row += 1;
          col = 0;
        } else if (col < 0) {
          if (row <= 0) return pos;
          row -= 1;
          col = colCount - 1;
        }
        return { row, col };
      });
    },
    [colCount, rowCount],
  );

  const moveTab = useCallback(
    (delta: 1 | -1) => {
      setFocused((pos) => {
        let { row, col } = pos;
        col += delta;
        if (col >= colCount) {
          if (row >= rowCount - 1) {
            onRequestAddRow();
            return { row: rowCount, col: 0 };
          }
          row += 1;
          col = 0;
        } else if (col < 0) {
          if (row <= 0) return pos;
          row -= 1;
          col = colCount - 1;
        }
        return { row, col };
      });
    },
    [colCount, rowCount, onRequestAddRow],
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
              startEditing(e.key);
            }
        }
        return;
      }

      // editing === true
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          stopEditing(false);
          return;
        case 'Enter':
          e.preventDefault();
          stopEditing(true);
          moveDown();
          return;
        case 'Tab':
          e.preventDefault();
          stopEditing(true);
          moveTab(e.shiftKey ? -1 : 1);
          return;
        default:
          return;
      }
    },
    [editing, moveUp, moveDown, moveHorizontal, moveTab, startEditing, stopEditing],
  );

  return { focused, editing, initialChar, setFocused, startEditing, stopEditing, moveDown, moveTab, handleKeyDown };
}
