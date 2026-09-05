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
  | 'verbatim';

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

/**
 * Ein Absatz endet an einer Leerzeile oder dort, wo ein Konstrukt beginnt,
 * das selbst ein eigener Block ist. Ohne diese Pruefung wuerde eine
 * Ueberschrift direkt unter einer Textzeile in den Absatz gezogen.
 */
function startsNewBlock(line: string): boolean {
  return (
    line.trim() === ''
    || FENCE.test(line)
    || HEADING.test(line)
    || HR.test(line)
    || LIST_ITEM.test(line)
    || QUOTE.test(line)
  );
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
      push('verbatim', 0, close);
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
      push('codeFence', i, close);
      i = close + 1;
      continue;
    }

    if (line.trim() === '') {
      push('blank', i, i);
      i += 1;
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
    while (last + 1 < lines.length && !startsNewBlock(lines[last + 1])) last += 1;
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
