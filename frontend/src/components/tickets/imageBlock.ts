import { $nodeSchema, $remark } from '@milkdown/utils';

/**
 * Ein allein stehendes `<img …>` als SICHTBARES Bild im Editor.
 *
 * Warum ein eigener Knoten und nicht der mitgelieferte `image` aus
 * preset-commonmark: dessen Serialisierer schreibt die Markdown-Kurzform
 * `![alt](url)` zurueck. Damit aendert schon das blosse Oeffnen und Speichern
 * eines Tickets den Feldwert - und zwar in eine Form, die Azure fuer
 * Attachment-Adressen mit Abfrage ("...attachments/<guid>?fileName=x.png")
 * nicht gleichwertig rendert. DESCRIPTION-FORMAT.md verlangt den Tag.
 *
 * Deshalb derselbe Weg wie bei der Markierung (siehe highlightMark.ts): Remark
 * liefert die Zeile als html-BLOCKknoten (nachgemessen am echten Wert von
 * Ticket 584). Ein $remark-Plugin macht daraus beim LADEN einen eigenen
 * Knoten, der den Originaltext ungeschnitten mitfuehrt; beim SPEICHERN wird
 * genau dieser Text wieder ausgegeben - zeichengleich, inklusive aller
 * Attribute und ihrer Reihenfolge.
 *
 * Bewusst NUR der allein stehende Block, passend zur Erkennung in
 * DescriptionDialect.java. Ein `<img>` mitten im Fliesstext bleibt ein
 * inline-html-Knoten und wird nicht angefasst - dort steht es ohnehin neben
 * Azure-Markup, und das Feld ist dann gar kein Markdown.
 */

/** Greift nur auf einen html-Knoten, der AUSSCHLIESSLICH aus einem img-Tag besteht. */
const ONLY_IMG = /^\s*<img\b[^>]*>\s*$/i;

/** Liest ein einzelnes Attribut aus dem Rohtag - nur fuer die Anzeige. */
function attr(raw: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(raw);
  return match ? match[1] : '';
}

export const imageBlockSchema = $nodeSchema('ticketImageBlock', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  attrs: {
    /**
     * Der unveraenderte Originaltag. Er ist die Quelle der Wahrheit: src und
     * alt unten werden nur fuer die Darstellung daraus gelesen, geschrieben
     * wird immer dieser Text.
     */
    raw: { default: '' },
  },
  // Kein parseDOM ueber "img": der Knoten entsteht ausschliesslich aus dem
  // Markdown (siehe remarkImageBlockPlugin). Ein eingefuegtes Bild aus der
  // Zwischenablage soll weiterhin der gewoehnliche image-Knoten sein.
  toDOM: (node) => {
    const raw = String(node.attrs.raw ?? '');
    return [
      'div',
      { class: 'ticket-image-block' },
      ['img', { src: attr(raw, 'src'), alt: attr(raw, 'alt'), class: 'ticket-image' }],
    ];
  },
  parseMarkdown: {
    match: ({ type }) => type === 'ticketImageBlock',
    runner: (state, node, type) => {
      state.addNode(type, { raw: (node as { value?: string }).value ?? '' });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'ticketImageBlock',
    /**
     * Schreibt den Originaltag zurueck - als html-Knoten, damit remark ihn
     * unveraendert ausgibt und nicht etwa maskiert.
     */
    runner: (state, node) => {
      state.addNode('html', undefined, String(node.attrs.raw ?? ''));
    },
  },
}));

interface TreeNode {
  type: string;
  value?: string;
  children?: TreeNode[];
}

/**
 * Macht beim LADEN aus dem html-Blockknoten einen ticketImageBlock.
 *
 * Nur auf oberster Ebene noetig waere zu eng gedacht - ein Bild kann auch in
 * einem Listenpunkt oder Zitat stehen, deshalb wird der Baum durchlaufen.
 * Inline-html (im Fliesstext) erreicht diese Stelle nicht, weil dort der
 * html-Knoten Geschwister im selben Absatz hat und der Wert entsprechend nicht
 * NUR aus dem Tag besteht.
 */
export const remarkImageBlockPlugin = $remark(
  'remarkTicketImageBlock',
  () => () => (tree: TreeNode) => {
    const visit = (node: TreeNode) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (child.type === 'html' && typeof child.value === 'string' && ONLY_IMG.test(child.value)) {
          return { type: 'ticketImageBlock', value: child.value };
        }
        visit(child);
        return child;
      });
    };
    visit(tree);
  },
);
