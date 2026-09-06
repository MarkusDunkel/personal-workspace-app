/**
 * Zerlegt ein Markdown-Dokument in Bloecke, die einzeln gerendert werden.
 *
 * Bewusst ein handgeschriebener Teilmengen-Parser und keine Bibliothek: die
 * beiden entscheidenden Konstrukte dieser Anwendung - ==Hervorhebung== und
 * ^[Kommentar] - kennt weder marked noch markdown-it, dort waere also ohnehin
 * eigener Tokenizer-Code faellig, nur innerhalb einer fremden Erweiterungs-API
 * und mit dangerouslySetInnerHTML (oder einem HTML-Parser) obendrauf.
 *
 * DIE TRAGENDE INVARIANTE, auf der alles Weitere beruht:
 *
 *     source.slice(b.start, b.end) === b.source     fuer JEDEN Block
 *
 * Daran haengt die Abbildung einer Textauswahl auf Zeichen-Offsets in der
 * Quelle (siehe markdownOffsets.ts). Dies ist die einzige Stelle, an der sich
 * ein Off-by-One in eine kaputte Datei uebersetzt - deshalb prueft das
 * Node-Skript sie fuer jeden Block jeder Beispieldatei.
 */

export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'listItem'
  | 'task'
  | 'codeFence'
  | 'quote'
  | 'blank'
  | 'hr'
  | 'table'
  | 'verbatim';

/** Spaltenausrichtung aus der Trennzeile (:--- / :---: / ---:). */
export type TableAlign = 'left' | 'center' | 'right' | null;

/**
 * EINE Zelle. Alle Offsets sind BLOCKRELATIV, wie bei InlineToken - der
 * Aufrufer rechnet mit block.start um.
 *
 * Es gilt zwingend, und das Pruefskript sichert es ab:
 *     block.source.slice(textStart, textEnd) === text
 */
export interface MdTableCell {
  /** Erstes Zeichen des Inhalts, hinter dem Auffuell-Leerraum. */
  textStart: number;
  /** Hinter dem letzten Zeichen (exklusiv), vor dem Auffuell-Leerraum. */
  textEnd: number;
  text: string;
}

export interface MdTableRow {
  kind: 'header' | 'delimiter' | 'body';
  /** Blockrelativer Offset des Zeilenanfangs. */
  start: number;
  cells: MdTableCell[];
}

export interface MdBlock {
  kind: BlockKind;
  /** Zeichen-Offset des Blockanfangs im Gesamtdokument. */
  start: number;
  /** Offset HINTER dem letzten Zeichen (exklusiv), ohne den trennenden \n. */
  end: number;
  /** Der Rohtext genau zwischen start und end. */
  source: string;
  /** heading: 1..6. listItem/task: Einruecktiefe in Leerzeichen. */
  level?: number;
  /** Nur task: ist die Box angekreuzt. */
  checked?: boolean;
  /** Nur listItem: geordnete Liste ("1." statt "-"). */
  ordered?: boolean;
  /** Nur table: Zeilen samt Zellen, alle Offsets blockrelativ. */
  rows?: MdTableRow[];
  /** Nur table: Ausrichtung je Spalte, aus der Trennzeile. */
  align?: TableAlign[];
  /**
   * Nur codeFence/verbatim: die Sprache aus der Info-Zeile ("```json" wird
   * zu "json"), kleingeschrieben. Bei verbatim (YAML-Frontmatter) fest
   * "yaml". undefined, wenn keine angegeben ist.
   */
  lang?: string;
  /**
   * Nur codeFence/verbatim: Offsets des INHALTS ohne die Zaun-Zeilen,
   * absolut im Dokument.
   *
   * ZUSAETZLICH zu start/end, niemals an deren Stelle: die tragende
   * Invariante bezieht sich weiterhin auf den GANZEN Block samt Zaeunen,
   * sonst wuerde replaceBlock die Zaeune wegschreiben. Es gilt
   * start <= innerStart <= innerEnd <= end.
   */
  innerStart?: number;
  innerEnd?: number;
}

/** Zeilen, die einen Code-Block oeffnen bzw. schliessen. */
const FENCE = /^\s*(```|~~~)/;
/** Waagerechte Linie: ---, ***, ___ (mindestens drei). */
const HR = /^\s*([-*_])\s*(\1\s*){2,}$/;
const HEADING = /^(#{1,6})\s+/;
/** "- ", "* ", "+ " oder "1. " / "1) ", mit beliebigem Einzug davor. */
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+/;
/** Aufgabenliste: "- [ ] " oder "- [x] ". */
const TASK = /^(\s*)[-*+]\s+\[([ xX])\]\s*/;
const QUOTE = /^\s*>/;
/** Zaun samt optionaler Info-Zeichenkette: ```json, ~~~ts. */
const FENCE_INFO = /^\s*(?:```|~~~)\s*([^\s`]*)/;
/** Trennzeile einer Tabelle: |---|:---:|---:| */
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * Eine Tabelle beginnt nur, wenn auf die Kopfzeile eine gueltige Trennzeile
 * folgt - so verlangt es GFM, und es ist zugleich der Schutz davor, eine
 * gewoehnliche Textzeile mit einem Strich darin als Tabelle zu lesen.
 *
 * Braucht daher Vorausschau auf die NAECHSTE Zeile und arbeitet deshalb auf
 * dem Zeilenfeld statt auf einer einzelnen Zeile.
 */
function isTableStart(lines: string[], i: number): boolean {
  if (i + 1 >= lines.length) return false;
  const line = lines[i];
  if (line.trim() === '' || line.indexOf('|') === -1) return false;
  const next = lines[i + 1];
  // Der Bindestrich-Test verhindert, dass eine Zeile aus lauter Pipes
  // ("| |") als Trennzeile durchgeht.
  return next.indexOf('-') !== -1 && TABLE_DELIM.test(next);
}

/**
 * Ein Absatz endet an einer Leerzeile oder dort, wo ein Konstrukt beginnt,
 * das selbst ein eigener Block ist. Ohne diese Pruefung wuerde eine
 * Ueberschrift direkt unter einer Textzeile in den Absatz gezogen.
 *
 * Bekommt das ganze Zeilenfeld, weil die Tabellenerkennung Vorausschau
 * braucht. Genau hier lag ein Fehler: eine Tabelle unmittelbar unter einer
 * Textzeile wurde in deren Absatz gezogen und danach als Fliesstext
 * gedeutet. Geprueft wird bewusst isTableStart und nicht blosses "|", damit
 * ein Absatz mit einem Pipe im Text nicht faelschlich zerteilt wird.
 */
function startsNewBlock(lines: string[], idx: number): boolean {
  const line = lines[idx];
  return (
    line.trim() === ''
    || FENCE.test(line)
    || HEADING.test(line)
    || HR.test(line)
    || LIST_ITEM.test(line)
    || QUOTE.test(line)
    || isTableStart(lines, idx)
  );
}

/** Ausrichtung aus einer Zelle der Trennzeile. */
function parseAlign(cell: string): TableAlign {
  const t = cell.trim();
  const left = t.startsWith(':');
  const right = t.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

/**
 * Zerlegt EINE Tabellenzeile in Zellen. `rowStart` ist der blockrelative
 * Offset des Zeilenanfangs; alle Rueckgabe-Offsets sind ebenfalls
 * blockrelativ.
 *
 * Zeichenweise statt per split/trim, und das ist der springende Punkt: der
 * Auffuell-Leerraum wird uebersprungen, indem der OFFSET vorrueckt, nicht
 * indem die Zeichenkette umgeschrieben wird. Nur so gilt hinterher
 * block.source.slice(textStart, textEnd) === text.
 */
function splitRowCells(line: string, rowStart: number): MdTableCell[] {
  const cells: MdTableCell[] = [];
  let i = 0;
  // Fuehrender Leerraum und ein optionaler fuehrender Pipe gehoeren zu
  // keiner Zelle.
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
  if (line[i] === '|') i += 1;

  let cellFrom = i;
  const flush = (to: number) => {
    let s = cellFrom;
    let e = to;
    while (s < e && (line[s] === ' ' || line[s] === '\t')) s += 1;
    // Das \r einer CRLF-Datei gehoert zur Zeile (siehe splitBlocks), darf
    // aber nicht als Zeichen im Zellinhalt landen - es wird deshalb wie
    // Leerraum abgeschnitten, und textEnd ist darueber ehrlich.
    while (e > s && (line[e - 1] === ' ' || line[e - 1] === '\t' || line[e - 1] === '\r')) e -= 1;
    cells.push({ textStart: rowStart + s, textEnd: rowStart + e, text: line.slice(s, e) });
  };

  while (i < line.length) {
    // "\|" ist KEINE Zellgrenze. Es bleibt aber als zwei Zeichen im Text
    // stehen: es zu entschaerfen wuerde jeden folgenden Offset dieser Zelle
    // um eins verschieben und die Abbildung auf die Quelle still zerstoeren.
    if (line[i] === '\\' && line[i + 1] === '|') {
      i += 2;
      continue;
    }
    if (line[i] === '|') {
      flush(i);
      i += 1;
      cellFrom = i;
      continue;
    }
    i += 1;
  }
  // Was hinter dem letzten Pipe steht, ist nur dann eine Zelle, wenn dort
  // mehr als Leerraum folgt - sonst war es der abschliessende Pipe.
  if (line.slice(cellFrom).trim() !== '') flush(line.length);
  return cells;
}

/**
 * Baut Zeilen und Ausrichtung einer Tabelle. `tableLines` sind die Zeilen
 * des Blocks, `lineStarts` deren blockrelative Anfangsoffsets.
 */
function parseTable(
  tableLines: string[],
  lineStarts: number[],
): { rows: MdTableRow[]; align: TableAlign[] } {
  const rows: MdTableRow[] = [];
  for (let n = 0; n < tableLines.length; n += 1) {
    const kind: MdTableRow['kind'] = n === 0 ? 'header' : n === 1 ? 'delimiter' : 'body';
    rows.push({ kind, start: lineStarts[n], cells: splitRowCells(tableLines[n], lineStarts[n]) });
  }
  const delimiter = rows[1];
  const align = delimiter ? delimiter.cells.map((c) => parseAlign(c.text)) : [];
  return { rows, align };
}

export function splitBlocks(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = source.split('\n');

  // Offset jedes Zeilenanfangs, vorab berechnet: pro Zeile deren Laenge plus
  // 1 fuer das \n. Stimmt damit auch bei \r\n, weil das \r als Teil der
  // Zeile gilt und mitgezaehlt wird - genau das haelt die slice-Invariante
  // auch fuer Dateien mit Windows-Zeilenenden.
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  let i = 0;

  const push = (kind: BlockKind, fromLine: number, toLine: number, extra?: Partial<MdBlock>) => {
    const start = lineOffsets[fromLine];
    // end ist das Ende der LETZTEN Zeile des Blocks, ohne deren \n.
    const end = lineOffsets[toLine] + lines[toLine].length;
    blocks.push({
      kind,
      start,
      end,
      source: source.slice(start, end),
      ...extra,
    });
  };

  // YAML-Frontmatter: "---" in der ERSTEN Zeile bis zum naechsten "---".
  // Obsidian-Vaults tragen das haeufig, und es darf nicht als waagerechte
  // Linie plus Textabsaetze zerfallen.
  if (lines.length > 0 && lines[0].trim() === '---') {
    let close = -1;
    for (let j = 1; j < lines.length; j += 1) {
      if (lines[j].trim() === '---') {
        close = j;
        break;
      }
    }
    if (close !== -1) {
      // Frontmatter ist per Definition YAML und traegt keine Info-Zeile -
      // die Sprache wird hier gesetzt, nicht gelesen. Die Begrenzer sind
      // "---" statt eines Zauns, deshalb rechnet dieser Zweig die
      // Inhaltsgrenzen selbst aus.
      const fmInner = lines[0].length + 1;
      push('verbatim', 0, close, {
        lang: 'yaml',
        innerStart: Math.min(fmInner, Math.max(fmInner, lineOffsets[close] - 1)),
        innerEnd: Math.max(fmInner, lineOffsets[close] - 1),
      });
      i = close + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Code-Bloecke greifen ZUERST und werden gierig bis zur schliessenden
    // Zeile verschluckt - sonst wuerde ihr Inhalt als Ueberschrift, Liste
    // oder Zitat missdeutet. Eine nicht geschlossene Zeichenkette reicht bis
    // zum Dateiende, wie es auch CommonMark vorsieht.
    if (FENCE.test(line)) {
      const marker = FENCE.exec(line)![1];
      let close = i;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].trimStart().startsWith(marker)) {
          close = j;
          break;
        }
        close = j;
      }
      const info = FENCE_INFO.exec(line);
      const lang = info && info[1] ? info[1].toLowerCase() : undefined;
      // Inhalt beginnt hinter dem \n der Oeffnungszeile.
      const innerStart = lineOffsets[i] + lines[i].length + 1;
      // Wurde der Zaun wirklich geschlossen, endet der Inhalt vor dessen \n;
      // sonst laeuft er bis zum Blockende.
      const closed = close > i && lines[close].trimStart().startsWith(marker);
      const rawInnerEnd = closed
        ? lineOffsets[close] - 1
        : lineOffsets[close] + lines[close].length;
      // Klemmen, sonst entsteht bei einem LEEREN Zaun (```json direkt
      // gefolgt von ```) ein umgekehrter Bereich und damit ein still
      // falscher Ausschnitt.
      const innerEnd = Math.max(innerStart, rawInnerEnd);
      push('codeFence', i, close, {
        lang,
        innerStart: Math.min(innerStart, innerEnd),
        innerEnd,
      });
      i = close + 1;
      continue;
    }

    if (line.trim() === '') {
      push('blank', i, i);
      i += 1;
      continue;
    }

    // Tabellen VOR hr/Liste/Zitat pruefen: eine Trennzeile wie "|---|---|"
    // soll nicht als waagerechte Linie zerfallen. Die Vorausschau in
    // isTableStart macht die Erkennung sicher genug fuer diese Stellung.
    if (isTableStart(lines, i)) {
      let last = i + 1; // Kopf- plus Trennzeile
      while (
        last + 1 < lines.length
        && lines[last + 1].trim() !== ''
        && lines[last + 1].indexOf('|') !== -1
      ) {
        last += 1;
      }
      const tableLines = lines.slice(i, last + 1);
      const base = lineOffsets[i];
      const lineStarts = tableLines.map((_, n) => lineOffsets[i + n] - base);
      const { rows, align } = parseTable(tableLines, lineStarts);
      push('table', i, last, { rows, align });
      i = last + 1;
      continue;
    }

    if (HR.test(line)) {
      push('hr', i, i);
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      push('heading', i, i, { level: heading[1].length });
      i += 1;
      continue;
    }

    const task = TASK.exec(line);
    if (task) {
      push('task', i, i, {
        level: task[1].length,
        checked: task[2].toLowerCase() === 'x',
      });
      i += 1;
      continue;
    }

    const listItem = LIST_ITEM.exec(line);
    if (listItem) {
      // Bewusst EIN Block je Listeneintrag, ohne <ul>-Verschachtelung: so
      // bleibt jeder Eintrag eigenstaendig adressierbar und die
      // slice-Invariante trivial gueltig. Der Einzug wird als Abstand
      // gerendert, optisch ist das fuer diese Dokumente nicht zu
      // unterscheiden.
      push('listItem', i, i, {
        level: listItem[1].length,
        ordered: /\d/.test(listItem[2]),
      });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      // Aufeinanderfolgende Zitatzeilen bilden EINEN Block.
      let last = i;
      while (last + 1 < lines.length && QUOTE.test(lines[last + 1])) last += 1;
      push('quote', i, last);
      i = last + 1;
      continue;
    }

    // Absatz: laeuft bis zur naechsten Zeile, die selbst einen Block
    // eroeffnet.
    let last = i;
    while (last + 1 < lines.length && !startsNewBlock(lines, last + 1)) last += 1;
    push('paragraph', i, last);
    i = last + 1;
  }

  return blocks;
}

/**
 * Ersetzt die Quelle EINES Blocks und gibt das vollstaendige Dokument
 * zurueck.
 *
 * Weil start/end zeichengenau sind, kann diese Operation nichts ausserhalb
 * des Blocks beruehren - auch keine Tabellen oder Code-Bloecke, die der
 * Renderer gar nicht vollstaendig versteht. Das ist die eigentliche
 * Sicherheitszusage der Blockzerlegung.
 */
export function replaceBlock(source: string, block: MdBlock, newBlockSource: string): string {
  return source.slice(0, block.start) + newBlockSource + source.slice(block.end);
}
