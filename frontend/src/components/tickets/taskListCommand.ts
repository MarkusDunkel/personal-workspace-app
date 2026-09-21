import { $command } from '@milkdown/utils';
import { listItemSchema, wrapInBulletListCommand } from '@milkdown/preset-commonmark';
import { commandsCtx, editorViewCtx } from '@milkdown/core';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import type { Ctx } from '@milkdown/ctx';

/**
 * Schaltet die Auswahl zwischen Aufzaehlung und Aufgabenliste (zum Abhaken) um.
 *
 * Milkdown bildet Aufgaben nicht als eigenen Knotentyp ab, sondern ueber das
 * Attribut `checked` am list_item (siehe extendListItemSchemaForTask im
 * GFM-Preset): null = gewoehnlicher Punkt, false = leeres Kaestchen, true =
 * abgehakt. Fertig gibt es dafuer nur eine Eingaberegel ("[ ] " tippen), also
 * nichts, was eine Schaltflaeche aufrufen koennte - dieser Befehl schliesst
 * die Luecke.
 *
 * EIN Klick muss genuegen. Eine fruehere Fassung machte aus Text, der noch
 * keine Liste war, erst eine Aufzaehlung und verlangte einen zweiten Klick
 * fuer die Kaestchen. Das Ergebnis war im Markdown "* Text" statt
 * "* [ ] Text" - der Nutzer hatte die Schaltflaeche gedrueckt und bekam keine
 * Aufgabenliste. Deshalb wird hier nach dem Einpacken in eine Liste im selben
 * Aufruf weitergearbeitet: der Zustand nach wrapInBulletListCommand wird neu
 * aus der View gelesen (die Positionen des alten state sind danach ungueltig)
 * und die Kaestchen werden direkt gesetzt.
 *
 * Wirkt ausserdem auf ALLE Listenpunkte der Auswahl, nicht nur auf den unter
 * dem Cursor - sonst muesste man eine markierte Liste Zeile fuer Zeile
 * umschalten.
 */
export const toggleTaskListCommand = $command(
  'ToggleTaskList',
  (ctx: Ctx) => () => (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const itemType = listItemSchema.type(ctx);

    /**
     * Setzt `checked` auf allen list_items im Auswahlbereich.
     *
     * Der Zielwert richtet sich nach dem ersten Punkt: ist dort noch kein
     * Kaestchen, bekommen alle eines - sonst verlieren alle ihres. So wird aus
     * einer gemischten Auswahl eine einheitliche, statt jeden Punkt fuer sich
     * umzudrehen.
     */
    const applyChecked = (
      current: EditorState,
      dispatchFn?: (tr: Transaction) => void,
    ): boolean => {
      const { from, to } = current.selection;
      const positions: number[] = [];
      current.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type === itemType) {
          positions.push(pos);
        }
        return true;
      });
      if (positions.length === 0) {
        return false;
      }

      const first = current.doc.nodeAt(positions[0]);
      const next = first?.attrs.checked == null ? false : null;

      if (!dispatchFn) {
        return true;
      }
      const tr = current.tr;
      for (const pos of positions) {
        const node = tr.doc.nodeAt(pos);
        if (node) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: next });
        }
      }
      dispatchFn(tr);
      return true;
    };

    // Schon eine Liste? Dann reicht das Setzen der Kaestchen.
    if (applyChecked(state, dispatch)) {
      return true;
    }

    // Noch keine Liste: erst einpacken, dann im selben Klick die Kaestchen
    // setzen. wrapInBulletListCommand schreibt ueber commandsCtx direkt in die
    // View; danach ist der hier uebergebene state veraltet, weshalb der
    // aktuelle Zustand neu geholt wird.
    if (!dispatch) {
      return true;
    }
    if (!ctx.get(commandsCtx).call(wrapInBulletListCommand.key)) {
      return false;
    }
    return applyChecked(currentState(ctx, state), dispatch);
  },
);

/**
 * Der Zustand NACH dem Einpacken in die Liste.
 *
 * Der Zugriff auf die View steht bewusst in einem try: Wird der Befehl
 * ausgeloest, bevor die View bereitsteht, faellt er auf den uebergebenen
 * Zustand zurueck - dann bleibt es eben bei der Aufzaehlung, statt dass der
 * Klick einen Fehler wirft.
 */
function currentState(ctx: Ctx, fallback: EditorState): EditorState {
  try {
    return ctx.get(editorViewCtx).state as EditorState;
  } catch {
    return fallback;
  }
}
