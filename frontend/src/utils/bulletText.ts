interface BulletLine {
  indent: number;
  text: string;
}

const BULLET_SYMBOLS = ['•', '–', '▪'];

// Anzahl Leerzeichen pro Einruecktiefe im ANGEZEIGTEN Text (siehe
// toDisplayText/fromDisplayText). Muss visuell zur Symbolbreite passen,
// ist aber ansonsten frei waehlbar - kein CSS-Abgleich mehr noetig, da es
// nur noch einen einzigen Render-Pfad gibt (keine Overlay-Schicht mehr).
const INDENT_SPACES = 3;

function parseBulletLines(raw: string): BulletLine[] {
  if (raw === '') return [{ indent: 0, text: '' }];
  return raw.split('\n').map((line) => {
    let indent = 0;
    while (indent < line.length && line[indent] === '\t') indent += 1;
    return { indent, text: line.slice(indent) };
  });
}

export function bulletSymbolForIndent(indent: number): string {
  return BULLET_SYMBOLS[indent % BULLET_SYMBOLS.length];
}

// Wandelt den Rohtext (Speicherformat: Einruecktiefe als fuehrende \t pro
// Zeile, KEIN Bullet-Symbol enthalten) in den Text um, der tatsaechlich in
// der Textarea steht: Einzug als echte Leerzeichen + Bullet-Symbol als
// normales Zeichen direkt im Text. Keine zweite, unsichtbare Ebene mehr -
// was hier steht, ist exakt das, was der Nutzer sieht UND was der Browser
// als Cursor-Koordinatensystem verwendet. Das eliminiert jede Drift
// zwischen "was angezeigt wird" und "wo der Cursor tatsaechlich ist".
export function toDisplayText(raw: string): string {
  return parseBulletLines(raw)
    .map((l) => ' '.repeat(l.indent * INDENT_SPACES) + bulletSymbolForIndent(l.indent) + ' ' + l.text)
    .join('\n');
}

// Ruecktransformation: fuehrende Leerzeichen + das erste Bullet-Symbol samt
// nachfolgendem Leerzeichen werden wieder entfernt, die Einruecktiefe wird
// aus der Leerzeichenanzahl zurueckgerechnet. Tolerant gegenueber leicht
// abweichender Eingabe (z.B. Symbol geloescht oder mehrfach vorhanden) -
// entfernt in jedem Fall nur EIN fuehrendes Bullet-Symbol plus Leerzeichen,
// den Rest der Zeile fasst es nicht an.
export function fromDisplayText(display: string): string {
  return display
    .split('\n')
    .map((line) => {
      let spaces = 0;
      while (spaces < line.length && line[spaces] === ' ') spaces += 1;
      const indent = Math.round(spaces / INDENT_SPACES);
      let rest = line.slice(spaces);
      // Bullet-Symbol (+ ein trennendes Leerzeichen) entfernen, falls
      // vorhanden - der Nutzer soll es nicht selbst tippen/loeschen muessen,
      // wird aber tolerant behandelt falls doch mal vorhanden/fehlend.
      const symbol = bulletSymbolForIndent(indent);
      if (rest.startsWith(symbol + ' ')) {
        rest = rest.slice(symbol.length + 1);
      } else if (rest.startsWith(symbol)) {
        rest = rest.slice(symbol.length);
      }
      return '\t'.repeat(indent) + rest;
    })
    .join('\n');
}

