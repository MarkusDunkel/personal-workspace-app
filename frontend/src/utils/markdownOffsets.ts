import type { MdBlock, MdTableCell } from './markdownBlocks';
import { splitBlocks } from './markdownBlocks';
import type { InlineToken } from './markdownInline';
import { shift, tokenizeInline } from './markdownInline';

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
  | 'crossCell'
  | 'insideCode'
  | 'partialHighlight'
  | 'unmappable'
  | 'empty';

/**
 * Die Inline-Tokens EINES Blocks, blockrelativ.
 *
 * Fuer Tabellen wird JE ZELLE tokenisiert und das Ergebnis um den
 * Zellanfang verschoben. Das ist kein Feinschliff, sondern notwendig: ueber
 * den ganzen Block tokenisiert liefe der Tokenizer ueber Zeilenumbrueche und
 * Pipes hinweg, ein "*" in einer Zelle koennte mit einem "*" drei Zeilen
 * tiefer paaren, und applyHighlight schriebe eine zellenuebergreifende
 * Hervorhebung in die Datei.
 *
 * Weil die Offsets anschliessend blockrelativ sind, sind Zell-Tokens von
 * denen eines Absatzes nicht zu unterscheiden - enclosingHighlight,
 * setComment, removeComment und removeHighlight brauchen deshalb KEINEN
 * eigenen Zweig fuer Tabellen.
 *
 * MarkdownView muss genauso tokenisieren, sonst weicht das Umschalten einer
 * Hervorhebung von dem ab, was auf dem Bildschirm steht.
 */
export function blockTokens(block: MdBlock): InlineToken[] {
  if (block.kind !== 'table' || !block.rows) return tokenizeInline(block.source);
  const out: InlineToken[] = [];
  for (const row of block.rows) {
    // Die Trennzeile ist reine Syntax und wird nie gerendert.
    if (row.kind === 'delimiter') continue;
    for (const cell of row.cells) {
      out.push(...shift(tokenizeInline(cell.text), cell.textStart));
    }
  }
  return out;
}

/** Die Zelle, in der ein BLOCKRELATIVER Offset liegt (oder null). */
function cellAt(block: MdBlock, rel: number): MdTableCell | null {
  if (!block.rows) return null;
  for (const row of block.rows) {
    if (row.kind === 'delimiter') continue;
    for (const cell of row.cells) {
      if (rel >= cell.textStart && rel <= cell.textEnd) return cell;
    }
  }
  return null;
}

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
    // Kein Offset-Span darueber: der Punkt sitzt auf gerenderter DEKORATION,
    // die kein Quellzeichen vertritt - dem Aufzaehlungszeichen oder dem
    // Kaestchen einer Aufgabe (siehe MarkdownView, stripPrefix). Genau das
    // passiert, wenn ueber eine ganze Listenzeile markiert wird. Frueher gab
    // es hier null, die Auswahl fiel damit still durch und die
    // Schwebeleiste erschien nicht. Stattdessen wird nun auf den Block
    // GEKLEMMT - dieselbe Entscheidung wie in Fall 2, und der Grund, warum
    // sie dort ausbuchstabiert steht.
    if (!span) return clampToBlock(node.parentElement, nodeOffset <= 0);
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
    return clampToSpansIn(el, nodeOffset <= 0) ?? clampToBlock(el, nodeOffset <= 0);
  }

  return null;
}

/**
 * Klemmt auf den Anfang des ersten bzw. das Ende des letzten
 * offset-tragenden Spans UNTERHALB von `el`. Liefert null, wenn es dort
 * keinen gibt.
 */
function clampToSpansIn(el: HTMLElement | null, toStart: boolean): number | null {
  if (!el) return null;
  const spans = el.querySelectorAll<HTMLElement>('[data-ws-off]');
  if (spans.length === 0) return null;
  if (toStart) {
    const base = Number(spans[0].dataset.wsOff);
    return Number.isFinite(base) ? base : null;
  }
  const last = spans[spans.length - 1];
  const base = Number(last.dataset.wsOff);
  return Number.isFinite(base) ? base + (last.textContent?.length ?? 0) : null;
}

/**
 * Rettung fuer Punkte, die auf gerenderter Dekoration ohne Quellentsprechung
 * sitzen: vom naechstgelegenen BLOCK aus auf dessen ersten bzw. letzten
 * Offset-Span klemmen.
 *
 * Bewusst am Block (data-ws-block) verankert und nicht am Dokument: die
 * Auswahl darf dadurch niemals in einen NACHBARBLOCK rutschen - das waere
 * ein falscher Offset und damit genau die Klasse von Fehler, gegen die
 * dieses Modul gebaut ist. Ohne Block darueber bleibt es bei null, der
 * Aufrufer behandelt das weiterhin als "keine gueltige Markierung".
 */
function clampToBlock(from: HTMLElement | null, toStart: boolean): number | null {
  const block = from?.closest<HTMLElement>('[data-ws-block]');
  return block ? clampToSpansIn(block, toStart) : null;
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

  // Eine Hervorhebung darf keine Zellgrenze ueberschreiten - "==" wuerde
  // sonst ueber einen Pipe hinweg gesetzt und die Tabelle zerstoert. Die
  // Endprobe nimmt end-1, weil end exklusiv ist und eine Auswahl bis genau
  // textEnd noch in der Zelle liegt. Ein null-Ergebnis (Auswahl auf einem
  // Pipe oder in der Trennzeile) wird ebenfalls abgelehnt.
  if (block.kind === 'table') {
    const cell = cellAt(block, start - block.start);
    if (!cell) return 'crossCell';
    if (cellAt(block, end - 1 - block.start) !== cell) return 'crossCell';
  }

  const tokens = blockTokens(block);
  const relStart = start - block.start;
  const relEnd = end - block.start;

  // In Inline-Code ist "==" woertlich; ein Marker DARIN wuerde den Code
  // veraendern. Entscheidend ist deshalb, wo die Marker landen - nicht, ob
  // die Auswahl Code beruehrt:
  //
  //   `Person_076`          Auswahl umfasst den Code GANZ    -> erlaubt,
  //                         "==" kommt davor und dahinter zu stehen
  //   `Person_076`          Auswahl endet MITTEN im Code      -> abgelehnt,
  //                         "==" landete zwischen den Backticks
  //
  // Frueher wurde jede Beruehrung abgelehnt. Das machte ganze Zeilen
  // unkommentierbar, sobald irgendwo ein Code-Schnipsel darin vorkam - in
  // den Daily-Notizen stehen die Pseudonyme genau so (`Person_076`), also
  // praktisch jede Zeile. Einzelne Woerter daneben gingen weiterhin, was den
  // Fehler willkuerlich wirken liess.
  if (splitsCode(tokens, relStart, relEnd)) return 'insideCode';

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

  // Eine bestehende Hervorhebung VOLLSTAENDIG einzuschliessen ist ebenfalls
  // nicht moeglich: "==aussen ==innen== aussen==" hat keine eindeutige
  // Lesart, der Tokenizer beendet die neue Hervorhebung am ersten inneren
  // "==". Das Entfernen loeschte danach die falschen Zeichen.
  //
  // Frueher konnte dieser Fall gar nicht auftreten, weil solche Zeilen meist
  // schon an der Code-Regel scheiterten; seit die nur noch echtes
  // Zerschneiden ablehnt, muss er hier ausdruecklich stehen. In den
  // Daily-Notizen sind das die Aufgaben, die bereits eine kommentierte
  // Hervorhebung tragen.
  const encloses = tokens.some(
    (t) => t.kind === 'highlight' && relStart <= t.start && relEnd >= t.end,
  );
  if (encloses) return 'partialHighlight';

  return { start, end, block };
}

/**
 * Zerschneidet die Auswahl einen Inline-Code-Bereich?
 *
 * Wahr genau dann, wenn EINE der beiden Grenzen ECHT innerhalb eines
 * code-Tokens liegt (strikt zwischen start und end). Die Grenzen selbst
 * zaehlen nicht als "innerhalb": eine Auswahl, die genau am Code beginnt
 * oder endet, umschliesst ihn vollstaendig, und die Marker landen davor
 * bzw. dahinter.
 *
 * Damit bleibt der Code-Inhalt unantastbar - nur die frueher zusaetzlich
 * abgelehnten Faelle "Auswahl enthaelt Code komplett" sind jetzt erlaubt.
 */
function splitsCode(tokens: InlineToken[], start: number, end: number): boolean {
  for (const t of tokens) {
    if (t.kind === 'code') {
      // Grenze ECHT innerhalb: "==" landete zwischen den Backticks.
      if ((start > t.start && start < t.end) || (end > t.start && end < t.end)) return true;
      // Code VOLLSTAENDIG umschlossen ist grundsaetzlich in Ordnung - ausser
      // der Code enthaelt selbst "==". Dann liest der Tokenizer die neue
      // Hervorhebung beim naechsten Rendern an der falschen Stelle: aus
      // "==`a==b`==" wird nicht der ganze Bereich, sondern das "==" MITTEN im
      // Code als Ende gedeutet. Entfernen wuerde danach die falschen Zeichen
      // loeschen und den Zellinhalt zerstoeren ("`ab` in Backticks==").
      // Genau diesen Rundlauf prueft check-invariants.mjs [6].
      if (start <= t.start && end >= t.end && t.text.includes('==')) return true;
    }
    if ('children' in t && t.children && splitsCode(t.children, start, end)) return true;
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
  // blockTokens statt tokenizeInline: fuer Tabellen wird je Zelle
  // tokenisiert, genau wie im Renderer.
  return find(blockTokens(block));
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
