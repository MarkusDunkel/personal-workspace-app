import { $ctx, $prose } from '@milkdown/utils';
import { parserCtx } from '@milkdown/core';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorState } from '@milkdown/prose/state';
import { diffWordsWithSpace } from 'diff';
import { blocksTouching, projectDoc, toDocPosition } from './textProjection';
import type { TextProjection } from './textProjection';

/**
 * Markiert im Editor, was gegenueber dem letzten Commit geaendert wurde:
 * hinzugefuegter Text gruen hinterlegt, an Loeschstellen ein senkrechter
 * roter Strich, und am linken Rand jedes betroffenen Blocks ein Balken.
 *
 * Alles davon sind DEKORATIONEN. Sie sind strukturell kein Teil des
 * Dokuments - der Serializer sieht sie nie. Dass keine Markierung in den
 * gespeicherten Wert gelangen kann, ist damit eine Zusicherung der
 * ProseMirror-API und nicht eine Frage der Sorgfalt. Das ist hier wesentlich,
 * weil der gespeicherte Wert byte-genau in eine versionierte Datei geht, die
 * anschliessend in einen 3-Wege-Merge laeuft.
 *
 * Der Loeschmarker zeigt den alten Text ABSICHTLICH nicht an, sondern nur
 * einen Strich (Zeichenzahl im Tooltip). Das war eine bewusste Entscheidung
 * und spart den gesamten Problemkreis eingeblendeten Textes: keine Kuerzung
 * bei grossen Loeschungen - im Bestand gibt es ein Feld mit 20.202 Zeichen -,
 * keine Sonderfaelle bei Pfeiltasten und Ruecktaste, nichts Fremdes in der
 * Zwischenablage.
 */

/** Der Vergleichsstand des gerade bearbeiteten Feldes, als Markdown. */
export const baselineCtx = $ctx<string | null, 'ticketDiffBaseline'>(
  null,
  'ticketDiffBaseline',
);

const diffKey = new PluginKey<DecorationSet>('ticketDiff');

/**
 * Oberhalb dieser Feldgroesse wird nicht mehr markiert.
 *
 * Der Wortvergleich selbst ist auch bei 20 KB im Millisekundenbereich, aber
 * er laeuft bei JEDEM Tastendruck. Die Grenze ist eine Reissleine fuer
 * Faelle, die niemand vorhergesehen hat - lieber keine Markierung als ein
 * hakender Editor.
 */
const MAX_LENGTH = 200_000;

export const ticketDiffPlugin = $prose((ctx) => {
  const baseline = ctx.get(baselineCtx.key);

  return new Plugin<DecorationSet>({
    key: diffKey,
    state: {
      init: (_config, state) => build(state.doc, baseline, ctx),
      apply: (tr, previous, _oldState, newState) =>
        // Nur neu rechnen, wenn sich wirklich etwas geaendert hat. Eine
        // blosse Cursorbewegung loest sonst bei jedem Klick einen
        // vollstaendigen Vergleich aus.
        tr.docChanged ? build(newState.doc, baseline, ctx) : previous,
    },
    props: {
      decorations(state: EditorState) {
        return diffKey.getState(state);
      },
    },
  });
});

/**
 * Baut die Dekorationen fuer den aktuellen Dokumentstand.
 *
 * Der Vergleichsstand wird mit DEMSELBEN Parser in ein zweites Dokument
 * gelesen. Das ist der Grund, warum die Normalisierung des Serializers hier
 * nicht stoert: sie trifft beide Seiten gleich und kuerzt sich heraus.
 */
function build(
  doc: ProseNode,
  baselineMarkdown: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
): DecorationSet {
  if (baselineMarkdown === null) return DecorationSet.empty;

  const current = projectDoc(doc);
  if (current.text.length > MAX_LENGTH || baselineMarkdown.length > MAX_LENGTH) {
    return DecorationSet.empty;
  }

  let baselineText: string;
  try {
    const parser = ctx.get(parserCtx);
    const baselineDoc = parser(baselineMarkdown) as ProseNode | null;
    if (!baselineDoc) return DecorationSet.empty;
    baselineText = projectDoc(baselineDoc).text;
  } catch {
    // Laesst sich der Vergleichsstand nicht lesen, gibt es eben keine
    // Markierung - der Editor bleibt davon unberuehrt.
    return DecorationSet.empty;
  }

  // Schnellweg fuer den Normalfall: die allermeisten Tickets sind
  // unveraendert. Gemessen am Bestand betrifft das 443 von 447.
  if (baselineText === current.text) return DecorationSet.empty;

  return decorationsFor(baselineText, current, doc);
}

function decorationsFor(
  baselineText: string,
  current: TextProjection,
  doc: ProseNode,
): DecorationSet {
  // diffWordsWithSpace, NICHT diffWords: letzteres normalisiert Leerraum und
  // zerstoert damit die Offset-Rechnung, auf der die Rueckabbildung beruht.
  // Wortweise statt zeichenweise, weil ein Zeichenvergleich aus "Zeit" ->
  // "Zeiten" eine Markierung nur auf "en" machte - mitten im Wort, und das
  // liest sich als Rauschen.
  const parts = diffWordsWithSpace(baselineText, current.text);

  const decorations: Decoration[] = [];
  const addedBlocks = new Set<number>();
  const removedBlocks = new Set<number>();

  // Laeuft ueber den NEUEN Text; nur dessen Offsets lassen sich auf
  // Dokumentpositionen abbilden. Entfernte Stuecke haben im neuen Text keine
  // Ausdehnung - sie markieren nur die Stelle, an der etwas fehlt.
  let offset = 0;
  let pendingRemoval = 0;

  for (const part of parts) {
    if (part.removed) {
      // Kann mehrfach hintereinander kommen, wenn mehrere Stuecke an
      // derselben Stelle wegfielen - dann zaehlt die Summe.
      pendingRemoval += part.value.length;
      continue;
    }

    if (pendingRemoval > 0) {
      const pos = toDocPosition(current, offset);
      decorations.push(removalMark(pos, pendingRemoval));
      for (const block of blocksTouching(current, offset, offset)) {
        removedBlocks.add(block.pmFrom);
      }
      pendingRemoval = 0;
    }

    const start = offset;
    const end = offset + part.value.length;

    if (part.added) {
      const from = toDocPosition(current, start);
      const to = toDocPosition(current, end);
      // Leere Bereiche entstehen, wenn ausschliesslich Blocktrenner
      // hinzukamen - dafuer gibt es keine Textstelle zum Hinterlegen.
      if (to > from) {
        decorations.push(Decoration.inline(from, to, { class: 'ticket-diff-added' }));
      }
      for (const block of blocksTouching(current, start, end)) {
        addedBlocks.add(block.pmFrom);
      }
    }

    offset = end;
  }

  // Eine Loeschung ganz am Ende hat kein nachfolgendes Stueck mehr, das sie
  // ausloest - deshalb hier noch einmal.
  if (pendingRemoval > 0) {
    const pos = toDocPosition(current, offset);
    decorations.push(removalMark(pos, pendingRemoval));
    for (const block of blocksTouching(current, offset, offset)) {
      removedBlocks.add(block.pmFrom);
    }
  }

  // Randbalken je Block. Rot gewinnt, wo beides zusammentrifft: eine
  // Loeschung ist das seltenere und das wichtigere Signal.
  for (const block of current.blocks) {
    const removed = removedBlocks.has(block.pmFrom);
    const added = addedBlocks.has(block.pmFrom);
    if (!removed && !added) continue;
    decorations.push(
      Decoration.node(block.pmFrom, block.pmTo, {
        class: removed ? 'ticket-diff-block ticket-diff-block-del' : 'ticket-diff-block',
      }),
    );
  }

  return DecorationSet.create(doc, decorations);
}

/**
 * Der senkrechte Strich an einer Loeschstelle.
 *
 * Das Element ist nullbreit; der sichtbare Strich entsteht in CSS ueber ein
 * Pseudoelement. Dadurch verschiebt der Marker nichts - Text bricht mit und
 * ohne ihn identisch um.
 */
function removalMark(pos: number, removedLength: number): Decoration {
  return Decoration.widget(
    pos,
    () => {
      const el = document.createElement('span');
      el.className = 'ticket-diff-removed-mark';
      el.setAttribute('contenteditable', 'false');
      el.setAttribute('aria-hidden', 'true');
      el.title = `${removedLength} Zeichen entfernt`;
      return el;
    },
    {
      side: -1,
      marks: [],
      // Ohne key vergleicht ProseMirror Widgets ueber die DOM-Identitaet.
      // Da die Dekorationen bei jedem Tastendruck neu gebaut werden, wuerde
      // sonst jedes Mal jeder Marker neu gezeichnet.
      key: `del-${pos}-${removedLength}`,
      // Der Marker steht zwischen zwei Zeichen und soll die Auswahl nicht
      // an sich ziehen.
      ignoreSelection: true,
      stopEvent: () => true,
    },
  );
}
