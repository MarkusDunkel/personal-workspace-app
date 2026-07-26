import { useCallback, useEffect, useRef, useState } from 'react';
import { getTable, putTable } from '../api/tablesApi';
import type { TableRow } from '../api/tableTypes';
import { useDebouncedCallback } from './useDebouncedCallback';

export function useTableData(tableId: string) {
  const [rows, setRowsState] = useState<TableRow[]>([]);
  const [saveStatus, setSaveStatus] = useState('Bereit');

  const dirtyRef = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const doSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    setSaveStatus('speichert…');
    try {
      await putTable(tableId, { tableId, rows: rowsRef.current });
      dirtyRef.current = false;
      setSaveStatus('Gespeichert ' + new Date().toLocaleTimeString());
    } catch (err) {
      setSaveStatus(
        err instanceof TypeError ? 'Fehler beim Speichern (offline?)' : 'Fehler beim Speichern',
      );
    }
  }, [tableId]);

  const scheduleSave = useDebouncedCallback(doSave, 800);

  const mutateRows = useCallback(
    (next: TableRow[]) => {
      setRowsState(next);
      dirtyRef.current = true;
      setSaveStatus('Ungespeicherte Änderungen…');
      scheduleSave();
    },
    [scheduleSave],
  );

  const setCell = useCallback(
    (rowId: string, columnId: string, value: string | null) => {
      mutateRows(
        rowsRef.current.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [columnId]: value } } : r)),
      );
    },
    [mutateRows],
  );

  const addRow = useCallback(() => {
    const newRow: TableRow = { id: crypto.randomUUID(), cells: {}, order: rowsRef.current.length };
    mutateRows([...rowsRef.current, newRow]);
    return newRow.id;
  }, [mutateRows]);

  const deleteRow = useCallback(
    (rowId: string) => {
      mutateRows(
        rowsRef.current.filter((r) => r.id !== rowId).map((r, i) => ({ ...r, order: i })),
      );
    },
    [mutateRows],
  );

  const reorderRow = useCallback(
    (rowId: string, newIndex: number) => {
      const current = rowsRef.current;
      const fromIndex = current.findIndex((r) => r.id === rowId);
      if (fromIndex === -1) return;
      const withoutMoved = current.filter((r) => r.id !== rowId);
      const clampedIndex = Math.max(0, Math.min(newIndex, withoutMoved.length));
      const moved = current[fromIndex];
      const next = [...withoutMoved.slice(0, clampedIndex), moved, ...withoutMoved.slice(clampedIndex)];
      mutateRows(next.map((r, i) => ({ ...r, order: i })));
    },
    [mutateRows],
  );

  useEffect(() => {
    const id = window.setInterval(doSave, 30000);
    return () => window.clearInterval(id);
  }, [doSave]);

  useEffect(() => {
    getTable(tableId)
      .then((data) => {
        setRowsState([...data.rows].sort((a, b) => a.order - b.order));
        dirtyRef.current = false;
      })
      .catch(() => setSaveStatus('Konnte Tabelle nicht laden'));
  }, [tableId]);

  return { rows, saveStatus, setCell, addRow, deleteRow, reorderRow, saveNow: doSave };
}
