import { $ctx, $prose } from '@milkdown/utils';
import { parserCtx } from '@milkdown/core';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorState } from '@milkdown/prose/state';
import { diffProjections } from './textDiff';
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
 * Der Loeschmarker zeigt den alten Text ABSICHTLICH nicht im Fliesstext an,
 * sondern nur einen Strich. Das war eine bewusste Entscheidung und spart den
 * gesamten Problemkreis eingeblendeten Textes: keine Kuerzung bei grossen
 * Loeschungen - im Bestand gibt es ein Feld mit 20.202 Zeichen -, keine
 * Sonderfaelle bei Pfeiltasten und Ruecktaste, nichts Fremdes in der
 * Zwischenablage. Der Tooltip zeigt kurze Loeschungen im Wortlaut, laengere
 * nur als Zeichenzahl (siehe removalTitle).
 */

/**
 * Bis zu dieser Laenge steht der entfernte Text selbst im Tooltip. Darueber
 * wird ein Tooltip zur Textwand, und die Zeichenzahl sagt mehr.
 */
const REMOVED_TEXT_MAX = 50;

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

  let baseline: TextProjection;
  try {
    const parser = ctx.get(parserCtx);
    const baselineDoc = parser(baselineMarkdown) as ProseNode | null;
    if (!baselineDoc) return DecorationSet.empty;
    baseline = projectDoc(baselineDoc);
  } catch {
    // Laesst sich der Vergleichsstand nicht lesen, gibt es eben keine
    // Markierung - der Editor bleibt davon unberuehrt.
    return DecorationSet.empty;
  }

  // Schnellweg fuer den Normalfall: die allermeisten Tickets sind
  // unveraendert. Gemessen am Bestand betrifft das 443 von 447.
  if (baseline.text === current.text) return DecorationSet.empty;

  return decorationsFor(baseline, current, doc);
}

function decorationsFor(
  baseline: TextProjection,
  current: TextProjection,
  doc: ProseNode,
): DecorationSet {
  // Erst blockweise, dann wortweise ohne Leerraum - siehe textDiff.ts.
  // Wortweise statt zeichenweise, weil ein Zeichenvergleich aus "Zeit" ->
  // "Zeiten" eine Markierung nur auf "en" machte - mitten im Wort, und das
  // liest sich als Rauschen.
  const { added, removed } = diffProjections(baseline, current);

  const decorations: Decoration[] = [];
  const addedBlocks = new Set<number>();
  const removedBlocks = new Set<number>();

  // Alle Offsets beziehen sich auf den NEUEN Text; nur dessen Offsets lassen
  // sich auf Dokumentpositionen abbilden. Entfernte Stuecke haben dort keine
  // Ausdehnung - sie markieren nur die Stelle, an der etwas fehlt.
  for (const { from: start, to: end } of added) {
    const from = toDocPosition(current, start);
    const to = toDocPosition(current, end);
    if (to > from) {
      decorations.push(Decoration.inline(from, to, { class: 'ticket-diff-added' }));
    }
    for (const block of blocksTouching(current, start, end)) {
      addedBlocks.add(block.pmFrom);
    }
  }

  for (const { at, text } of removed) {
    decorations.push(removalMark(toDocPosition(current, at), text));
    for (const block of blocksTouching(current, at, at)) {
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
function removalMark(pos: number, removedText: string): Decoration {
  const title = removalTitle(removedText);
  return Decoration.widget(
    pos,
    () => {
      const el = document.createElement('span');
      el.className = 'ticket-diff-removed-mark';
      el.setAttribute('contenteditable', 'false');
      el.setAttribute('aria-hidden', 'true');
      el.title = title;
      return el;
    },
    {
      side: -1,
      marks: [],
      // Ohne key vergleicht ProseMirror Widgets ueber die DOM-Identitaet.
      // Da die Dekorationen bei jedem Tastendruck neu gebaut werden, wuerde
      // sonst jedes Mal jeder Marker neu gezeichnet. Der Tooltip gehoert in
      // den key: sonst bliebe bei gleicher Stelle der alte Wortlaut stehen.
      key: `del-${pos}-${title}`,
      // Der Marker steht zwischen zwei Zeichen und soll die Auswahl nicht
      // an sich ziehen.
      ignoreSelection: true,
      stopEvent: () => true,
    },
  );
}

/** Kurze Loeschungen im Wortlaut, laengere nur als Zeichenzahl. */
function removalTitle(removedText: string): string {
  return removedText.length < REMOVED_TEXT_MAX
    ? `Entfernt: „${removedText}“`
    : `${removedText.length} Zeichen entfernt`;
}
