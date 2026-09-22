/**
 * Prueft die tragenden Invarianten des Markdown-Renderers.
 *
 * Diese Datei ist das "Node-Skript", auf das die Kommentare in
 * markdownBlocks.ts und markdownOffsets.ts verweisen. Sie ist die einzige
 * automatische Absicherung dafuer, dass eine Textauswahl im gerenderten
 * Dokument auf die richtige Stelle der QUELLE abgebildet wird - und damit
 * dafuer, dass Hervorheben und Kommentieren keine Datei im Vault
 * beschaedigen.
 *
 * Start:  npm run check
 * (laeuft ueber node --experimental-strip-types, liest die .ts also direkt)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { splitBlocks } from '../src/utils/markdownBlocks.ts';
import { displayPrefix, fromDisplayText, toDisplayText } from '../src/utils/bulletText.ts';
import {
  applyHighlight,
  blockTokens,
  normalizeSelection,
  removeHighlight,
  enclosingHighlight,
} from '../src/utils/markdownOffsets.ts';
import { Schema } from 'prosemirror-model';
import { projectDoc, toDocPosition } from '../src/components/tickets/textProjection.ts';

const here = dirname(fileURLToPath(import.meta.url));
// Ueber CHECK_DIR laesst sich stattdessen ein echtes Vault-Verzeichnis
// pruefen - dieselben Invarianten gegen die Dokumente, um die es geht.
const fixturesDir = process.env.CHECK_DIR ?? join(here, 'fixtures');

let failures = 0;
let checks = 0;

function check(ok, label, detail) {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.error(`  FEHLER  ${label}`);
  if (detail !== undefined) console.error(`          ${detail}`);
}

/** Alle text-Tokens einer Tokenliste, rekursiv. */
function textTokens(tokens, out = []) {
  for (const t of tokens) {
    if (t.kind === 'text') out.push(t);
    if (t.children) textTokens(t.children, out);
  }
  return out;
}

function checkFixture(name, source) {
  console.log(`\n${name}`);
  const blocks = splitBlocks(source);

  // 1. Die tragende Invariante.
  for (const b of blocks) {
    check(
      source.slice(b.start, b.end) === b.source,
      `[1] slice-Invariante verletzt bei ${b.kind} @${b.start}`,
      JSON.stringify(b.source.slice(0, 60)),
    );
  }

  // 2. Bloecke sind geordnet, ueberlappungsfrei und decken das Dokument ab.
  let prevEnd = -1;
  for (const b of blocks) {
    check(b.start > prevEnd, `[2] Block @${b.start} ueberlappt den vorigen`);
    check(b.end >= b.start, `[2] Block @${b.start} hat end < start`);
    prevEnd = b.end;
  }
  // Zusammengesetzt muss wieder exakt das Dokument entstehen. Die Bloecke
  // lassen die trennenden \n aus, deshalb werden sie hier wieder eingefuegt.
  const rebuilt = blocks.map((b) => b.source).join('\n');
  check(
    rebuilt === source,
    '[2] Bloecke ergeben zusammengesetzt nicht das Dokument',
    `${rebuilt.length} statt ${source.length} Zeichen`,
  );

  // 3./4. Zellen: Invariante, Lage und Inhalt.
  for (const b of blocks.filter((x) => x.kind === 'table')) {
    for (const row of b.rows ?? []) {
      let prevCellEnd = -1;
      for (const c of row.cells) {
        check(
          b.source.slice(c.textStart, c.textEnd) === c.text,
          `[3] Zell-Invariante verletzt @${b.start}+${c.textStart}`,
          JSON.stringify(c.text),
        );
        check(
          c.textStart >= 0 && c.textEnd <= b.source.length && c.textStart <= c.textEnd,
          `[4] Zellbereich ausserhalb des Blocks @${b.start}+${c.textStart}`,
        );
        check(
          c.textStart >= prevCellEnd,
          `[4] Zellen nicht geordnet @${b.start}+${c.textStart}`,
        );
        prevCellEnd = c.textEnd;
        check(!c.text.includes('\n'), `[4] Zeilenumbruch in Zelle @${b.start}+${c.textStart}`);
        // Ein unmaskierter Pipe darf nie im Zellinhalt stehen.
        const unescaped = c.text.replace(/\\\|/g, '');
        check(
          !unescaped.includes('|'),
          `[4] unmaskierter Pipe in Zelle @${b.start}+${c.textStart}`,
          JSON.stringify(c.text),
        );
      }
    }
  }

  // 5. Token-Invariante: was gerendert wird, IST der Quellausschnitt.
  for (const b of blocks) {
    if (b.kind === 'codeFence' || b.kind === 'verbatim' || b.kind === 'blank') continue;
    for (const t of textTokens(blockTokens(b))) {
      check(
        b.source.slice(t.start, t.end) === t.text,
        `[5] Token-Invariante verletzt @${b.start}+${t.start}`,
        JSON.stringify(t.text),
      );
    }
  }

  // 6. Rundlauf: hervorheben und wieder entfernen muss byte-gleich sein.
  //    Das ist die wertvollste Pruefung - sie fuehrt genau den Schreibpfad
  //    aus, der eine Datei beschaedigen koennte.
  for (const b of blocks.filter((x) => x.kind === 'table')) {
    for (const row of b.rows ?? []) {
      if (row.kind === 'delimiter') continue;
      for (const c of row.cells) {
        if (c.text.trim() === '') continue;
        const absStart = b.start + c.textStart;
        const absEnd = b.start + c.textEnd;
        const sel = normalizeSelection(source, absStart, absEnd);
        if (typeof sel === 'string') {
          // Zellen, die bereits vollstaendig eine Hervorhebung sind, werden
          // als 'partialHighlight' o.ae. abgelehnt - das ist kein Fehler.
          continue;
        }
        // Liegt die Auswahl schon vollstaendig in einer Hervorhebung,
        // ENTFERNT applyHighlight sie (Umschalten, siehe dortiger
        // Kommentar). Der Rundlauf ist dann der umgekehrte Weg: erst
        // abschalten, dann wieder setzen.
        const existing = enclosingHighlight(b, absStart, absEnd);
        if (existing) {
          const without = applyHighlight(source, sel);
          const wBlocks = splitBlocks(without);
          const wBlock = wBlocks.find((x) => x.start === b.start);
          if (!wBlock) {
            check(false, `[6] Block nach dem Abschalten nicht wiedergefunden @${b.start}`);
            continue;
          }
          const innerSel = normalizeSelection(without, absStart, absEnd - 4);
          if (typeof innerSel === 'string') continue;
          const back = applyHighlight(without, innerSel);
          check(
            back === source,
            `[6] Rundlauf (Umschalten) nicht byte-gleich fuer Zelle @${absStart}`,
            JSON.stringify(c.text),
          );
          continue;
        }

        const withMark = applyHighlight(source, sel);
        const markBlocks = splitBlocks(withMark);
        const markBlock = markBlocks.find((x) => x.start === b.start);
        if (!markBlock) {
          check(false, `[6] Block nach applyHighlight nicht wiedergefunden @${b.start}`);
          continue;
        }
        const hl = enclosingHighlight(markBlock, absStart + 2, absStart + 2);
        if (!hl) {
          check(false, `[6] Hervorhebung nach applyHighlight nicht gefunden @${absStart}`);
          continue;
        }
        const back = removeHighlight(withMark, markBlock, hl);
        check(
          back === source,
          `[6] Rundlauf nicht byte-gleich fuer Zelle @${absStart}`,
          JSON.stringify(c.text),
        );
      }
    }
  }

  // 7. Ablehnungen.
  for (const b of blocks.filter((x) => x.kind === 'table')) {
    const rows = (b.rows ?? []).filter((r) => r.kind !== 'delimiter');
    // Zwei verschiedene Zellen in derselben Zeile.
    for (const row of rows) {
      const filled = row.cells.filter((c) => c.text.trim() !== '');
      if (filled.length < 2) continue;
      const from = b.start + filled[0].textStart;
      const to = b.start + filled[1].textEnd;
      check(
        normalizeSelection(source, from, to) === 'crossCell',
        `[7] zellenuebergreifende Auswahl nicht abgelehnt @${from}`,
        JSON.stringify(normalizeSelection(source, from, to)),
      );
      break;
    }
    // Die Trennzeile selbst.
    const delim = (b.rows ?? []).find((r) => r.kind === 'delimiter');
    if (delim && delim.cells.length > 0) {
      const c = delim.cells[0];
      const res = normalizeSelection(source, b.start + c.textStart, b.start + c.textEnd);
      check(
        res === 'crossCell',
        '[7] Auswahl in der Trennzeile nicht abgelehnt',
        JSON.stringify(res),
      );
    }
  }

  // Code-Bloecke bleiben fuer die Auswahl gesperrt.
  for (const b of blocks.filter((x) => x.kind === 'codeFence' || x.kind === 'verbatim')) {
    if (b.end <= b.start + 1) continue;
    const res = normalizeSelection(source, b.start + 1, b.end - 1);
    check(res === 'insideCode', `[7] Auswahl in Code nicht abgelehnt @${b.start}`, String(res));
  }

  // Blockuebergreifend.
  if (blocks.length >= 2) {
    const a = blocks[0];
    const z = blocks[blocks.length - 1];
    if (a.start !== z.start) {
      const res = normalizeSelection(source, a.start, z.end);
      check(
        typeof res === 'string',
        '[7] blockuebergreifende Auswahl nicht abgelehnt',
        JSON.stringify(res),
      );
    }
  }

  console.log(`  ${blocks.length} Bloecke, davon ${blocks.filter((b) => b.kind === 'table').length} Tabellen, ${blocks.filter((b) => b.kind === 'codeFence').length} Code-Bloecke`);
}

/** Gezielte Einzelfaelle, die keine ganze Datei rechtfertigen. */
function checkUnits() {
  console.log('\nEinzelfaelle');

  // Ein Absatz mit literalem Pipe darf KEINE Tabelle werden.
  const prosa = splitBlocks('Text mit | Pipe darin\nund noch eine Zeile.');
  check(
    prosa.every((b) => b.kind !== 'table'),
    '[U] Absatz mit literalem Pipe wurde als Tabelle gelesen',
  );

  // Tabelle direkt unter einer Textzeile: der frueher latente Fehler.
  const nachAbsatz = splitBlocks('Einleitung:\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  check(
    nachAbsatz.some((b) => b.kind === 'table'),
    '[U] Tabelle direkt nach einer Textzeile nicht erkannt',
  );
  check(
    nachAbsatz[0].kind === 'paragraph' && nachAbsatz[0].source === 'Einleitung:',
    '[U] Absatz vor der Tabelle falsch abgegrenzt',
    JSON.stringify(nachAbsatz[0].source),
  );

  // Zaun-Grenzen: die Sprache wird gelesen, der Inhalt ohne Zaeune geliefert.
  const fence = splitBlocks('```json\n{"a":1}\n```')[0];
  check(fence.lang === 'json', '[U] Sprache des Zauns nicht gelesen', String(fence.lang));
  check(
    fence.source.slice(fence.innerStart - fence.start, fence.innerEnd - fence.start) === '{"a":1}',
    '[U] Zaun-Inhalt falsch abgegrenzt',
  );

  // Leerer Zaun darf keinen umgekehrten Bereich ergeben.
  const leer = splitBlocks('```json\n```')[0];
  check(leer.innerStart <= leer.innerEnd, '[U] leerer Zaun ergibt umgekehrten Bereich');

  // Nicht geschlossener Zaun laeuft bis Dateiende.
  const offen = splitBlocks('```sql\nSELECT 1')[0];
  check(offen.kind === 'codeFence', '[U] offener Zaun nicht als Code erkannt');
  check(
    offen.source.slice(offen.innerStart - offen.start, offen.innerEnd - offen.start) === 'SELECT 1',
    '[U] Inhalt des offenen Zauns falsch',
  );
}

/**
 * Bullet-Zellen der Notizansicht: die Rundreise Speicher -> Anzeige -> Speicher.
 *
 * Dieselbe Art von Absicherung wie [6] weiter oben, nur fuer den anderen
 * Schreibpfad: was hier schiefgeht, aendert still die Einrueckung einer Notiz.
 * Die Anzeigeform (Tabulatoren + Bullet-Symbol) ist reine Darstellung, das
 * Speicherformat kennt nur fuehrende \t und nie ein Symbol.
 */
function checkBulletText() {
  console.log('\nBullet-Rundreise');

  const faelle = [
    ['leer', ''],
    ['eine Zeile ohne Einzug', 'Kontakt aufnehmen'],
    ['zwei Ebenen', 'Oberpunkt\n\tUnterpunkt'],
    ['drei Ebenen', 'Ebene null\n\tEbene eins\n\t\tEbene zwei'],
    ['Ebene vier laeuft in der Symbolliste um', '\t\t\tEbene drei\n\t\t\t\tEbene vier'],
    ['Sprung um zwei Stufen', 'Oben\n\t\tDirekt zwei tiefer'],
    ['leere Zeile mittendrin', 'Erster\n\nDritter'],
    ['Text enthaelt selbst ein Bullet-Zeichen', 'Siehe Punkt • im Protokoll'],
    ['Text beginnt mit einem Bindestrich', '\tminus 5 Prozent'],
    ['Tabulator mitten im Text', 'Spalte A\tSpalte B'],
  ];

  for (const [name, raw] of faelle) {
    check(
      fromDisplayText(toDisplayText(raw)) === raw,
      `[B] Rundreise nicht byte-gleich: ${name}`,
      `${JSON.stringify(raw)} -> ${JSON.stringify(fromDisplayText(toDisplayText(raw)))}`,
    );
  }

  // Die Einruecktiefe muss aus der Anzeige exakt zurueckgelesen werden - ohne
  // die frueher noetige Rundung aus einer Leerzeichenanzahl.
  for (let indent = 0; indent < 6; indent += 1) {
    const raw = '\t'.repeat(indent) + 'Text';
    const display = toDisplayText(raw);
    check(
      display.startsWith(displayPrefix(indent)),
      `[B] Anzeigepraefix stimmt nicht fuer Tiefe ${indent}`,
      JSON.stringify(display),
    );
    check(
      !display.includes('  '),
      `[B] Anzeige enthaelt Leerzeichen-Einzug bei Tiefe ${indent}`,
      JSON.stringify(display),
    );
  }

  // Toleranz: das Modell hinter dem Magic-Button bekommt den ANZEIGETEXT und
  // kann den Tabulator nach dem Symbol als Leerzeichen zurueckliefern. Beide
  // Trenner muessen dasselbe Speicherergebnis liefern, sonst bleibt ein
  // Leerzeichen am Textanfang stehen.
  check(
    fromDisplayText('\t–\tUnterpunkt') === fromDisplayText('\t– Unterpunkt'),
    '[B] Leerzeichen als Trenner nach dem Symbol nicht toleriert',
    JSON.stringify(fromDisplayText('\t– Unterpunkt')),
  );
  check(
    fromDisplayText('\t– Unterpunkt') === '\tUnterpunkt',
    '[B] Leerzeichen-Trenner nicht sauber entfernt',
    JSON.stringify(fromDisplayText('\t– Unterpunkt')),
  );
  // Fehlendes Symbol (vom Nutzer geloescht) darf die Zeile nicht zerlegen.
  check(
    fromDisplayText('\tOhne Symbol') === '\tOhne Symbol',
    '[B] Zeile ohne Bullet-Symbol falsch gelesen',
    JSON.stringify(fromDisplayText('\tOhne Symbol')),
  );
}

/**
 * Die Offset-Abbildung der Aenderungsmarkierung im Ticket-Editor.
 *
 * Das ist die korrektheitskritische Stelle des Features: projectDoc flacht
 * ein ProseMirror-Dokument zu reinem Text ab und merkt sich die Zuordnung,
 * toDocPosition rechnet sie zurueck. Ein Fehler um eins setzt die gruenen
 * Markierungen auf die falschen Woerter - und das ist SCHLIMMER als gar
 * keine Markierung, weil es den Leser aktiv in die Irre fuehrt.
 *
 * Geprueft wird deshalb die Umkehreigenschaft selbst: fuer jedes Textstueck
 * muss die Hin- und Rueckabbildung wieder exakt auf dessen Dokumentbereich
 * fallen. Das ist unabhaengig davon, wie das Dokument aussieht, und faengt
 * jeden Fehler um eins.
 */
function checkTextProjection() {
  console.log('\nTextprojektion (Aenderungsmarkierung)');

  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
      heading: { group: 'block', content: 'inline*', toDOM: () => ['h1', 0] },
      text: { group: 'inline' },
    },
    marks: {
      strong: { toDOM: () => ['strong', 0] },
    },
  });

  const p = (...children) => schema.node('paragraph', null, children);
  const h = (...children) => schema.node('heading', null, children);
  const t = (s) => schema.text(s);
  const strong = (s) => schema.text(s, [schema.marks.strong.create()]);

  const documents = {
    'ein Absatz': schema.node('doc', null, [p(t('Hallo Welt'))]),
    'zwei Absaetze': schema.node('doc', null, [p(t('Erster')), p(t('Zweiter'))]),
    'mit Formatierung': schema.node('doc', null, [p(t('vor '), strong('fett'), t(' nach'))]),
    'Ueberschrift und Text': schema.node('doc', null, [h(t('Titel')), p(t('Inhalt hier'))]),
    'leerer Absatz dazwischen': schema.node('doc', null, [p(t('A')), p(), p(t('B'))]),
    'viele Teilstuecke': schema.node('doc', null, [
      p(t('a'), strong('b'), t('c'), strong('d'), t('e')),
      p(t('zweiter Absatz mit mehr Text')),
    ]),
  };

  for (const [name, doc] of Object.entries(documents)) {
    const projection = projectDoc(doc);

    // 1. Die tragende Invariante: jedes Segment faellt durch Hin- und
    //    Rueckabbildung exakt auf sich selbst.
    for (const segment of projection.segments) {
      check(
        toDocPosition(projection, segment.flatStart) === segment.pmFrom,
        `[P] ${name}: Segmentanfang falsch abgebildet`,
        `flat ${segment.flatStart} -> ${toDocPosition(projection, segment.flatStart)}, erwartet ${segment.pmFrom}`,
      );
      const expectedEnd = segment.pmFrom + (segment.flatEnd - segment.flatStart);
      check(
        toDocPosition(projection, segment.flatEnd) === expectedEnd,
        `[P] ${name}: Segmentende falsch abgebildet`,
        `flat ${segment.flatEnd} -> ${toDocPosition(projection, segment.flatEnd)}, erwartet ${expectedEnd}`,
      );
    }

    // 2. JEDE Position im Text muss auf eine gueltige Dokumentposition
    //    fallen. Eine Position ausserhalb liesse ProseMirror beim Anlegen
    //    der Dekoration werfen und der Editor bliebe leer.
    for (let offset = 0; offset <= projection.text.length; offset += 1) {
      const pos = toDocPosition(projection, offset);
      check(
        pos >= 0 && pos <= doc.content.size + 2,
        `[P] ${name}: Position ${pos} liegt ausserhalb des Dokuments`,
        `offset ${offset}, Dokumentgroesse ${doc.content.size}`,
      );
    }

    // 3. Der projizierte Text muss dem textContent entsprechen - sonst
    //    verglichen wir etwas anderes, als im Editor steht.
    const expectedText = [];
    doc.forEach((block) => expectedText.push(block.textContent));
    check(
      projection.text === expectedText.join('\n') + '\n',
      `[P] ${name}: projizierter Text weicht ab`,
      JSON.stringify(projection.text),
    );

    // 4. Monotonie: spaetere Textstellen duerfen nie auf fruehere
    //    Dokumentpositionen fallen. Ohne das koennten Markierungsbereiche
    //    invertiert entstehen (from > to).
    let last = -1;
    for (let offset = 0; offset <= projection.text.length; offset += 1) {
      const pos = toDocPosition(projection, offset);
      check(pos >= last, `[P] ${name}: Abbildung nicht monoton bei ${offset}`, `${pos} < ${last}`);
      last = pos;
    }

    // 5. Ein Bereich ueber ein ganzes Segment muss im Dokument genau dessen
    //    Text zurueckliefern. Das ist die Probe darauf, dass die Markierung
    //    wirklich die gemeinten Zeichen trifft.
    for (const segment of projection.segments) {
      const from = toDocPosition(projection, segment.flatStart);
      const to = toDocPosition(projection, segment.flatEnd);
      const slice = doc.textBetween(from, to);
      const expected = projection.text.slice(segment.flatStart, segment.flatEnd);
      check(
        slice === expected,
        `[P] ${name}: Bereich trifft den falschen Text`,
        `${JSON.stringify(slice)} statt ${JSON.stringify(expected)}`,
      );
    }
  }

  // 6. Das leere Dokument darf nicht werfen.
  const empty = projectDoc(schema.node('doc', null, [p()]));
  check(toDocPosition(empty, 0) === 0, '[P] leeres Dokument: Position 0 erwartet');
  check(toDocPosition(empty, 5) === 0, '[P] leeres Dokument: Position hinter dem Ende');
}

const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.md'));
for (const f of files) {
  checkFixture(f, readFileSync(join(fixturesDir, f), 'utf8'));
}
checkUnits();
checkBulletText();
checkTextProjection();

console.log(`\n${checks} Pruefungen, ${failures} Fehler`);
process.exit(failures === 0 ? 0 : 1);
