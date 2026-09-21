import { $command, $markSchema, $remark, $useKeymap } from '@milkdown/utils';
import { commandsCtx } from '@milkdown/core';
import { toggleMark } from '@milkdown/prose/commands';
import type { MarkdownNode } from '@milkdown/transformer';

/**
 * Gelbe Markierung (Textmarker) als eigener Milkdown-Mark, serialisiert zu
 * `<mark>…</mark>`.
 *
 * Warum ein eigener Mark noetig ist: Remark kennt kein Highlight-Konstrukt.
 * Es zerlegt `<mark>Text</mark>` in DREI Knoten - `html("<mark>")`,
 * `text("Text")`, `html("</mark>")` - also gerade kein zusammenhaengendes
 * Element. Ohne diesen Mark bleibt der Text zwar erhalten, die Tags stehen
 * aber als Quelltext im Editor statt als Markierung.
 *
 * Warum `<mark>` und nicht `==Text==`: ai-vault/DESCRIPTION-FORMAT.md schreibt
 * es verbindlich vor - "Die Markierung wird mit dem HTML-Tag `<mark>` gesetzt
 * und ausschliesslich damit". Azure kennt die aus Obsidian/Notion bekannte
 * `==`-Syntax NICHT; die Gleichheitszeichen blieben als Literaltext stehen.
 * Genau diese Doppelform (`==<mark>x</mark>==`) trat bei Ticket #564 auf und
 * war der Anlass fuer die Regel.
 */

/** Das Tag, mit dem Azure Hervorhebungen fuehrt. */
const OPEN = '<mark>';
const CLOSE = '</mark>';

export const highlightSchema = $markSchema('highlight', () => ({
  parseDOM: [{ tag: 'mark' }],
  toDOM: () => ['mark', { class: 'ticket-highlight' }],
  parseMarkdown: {
    // Greift nicht: Remark liefert keinen zusammenhaengenden Knoten, den man
    // hier matchen koennte. Das Zusammensetzen beim LADEN uebernimmt deshalb
    // remarkHighlightPlugin (siehe unten) - hier bleibt nur der Vertrag, den
    // $markSchema verlangt.
    match: (node) => node.type === 'highlight',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next((node as MarkdownNode).children ?? []);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'highlight',
    /**
     * Erzeugt einen EIGENEN mdast-Knoten "highlight", der den Inhalt als
     * Kinder traegt. Die Tags schreibt erst der Stringify-Handler
     * (highlightStringifyHandler unten) darum herum.
     *
     * Warum nicht einfach `withMark(mark, 'html', '<mark>')`: mdast kennt
     * keinen html-Knoten MIT Kindern. Ein
     * `{type:'html', value:'<mark>', children:[...]}` serialisiert zu bloss
     * "<mark>" - die Kinder fallen weg, der markierte Text wird also
     * ERSETZT statt eingerahmt. Genau dieser Fehler war in der ersten
     * Fassung drin.
     */
    runner: (state, mark) => {
      state.withMark(mark, 'highlight');
    },
  },
}));

/**
 * Schreibt den highlight-Knoten als `<mark>…</mark>`.
 *
 * Gehoert als `handlers`-Eintrag in die remark-stringify-Optionen (siehe
 * MilkdownDescriptionEditor). containerPhrasing serialisiert die Kinder mit
 * allen darin enthaltenen Auszeichnungen - Fettschrift innerhalb einer
 * Markierung bleibt damit erhalten.
 */
export const highlightStringifyHandler = {
  highlight(
    node: { children?: unknown[] },
    _parent: unknown,
    state: { containerPhrasing: (n: unknown, info: unknown) => string },
    info: object,
  ) {
    return OPEN + state.containerPhrasing(node, { ...info, before: '>', after: '<' }) + CLOSE;
  },
};

interface InlineNode {
  type: string;
  value?: string;
  children?: InlineNode[];
}

/**
 * Fasst beim LADEN die drei Remark-Knoten `html("<mark>")`, Inhalt,
 * `html("</mark>")` wieder zu EINEM `highlight`-Knoten zusammen, den das
 * Mark-Schema oben verarbeiten kann.
 *
 * Ohne diesen Schritt kaeme der Text zwar unbeschadet durch, die Tags stuenden
 * aber sichtbar im Editor. Nicht geschlossene oder verschachtelte Tags werden
 * bewusst NICHT angefasst - sie laufen als gewoehnliches html durch und
 * bleiben damit unveraendert erhalten.
 */
function collapseHighlights(children: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.type !== 'html' || node.value !== OPEN) {
      out.push(node.children ? { ...node, children: collapseHighlights(node.children) } : node);
      continue;
    }
    const end = children.findIndex(
      (n, j) => j > i && n.type === 'html' && n.value === CLOSE,
    );
    if (end === -1) {
      // Kein schliessendes Tag - unveraendert durchreichen.
      out.push(node);
      continue;
    }
    out.push({ type: 'highlight', children: collapseHighlights(children.slice(i + 1, end)) });
    i = end;
  }
  return out;
}

export const remarkHighlightPlugin = $remark('remarkHighlight', () => () => (tree: InlineNode) => {
  const visit = (node: InlineNode) => {
    if (!node.children) return;
    node.children = collapseHighlights(node.children);
    node.children.forEach(visit);
  };
  visit(tree);
});

export const toggleHighlightCommand = $command(
  'ToggleHighlight',
  (ctx) => () => toggleMark(highlightSchema.type(ctx)),
);

/** Strg+Umschalt+H - angelehnt an die Kuerzel der uebrigen Marks (Mod-Alt-x fuer Durchstreichen). */
export const highlightKeymap = $useKeymap('highlightKeymap', {
  ToggleHighlight: {
    shortcuts: 'Mod-Shift-h',
    command: (ctx) => {
      const commands = ctx.get(commandsCtx);
      return () => commands.call(toggleHighlightCommand.key);
    },
  },
});

export { OPEN as HIGHLIGHT_OPEN, CLOSE as HIGHLIGHT_CLOSE };
