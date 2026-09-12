interface BulletLine {
  indent: number;
  text: string;
}

const BULLET_SYMBOLS = ['•', '–', '▪'];

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

// Baut das Zeilenpraefix des ANGEZEIGTEN Texts: ein Tabulator je Einrueckstufe,
// dann das Bullet-Symbol, dann ein WEITERER Tabulator vor dem eigentlichen Text.
//
// Beide Tabulatoren sind tragend, nicht kosmetisch. Frueher war der Einzug aus
// echten Leerzeichen (drei je Stufe) gebaut und das Symbol durch ein einzelnes
// Leerzeichen vom Text getrennt - das funktionierte nur, solange die Zelle
// dicktengleich gesetzt war. In Proportionalschrift brechen daran zwei
// unabhaengige Dinge:
//   1. ein Leerzeichen ist schmaler als das Symbol, die Stufen driften;
//   2. die drei Symbole sind UNTERSCHIEDLICH breit ('•' U+2022, '–' U+2013,
//      '▪' U+25AA) - selbst bei exakten Stufen begaenne der Text je Ebene an
//      einer anderen Position.
// Tabstopps liegen unabhaengig von der Glyphenbreite fest und loesen beides mit
// demselben Mittel: das Symbol steht auf Stopp n, der Text auf Stopp n+1.
//
// Bewusst reine Textzeichen: bearbeitet wird in EINER <textarea>, dort ist kein
// Markup und kein haengender Einzug per CSS moeglich. Die sichtbare Breite eines
// Stopps kommt aus 'tab-size' in app.css, die Zeichenarithmetik hier ist davon
// unabhaengig. Tabulatoren werden nur mit 'white-space: pre-wrap' dargestellt -
// ohne das kollabieren sie und die Struktur verschwindet optisch.
export function displayPrefix(indent: number): string {
  return '\t'.repeat(indent) + bulletSymbolForIndent(indent) + '\t';
}

// Wandelt den Rohtext (Speicherformat: Einruecktiefe als fuehrende \t pro
// Zeile, KEIN Bullet-Symbol enthalten) in den Text um, der tatsaechlich in
// der Textarea steht: Einzug und Symbolabstand als Tabulatoren, Bullet-Symbol
// als normales Zeichen direkt im Text (siehe displayPrefix). Keine zweite,
// unsichtbare Ebene mehr - was hier steht, ist exakt das, was der Nutzer sieht
// UND was der Browser als Cursor-Koordinatensystem verwendet. Das eliminiert
// jede Drift zwischen "was angezeigt wird" und "wo der Cursor tatsaechlich ist".
export function toDisplayText(raw: string): string {
  return parseBulletLines(raw)
    .map((l) => displayPrefix(l.indent) + l.text)
    .join('\n');
}

// Ruecktransformation: fuehrende Tabulatoren + das erste Bullet-Symbol samt
// nachfolgendem Trennzeichen werden wieder entfernt, die Einruecktiefe ist
// direkt die Anzahl der fuehrenden Tabulatoren. Das ist verlustfrei - die
// fruehere Variante rechnete die Tiefe aus einer Leerzeichenanzahl zurueck
// (Math.round(spaces / 3)) und konnte eine Zeile bei einem versehentlich
// getippten Leerzeichen still auf eine andere Ebene schieben.
//
// Tolerant gegenueber leicht abweichender Eingabe (z.B. Symbol geloescht oder
// mehrfach vorhanden) - entfernt in jedem Fall nur EIN fuehrendes
// Bullet-Symbol plus Trennzeichen, den Rest der Zeile fasst es nicht an.
export function fromDisplayText(display: string): string {
  return display
    .split('\n')
    .map((line) => {
      let indent = 0;
      while (indent < line.length && line[indent] === '\t') indent += 1;
      let rest = line.slice(indent);
      // Bullet-Symbol (+ ein trennender Tabulator) entfernen, falls vorhanden -
      // der Nutzer soll es nicht selbst tippen/loeschen muessen, wird aber
      // tolerant behandelt falls doch mal vorhanden/fehlend.
      //
      // Ein Leerzeichen wird als Trenner ebenfalls akzeptiert: der
      // Magic-Button schickt den ANZEIGETEXT an Claude und parst die Antwort
      // hier wieder ein (siehe DataGrid.tsx). Das Modell kann den Tabulator
      // nach dem Symbol als Leerzeichen normalisieren - ohne diesen Zweig
      // bliebe dann ein Leerzeichen am Textanfang im Speicher stehen.
      const symbol = bulletSymbolForIndent(indent);
      if (rest.startsWith(symbol + '\t') || rest.startsWith(symbol + ' ')) {
        rest = rest.slice(symbol.length + 1);
      } else if (rest.startsWith(symbol)) {
        rest = rest.slice(symbol.length);
      }
      return '\t'.repeat(indent) + rest;
    })
    .join('\n');
}

