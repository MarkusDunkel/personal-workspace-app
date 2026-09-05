import type { MdBlock } from './markdownBlocks';
import { splitBlocks } from './markdownBlocks';
import type { InlineToken } from './markdownInline';
import { tokenizeInline } from './markdownInline';

/**
 * Bildet eine Textauswahl im GERENDERTEN Dokument auf Zeichen-Offsets in der
 * Markdown-Quelle ab und setzt Hervorhebungen bzw. Kommentare.
 *
 * Die Abbildung TRAEGT die Offsets, sie sucht sie nicht: jedes Text-Token
 * wird als <span data-ws-off="..."> gerendert (siehe MarkdownView), und der
 * Textinhalt so eines Spans ist per Konstruktion genau
 * source.slice(off, off + len). Innerhalb eines Spans gilt daher
 *
 *     Quell-Offset = data-ws-off + DOM-Zeichenindex
 *
 * ohne jede Unschaerfe. Ein Vergleich per Textsuche waere bei wiederholten
 * Woertern ("und", "Projekt", "Zeiterfassung") mehrdeutig - genau die
 * Fehlerklasse, die bulletText.ts als "Drift" beschreibt und deren
 * Vermeidung der Grund fuer diesen Entwurf ist.
 *
 * Bis auf domPointToSourceOffset ist alles hier DOM-frei und damit im
 * Node-Skript pruefbar.
 */

/** Ergebnis einer gueltigen Auswahl, in Dokument-Offsets. */
export interface SourceSelection {
  start: number;
  end: number;
  /** Der Block, in dem die Auswahl liegt. */
  block: MdBlock;
}

export type SelectionProblem =
  | 'crossBlock'
  | 'insideCode'
  | 'partialHighlight'
  | 'empty';

/**
 * Rechnet eine DOM-Position (Knoten plus Offset darin) in einen
 * Zeichen-Offset im Gesamtdokument zurueck.
 *
 * Liefert null, wenn die Position in keinem offset-tragenden Span liegt -
 * etwa auf einem Syntaxzeichen, das gar nicht gerendert wird, oder auf einem
 * Kommentar-Marker. Der Aufrufer behandelt null als "keine gueltige
 * Markierung" statt zu raten.
 *
 * ACHTUNG: In diesem Projekt ist `strict` in tsconfig.app.json NICHT aktiv,
 * der Compiler erzwingt die null-Pruefung also nicht. Jede Aufrufstelle muss
 * sie von Hand machen.
 */
export function domPointToSourceOffset(node: Node, nodeOffset: number): number | null {
  // Fall 1: Position in einem Textknoten innerhalb eines Spans mit Offset.
  if (node.nodeType === Node.TEXT_NODE) {
    const span = node.parentElement?.closest<HTMLElement>('[data-ws-off]');
    if (!span) return null;
    const base = Number(span.dataset.wsOff);
    if (!Number.isFinite(base)) return null;
    // Vorangehende Textknoten INNERHALB desselben Spans mitzaehlen. In der
    // Regel gibt es nur einen, aber darauf zu bauen waere unnoetig fragil.
    let before = 0;
    for (let i = 0; i < span.childNodes.length; i += 1) {
      const child = span.childNodes[i];
      if (child === node) break;
      before += child.textContent?.length ?? 0;
    }
    return base + before + nodeOffset;
  }

  // Fall 2: Der Browser meldet ein ELEMENT plus Kindindex. Das passiert an
  // Blockgrenzen und nach einem Doppelklick am Wortrand. Hier wird GEKLEMMT,
  // nicht geraten: die Position wandert auf den Anfang bzw. das Ende des
  // naechstgelegenen offset-tragenden Spans.
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const own = el.closest<HTMLElement>('[data-ws-off]');
    if (own) {
      const base = Number(own.dataset.wsOff);
      if (!Number.isFinite(base)) return null;
      let before = 0;
      for (let i = 0; i < Math.min(nodeOffset, el.childNodes.length); i += 1) {
        before += el.childNodes[i].textContent?.length ?? 0;
      }
      return base + before;
    }
    // Kein eigener Offset: auf den ersten bzw. letzten Span darunter klemmen.
    const spans = el.querySelectorAll<HTMLElement>('[data-ws-off]');
    if (spans.length === 0) return null;
    if (nodeOffset <= 0) {
      const first = spans[0];
      const base = Number(first.dataset.wsOff);
      return Number.isFinite(base) ? base : null;
    }
    const last = spans[spans.length - 1];
    const base = Number(last.dataset.wsOff);
    return Number.isFinite(base) ? base + (last.textContent?.length ?? 0) : null;
  }

  return null;
}

/** Der Block, in dem ein Dokument-Offset liegt (oder null). */
export function blockAt(source: string, offset: number): MdBlock | null {
  return splitBlocks(source).find((b) => offset >= b.start && offset <= b.end) ?? null;
}

/**
 * Zieht eine Auswahl auf sinnvolle Grenzen und prueft, ob sie ueberhaupt
 * hervorhebbar ist.
 *
 * Die Beschneidung der Rand-Leerzeichen ist keine Kosmetik: Obsidian
 * rendert "==Text ==" NICHT als Hervorhebung, weil die Marker an
 * Nicht-Leerzeichen anliegen muessen. Hier wird also der Vertrag mit der
 * Datei durchgesetzt, die die KI spaeter liest.
 */
export function normalizeSelection(
  source: string,
  rawStart: number,
  rawEnd: number,
): SourceSelection | SelectionProblem {
  let start = Math.min(rawStart, rawEnd);
  let end = Math.max(rawStart, rawEnd);

  const startBlock = blockAt(source, start);
  const endBlock = blockAt(source, end);
  if (!startBlock || !endBlock) return 'empty';
  // Eine Hervorhebung kann in Markdown keine Absatzgrenze ueberschreiten -
  // die Ablehnung ist also korrekt und keine Einschraenkung.
  if (startBlock.start !== endBlock.start) return 'crossBlock';

  const block = startBlock;
  if (block.kind === 'codeFence' || block.kind === 'verbatim') return 'insideCode';

  // Rand-Leerzeichen abschneiden.
  while (start < end && /\s/.test(source[start])) start += 1;
  while (end > start && /\s/.test(source[end - 1])) end -= 1;
  if (end <= start) return 'empty';

  const tokens = tokenizeInline(block.source);
  const relStart = start - block.start;
  const relEnd = end - block.start;

  // In Inline-Code ist "==" woertlich; ein Marker dort wuerde den Code
  // veraendern.
  if (overlapsKind(tokens, relStart, relEnd, 'code')) return 'insideCode';

  // Eine bestehende Hervorhebung nur teilweise zu ueberdecken, fuehrt zu
  // verschachtelten Markern ohne Nutzen. Vollstaendig darin liegend ist
  // dagegen erlaubt - das ist der Weg zum Umschalten (siehe applyHighlight).
  const partial = tokens.some(
    (t) =>
      t.kind === 'highlight'
      && ((relStart > t.start && relStart < t.end && relEnd > t.end)
        || (relEnd > t.start && relEnd < t.end && relStart < t.start)),
  );
  if (partial) return 'partialHighlight';

  return { start, end, block };
}

function overlapsKind(
  tokens: InlineToken[],
  start: number,
  end: number,
  kind: InlineToken['kind'],
): boolean {
  for (const t of tokens) {
    if (t.kind === kind && start < t.end && end > t.start) return true;
    if ('children' in t && t.children && overlapsKind(t.children, start, end, kind)) return true;
  }
  return false;
}

/** Die Hervorhebung, die den Bereich vollstaendig umschliesst (oder null). */
export function enclosingHighlight(
  block: MdBlock,
  start: number,
  end: number,
): Extract<InlineToken, { kind: 'highlight' }> | null {
  const relStart = start - block.start;
  const relEnd = end - block.start;
  const find = (
    list: InlineToken[],
  ): Extract<InlineToken, { kind: 'highlight' }> | null => {
    for (const t of list) {
      if (t.kind === 'highlight' && relStart >= t.start && relEnd <= t.end) return t;
      if ('children' in t && t.children) {
        const inner = find(t.children);
        if (inner) return inner;
      }
    }
    return null;
  };
  return find(tokenizeInline(block.source));
}

/**
 * Ein "]" im Kommentartext wuerde "^[...]" vorzeitig beenden, ein
 * Zeilenumbruch den Block sprengen. Beides wird maskiert bzw. ersetzt -
 * bewusst nichts stillschweigend verworfen, der Nutzer soll seinen Text
 * wiederfinden.
 */
export function escapeCommentText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/]/g, '\\]').replace(/\s*\n\s*/g, ' ').trim();
}

/** Die Rueckrichtung, fuer das Vorbelegen des Eingabefelds. */
export function unescapeCommentText(text: string): string {
  return text.replace(/\\]/g, ']').replace(/\\\\/g, '\\');
}

/**
 * Setzt "==" um den Bereich und haengt optional "^[Kommentar]" an.
 *
 * Arbeitet auf dem GESAMTDOKUMENT, aber ausschliesslich innerhalb der
 * Blockgrenzen der Auswahl - der Aufrufer hat sie ueber normalizeSelection
 * geprueft. Alles ausserhalb bleibt damit unberuehrt, auch Tabellen und
 * Code-Bloecke, die der Renderer nicht vollstaendig versteht.
 *
 * Liegt der Bereich schon vollstaendig in einer Hervorhebung, wird NICHT
 * verschachtelt:
 *   - mit Kommentar: der Kommentar wird gesetzt bzw. ersetzt
 *   - ohne Kommentar: die Hervorhebung wird entfernt (Umschalten)
 * Das gibt das Aufheben gratis und entspricht der Erwartung an einen
 * Textmarker.
 */
export function applyHighlight(
  source: string,
  selection: SourceSelection,
  comment?: string,
): string {
  const existing = enclosingHighlight(selection.block, selection.start, selection.end);
  if (existing) {
    if (comment === undefined) {
      return removeHighlight(source, selection.block, existing);
    }
    return setComment(source, selection.block, existing, comment);
  }

  const suffix = comment === undefined ? '' : `^[${escapeCommentText(comment)}]`;
  return (
    source.slice(0, selection.start)
    + '=='
    + source.slice(selection.start, selection.end)
    + '=='
    + suffix
    + source.slice(selection.end)
  );
}

/** Setzt oder ersetzt den Kommentar einer bestehenden Hervorhebung. */
export function setComment(
  source: string,
  block: MdBlock,
  highlight: Extract<InlineToken, { kind: 'highlight' }>,
  comment: string,
): string {
  const escaped = escapeCommentText(comment);
  // Ein leerer Kommentar bedeutet "Kommentar entfernen, Hervorhebung
  // behalten" - sonst entstuende "^[]", das Obsidian als leere Fussnote
  // rendert.
  const replacement = escaped === '' ? '' : `^[${escaped}]`;
  if (highlight.comment) {
    const from = block.start + highlight.comment.start;
    const to = block.start + highlight.comment.end;
    return source.slice(0, from) + replacement + source.slice(to);
  }
  const at = block.start + highlight.end;
  return source.slice(0, at) + replacement + source.slice(at);
}

/** Entfernt nur den Kommentar; die Hervorhebung bleibt. */
export function removeComment(
  source: string,
  block: MdBlock,
  highlight: Extract<InlineToken, { kind: 'highlight' }>,
): string {
  if (!highlight.comment) return source;
  const from = block.start + highlight.comment.start;
  const to = block.start + highlight.comment.end;
  return source.slice(0, from) + source.slice(to);
}

/** Entfernt Hervorhebung UND Kommentar, der Text selbst bleibt. */
export function removeHighlight(
  source: string,
  block: MdBlock,
  highlight: Extract<InlineToken, { kind: 'highlight' }>,
): string {
  const absStart = block.start + highlight.start;
  const absEnd = block.start + highlight.end;
  // Der Inhalt zwischen den Markern, ohne "==" und ohne "^[...]".
  const innerStart = absStart + 2;
  const innerEnd = highlight.comment
    ? block.start + highlight.comment.start - 2
    : absEnd - 2;
  return source.slice(0, absStart) + source.slice(innerStart, innerEnd) + source.slice(absEnd);
}
