import { $command } from '@milkdown/utils';
import { deleteColumn, deleteRow, deleteTable, isInTable } from '@milkdown/prose/tables';
import type { EditorState, Transaction } from '@milkdown/prose/state';

/**
 * Loeschbefehle fuer Tabellen.
 *
 * Milkdowns GFM-Preset bringt Einfuegen und Verschieben mit
 * (insertTableCommand, addRowAfterCommand, moveColCommand ...), aber KEINE
 * Loeschbefehle - die liegen in prosemirror-tables, das Milkdown unter
 * @milkdown/prose/tables unveraendert reexportiert. Hier werden sie nur als
 * Milkdown-Befehle registriert, damit die Werkzeugleiste sie ueber commandsCtx
 * aufrufen kann wie jeden anderen auch.
 */

type Dispatch = ((tr: Transaction) => void) | undefined;

export const deleteRowCommand = $command(
  'DeleteTableRow',
  () => () => (state: EditorState, dispatch?: Dispatch) => deleteRow(state, dispatch),
);

export const deleteColCommand = $command(
  'DeleteTableColumn',
  () => () => (state: EditorState, dispatch?: Dispatch) => deleteColumn(state, dispatch),
);

export const deleteTableCommand = $command(
  'DeleteTable',
  () => () => (state: EditorState, dispatch?: Dispatch) => deleteTable(state, dispatch),
);

/** Steht der Cursor gerade in einer Tabelle? Steuert die Tabellen-Schaltflaechen. */
export function cursorIsInTable(state: EditorState): boolean {
  return isInTable(state);
}
