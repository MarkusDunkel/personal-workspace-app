/**
 * Zerlegt den Text EINES Blocks in Inline-Tokens.
 *
 * Alle Offsets sind relativ zum uebergebenen Text (also zur Block-Quelle),
 * nicht zum Gesamtdokument. Der Aufrufer rechnet mit block.start um.
 *
 * Die beiden eigenen Konstrukte sind der Zweck dieser Anwendung:
 *   ==Text==            Hervorhebung
 *   ==Text==^[Notiz]    Hervorhebung mit Kommentar
 * Beides ist etablierte Obsidian-Syntax - der knowledge-hub ist ein
 * Obsidian-Vault, dort rendert es also ohne Zutun richtig. Die Datei ist der
 * Vertrag mit der KI, die sie in VS Code wieder einliest.
 */

export type InlineToken =
  | { kind: 'text'; start: number; end: number; text: string }
  | { kind: 'code'; start: number; end: number; text: string }
  | { kind: 'strong'; start: number; end: number; children: InlineToken[] }
  | { kind: 'em'; start: number; end: number; children: InlineToken[] }
  | {
      kind: 'highlight';
      start: number;
      end: number;
      children: InlineToken[];
      /** Der zugehoerige ^[...]-Kommentar, falls er DIREKT folgt. */
      comment?: { start: number; end: number; text: string };
    }
  | { kind: 'comment'; start: number; end: number; text: string }
  | { kind: 'link'; start: number; end: number; text: string; href: string };

/**
 * Sucht die schliessende Klammer zu einer oeffnenden an Position `open`,
 * zaehlend, damit verschachtelte Klammern nicht zu frueh beenden:
 * "^[siehe [Doku](x)]" ist EIN Kommentar. Bewusst eine Schleife und kein
 * regulaerer Ausdruck - Klammerbalance ist regulaer nicht ausdrueckbar.
 *
 * Liefert den Index der schliessenden Klammer oder -1.
 */
function matchBracket(text: string, open: number, openChar: string, closeChar: string): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '\\') {
      // Maskiertes Zeichen ueberspringen - so beendet ein "\]" im
      // Kommentartext ihn nicht (siehe escapeCommentText in
      // markdownOffsets.ts).
      i += 1;
      continue;
    }
    if (c === openChar) depth += 1;
    else if (c === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Liest ein "^[...]" ab Position i. Liefert null, wenn dort keines steht. */
function readComment(text: string, i: number): { end: number; body: string } | null {
  if (text[i] !== '^' || text[i + 1] !== '[') return null;
  const close = matchBracket(text, i + 1, '[', ']');
  if (close === -1) return null;
  return { end: close + 1, body: text.slice(i + 2, close) };
}

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Anfang des noch nicht abgeschlossenen Text-Tokens.
  let plainStart = 0;
  let i = 0;

  const flushPlain = (upTo: number) => {
    if (upTo > plainStart) {
      tokens.push({
        kind: 'text',
        start: plainStart,
        end: upTo,
        text: text.slice(plainStart, upTo),
      });
    }
  };

  while (i < text.length) {
    const rest = text.slice(i);

    // 1. Inline-Code hat den hoechsten Vorrang und maskiert ALLES darin: ein
    //    "==" in Backticks ist woertlich und darf keine Hervorhebung
    //    erzeugen. Deshalb steht dieser Zweig ganz oben.
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      if (close !== -1) {
        flushPlain(i);
        tokens.push({ kind: 'code', start: i, end: close + 1, text: text.slice(i + 1, close) });
        i = close + 1;
        plainStart = i;
        continue;
      }
    }

    // 2. Hervorhebung, danach UNMITTELBAR nach einem Kommentar schauen.
    //    "==x==^[y]" ist eine kommentierte Hervorhebung, "==x== ^[y]" (mit
    //    Leerzeichen) sind zwei getrennte Dinge - genauso liest Obsidian es.
    if (rest.startsWith('==')) {
      const close = text.indexOf('==', i + 2);
      // Leere Marker ("====") sind keine Hervorhebung, sondern Text.
      if (close !== -1 && close > i + 2) {
        const inner = text.slice(i + 2, close);
        let end = close + 2;
        let comment: { start: number; end: number; text: string } | undefined;
        const found = readComment(text, end);
        if (found) {
          comment = { start: end, end: found.end, text: found.body };
          end = found.end;
        }
        flushPlain(i);
        tokens.push({
          kind: 'highlight',
          start: i,
          end,
          // Verschachtelung erlaubt: "==**wichtig**==" rendert fett im
          // Marker. Die Kindoffsets werden auf den Blocktext umgerechnet.
          children: shift(tokenizeInline(inner), i + 2),
          comment,
        });
        i = end;
        plainStart = i;
        continue;
      }
    }

    // 3. Freistehender Kommentar, der zu keiner Hervorhebung gehoert.
    if (text[i] === '^' && text[i + 1] === '[') {
      const found = readComment(text, i);
      if (found) {
        flushPlain(i);
        tokens.push({ kind: 'comment', start: i, end: found.end, text: found.body });
        i = found.end;
        plainStart = i;
        continue;
      }
    }

    // 4. Fett vor kursiv - sonst wuerde "**x**" als zwei kursive Marker
    //    gelesen.
    if (rest.startsWith('**')) {
      const close = text.indexOf('**', i + 2);
      if (close !== -1 && close > i + 2) {
        flushPlain(i);
        tokens.push({
          kind: 'strong',
          start: i,
          end: close + 2,
          children: shift(tokenizeInline(text.slice(i + 2, close)), i + 2),
        });
        i = close + 2;
        plainStart = i;
        continue;
      }
    }

    if (text[i] === '*' || text[i] === '_') {
      const marker = text[i];
      const close = text.indexOf(marker, i + 1);
      if (close !== -1 && close > i + 1) {
        flushPlain(i);
        tokens.push({
          kind: 'em',
          start: i,
          end: close + 1,
          children: shift(tokenizeInline(text.slice(i + 1, close)), i + 1),
        });
        i = close + 1;
        plainStart = i;
        continue;
      }
    }

    // 5. Link [Text](Ziel).
    if (text[i] === '[') {
      const closeText = matchBracket(text, i, '[', ']');
      if (closeText !== -1 && text[closeText + 1] === '(') {
        const closeHref = matchBracket(text, closeText + 1, '(', ')');
        if (closeHref !== -1) {
          flushPlain(i);
          tokens.push({
            kind: 'link',
            start: i,
            end: closeHref + 1,
            text: text.slice(i + 1, closeText),
            href: text.slice(closeText + 2, closeHref),
          });
          i = closeHref + 1;
          plainStart = i;
          continue;
        }
      }
    }

    i += 1;
  }

  flushPlain(text.length);
  return tokens;
}

/**
 * Verschiebt alle Offsets einer Tokenliste um `delta`. Noetig, weil
 * tokenizeInline rekursiv auf einem AUSSCHNITT arbeitet und dessen Offsets
 * bei 0 beginnen.
 */
function shift(tokens: InlineToken[], delta: number): InlineToken[] {
  return tokens.map((t) => {
    const moved = { ...t, start: t.start + delta, end: t.end + delta };
    if ('children' in moved && moved.children) {
      return { ...moved, children: shift(moved.children, delta) };
    }
    return moved;
  }) as InlineToken[];
}

/**
 * Alle Hervorhebungen eines Blocks, in Lesereihenfolge - Grundlage der
 * Kommentaranzeige unter dem Absatz.
 */
export function collectHighlights(tokens: InlineToken[]): Extract<InlineToken, { kind: 'highlight' }>[] {
  const found: Extract<InlineToken, { kind: 'highlight' }>[] = [];
  const walk = (list: InlineToken[]) => {
    for (const t of list) {
      if (t.kind === 'highlight') {
        found.push(t);
        walk(t.children);
      } else if ('children' in t && t.children) {
        walk(t.children);
      }
    }
  };
  walk(tokens);
  return found;
}

/**
 * Der reine Textinhalt einer Tokenliste, ohne Syntaxzeichen - fuer die
 * Kurzanzeige einer Hervorhebung in der Kommentarliste.
 */
export function plainTextOf(tokens: InlineToken[]): string {
  return tokens
    .map((t) => {
      if (t.kind === 'text' || t.kind === 'code') return t.text;
      if (t.kind === 'link') return t.text;
      if (t.kind === 'comment') return '';
      if ('children' in t && t.children) return plainTextOf(t.children);
      return '';
    })
    .join('');
}
