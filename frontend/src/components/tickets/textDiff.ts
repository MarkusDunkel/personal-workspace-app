import { diffArrays } from 'diff';
import type { TextProjection, TextUnit } from './textProjection';

/**
 * Der Vergleich zweier Textprojektionen, ohne jeden Bezug auf ProseMirror -
 * alle Angaben sind Offsets im projizierten Text des AKTUELLEN Stands.
 * Deshalb laesst er sich in check-invariants.mjs ohne Editor pruefen.
 *
 * Zweistufig, und beides ist gegen ein konkretes Fehlbild gebaut:
 *
 * 1. Erst werden ganze Textbloecke verglichen. Ein Absatz, der nach dem
 *    Angleichen (Unicode-Form, Leerraum) identisch ist, gilt als unveraendert
 *    und bekommt NIE eine Markierung - egal, was um ihn herum passiert.
 *
 * 2. Nur innerhalb geaenderter Blockfolgen wird wortweise verglichen, und
 *    zwar OHNE Leerraum als Token.
 *
 * 3. Verschobene und dabei geaenderte Absaetze werden ihrer alten Fassung
 *    zugeordnet, wenn sie nah genug liegen (siehe findMoves).
 *
 * Vorher lief ein einziger diffWordsWithSpace ueber das ganze Feld. Bei
 * Ticket 569 (22 KB, viele Absaetze umgeschrieben) ordnete der die
 * Leerzeichen eines unveraenderten Satzes den Leerzeichen eines
 * umgeschriebenen Absatzes davor zu: fuer eine minimale Editdistanz ist ein
 * passendes Leerzeichen so viel wert wie ein passendes Wort. Ergebnis war
 * ein Flickenteppich aus "Wort gruen, Strich rot, Leerzeichen weiss" ueber
 * einem Satz, an dem sich nichts geaendert hatte.
 */

export interface DiffResult {
  /** Hinzugekommene Bereiche [from, to) im aktuellen Text. */
  added: Array<{ from: number; to: number }>;
  /** Loeschstellen im aktuellen Text, mit der Zeichenzahl des Entfernten. */
  removed: Array<{ at: number; length: number }>;
}

interface Word {
  /** Vergleichsschluessel, in NFC - "ä" als ein oder zwei Codepunkte ist dasselbe Wort. */
  key: string;
  start: number;
  end: number;
  /** Index des Textblocks, aus dem das Wort stammt. */
  unit: number;
}

/** Vergleichsschluessel eines Textblocks: Inhalt ohne Leerraumunterschiede. */
function unitKey(text: string, unit: TextUnit): string {
  return text.slice(unit.flatStart, unit.flatEnd).normalize('NFC').replace(/\s+/g, ' ').trim();
}

function wordsOf(text: string, units: TextUnit[]): Word[] {
  const words: Word[] = [];
  units.forEach((unit, index) => {
    const slice = text.slice(unit.flatStart, unit.flatEnd);
    for (const match of slice.matchAll(/\S+/g)) {
      const start = unit.flatStart + match.index;
      words.push({ key: match[0].normalize('NFC'), start, end: start + match[0].length, unit: index });
    }
  });
  return words;
}

/**
 * Ab diesem Anteil gemeinsamer Woerter gelten zwei Absaetze als dieselbe,
 * verschobene Stelle. Gemessen als 2 * gemeinsam / (Woerter alt + neu).
 *
 * Nicht niedriger: in Ticket 569 endet fast jeder Punkt auf dieselben acht
 * Woerter ("[ ] laut-code - [ ] umgesetzt - [ ] getestet"), viele Absaetze
 * beginnen mit "Ist-Stand 2026-10-07 — vollständig." Zwei verschiedene kurze
 * Punkte kommen dadurch leicht auf 60 %.
 */
const MOVE_MIN_SIMILARITY = 0.7;

/**
 * So viele UNVERAENDERTE Absaetze duerfen hoechstens zwischen alter und neuer
 * Position eines verschobenen Absatzes liegen.
 *
 * Gezaehlt werden nur die unveraenderten, weil nur sie feste Ankerpunkte
 * sind - wie viele geaenderte Absaetze dazwischen liegen, schwankt mit jedem
 * Umbau. Die Grenze verhindert, dass ein neuer Punkt einem aehnlich
 * klingenden vom anderen Ende des Feldes zugeordnet wird: dann waere nur ein
 * Teil gruen, obwohl er in Wahrheit neu ist - irrefuehrender als zu viel
 * Markierung.
 */
const MOVE_MAX_ANCHORS = 2;

/** Eine Folge geaenderter Bloecke zwischen zwei unveraenderten. */
interface Hunk {
  /** Bereich in baseline.units, [oldStart, oldEnd). */
  oldStart: number;
  oldEnd: number;
  /** Bereich in current.units, [newStart, newEnd). */
  newStart: number;
  newEnd: number;
  /** Zahl der unveraenderten Bloecke davor - der Abstandsmassstab. */
  anchors: number;
  /** Wohin eine Loeschung ohne nachfolgendes Wort zeigt. */
  fallback: number;
}

export function diffProjections(baseline: TextProjection, current: TextProjection): DiffResult {
  const result: DiffResult = { added: [], removed: [] };

  const baseKeys = baseline.units.map((u) => unitKey(baseline.text, u));
  const currKeys = current.units.map((u) => unitKey(current.text, u));
  const blockParts = diffArrays(baseKeys, currKeys);

  const hunks: Hunk[] = [];
  let anchors = 0;
  let bi = 0; // naechster Block im Vergleichsstand
  let ci = 0; // naechster Block im aktuellen Stand
  let k = 0;
  while (k < blockParts.length) {
    const part = blockParts[k];
    if (!part.added && !part.removed) {
      const count = part.count ?? part.value.length;
      bi += count;
      ci += count;
      anchors += count;
      k += 1;
      continue;
    }

    // Alle aufeinanderfolgenden geaenderten Teile bilden EINE Aenderung -
    // unabhaengig davon, ob jsdiff "entfernt" oder "hinzugefuegt" zuerst
    // liefert. Innerhalb davon wird wortweise verglichen.
    let removedCount = 0;
    let addedCount = 0;
    while (k < blockParts.length && (blockParts[k].added || blockParts[k].removed)) {
      const count = blockParts[k].count ?? blockParts[k].value.length;
      if (blockParts[k].added) addedCount += count;
      else removedCount += count;
      k += 1;
    }

    const hunk = { oldStart: bi, oldEnd: bi + removedCount, newStart: ci, newEnd: ci + addedCount };
    bi += removedCount;
    ci += addedCount;

    // Wohin eine Loeschung ohne nachfolgendes Wort zeigt: ans Ende der
    // geaenderten Bloecke, oder - wurden nur Bloecke entfernt - an den
    // Anfang des naechsten erhaltenen.
    const fallback =
      addedCount > 0
        ? current.units[ci - 1].flatEnd
        : ci < current.units.length
          ? current.units[ci].flatStart
          : current.text.length;

    hunks.push({ ...hunk, anchors, fallback });
  }

  const { pairs, movedOld, movedNew } = findMoves(baseline, current, hunks);

  // Verschobene Absaetze gegen ihre alte Fassung - so ist nur das gruen, was
  // sich wirklich geaendert hat. An der alten Stelle gibt es keinen
  // Loeschstrich: der Text ist ja nicht weg, nur woanders.
  for (const [o, n] of pairs) {
    const newUnit = current.units[n];
    diffWords(wordsOf(baseline.text, [baseline.units[o]]), wordsOf(current.text, [newUnit]), newUnit.flatEnd, result);
  }

  for (const hunk of hunks) {
    const oldUnits = baseline.units.slice(hunk.oldStart, hunk.oldEnd).filter((_, i) => !movedOld.has(hunk.oldStart + i));
    const newUnits = current.units.slice(hunk.newStart, hunk.newEnd).filter((_, i) => !movedNew.has(hunk.newStart + i));
    diffWords(wordsOf(baseline.text, oldUnits), wordsOf(current.text, newUnits), hunk.fallback, result);
  }

  return result;
}

/**
 * Ordnet jedem geaenderten neuen Absatz seine alte Fassung zu, wenn es eine
 * hinreichend aehnliche in der Naehe gibt - in derselben Aenderung oder
 * hoechstens MOVE_MAX_ANCHORS unveraenderte Absaetze entfernt.
 *
 * Gegen zwei Fehlbilder, beide aus Ticket 569 ("[ ] laut-code" wurde
 * "[x] laut-code", und der Punkt rutschte hinter "Entscheidung offen"):
 *
 *  - Andere Aenderung: Liegt ein unveraenderter Absatz zwischen alter und
 *    neuer Position, landen beide in verschiedenen Aenderungen, und der
 *    Wortvergleich (der nur innerhalb einer laeuft) findet das Gegenstueck nie.
 *
 *  - Dieselbe Aenderung, aber gekreuzte Reihenfolge: "Entscheidung offen"
 *    war im alten Stand mit "&gt;" geschrieben, also kein Anker. Alt hiess
 *    es Satz -> Entscheidung, neu Entscheidung -> Satz. Ein Wortvergleich
 *    kann nur eines von beiden wiederfinden und nimmt das laengere - der
 *    Satz war komplett gruen.
 *
 * Absatzweise Paare loesen beides. Fuer einen an Ort und Stelle geaenderten
 * Absatz ergibt das Paar dasselbe wie der Wortvergleich, nur ohne die Gefahr,
 * dass er sich an einem Nachbarabsatz verhakt.
 *
 * Bei mehreren Kandidaten gewinnt der naechstgelegene, dann der aehnlichste.
 */
function findMoves(baseline: TextProjection, current: TextProjection, hunks: Hunk[]) {
  const pairs: Array<[number, number]> = [];
  const movedOld = new Set<number>();
  const movedNew = new Set<number>();

  const keys = (projection: TextProjection, index: number) =>
    wordsOf(projection.text, [projection.units[index]]).map((w) => w.key);
  const oldKeys = new Map<number, string[]>();
  const oldKeysOf = (index: number) => {
    let cached = oldKeys.get(index);
    if (!cached) {
      cached = keys(baseline, index);
      oldKeys.set(index, cached);
    }
    return cached;
  };

  for (const hunk of hunks) {
    for (let n = hunk.newStart; n < hunk.newEnd; n += 1) {
      const newKeys = keys(current, n);
      if (newKeys.length === 0) continue;

      let best: { old: number; distance: number; similarity: number } | null = null;
      for (const other of hunks) {
        const distance = Math.abs(other.anchors - hunk.anchors);
        if (distance > MOVE_MAX_ANCHORS) continue;
        for (let o = other.oldStart; o < other.oldEnd; o += 1) {
          if (movedOld.has(o)) continue;
          const similarity = similarityOf(oldKeysOf(o), newKeys);
          if (similarity < MOVE_MIN_SIMILARITY) continue;
          if (
            !best ||
            distance < best.distance ||
            (distance === best.distance && similarity > best.similarity)
          ) {
            best = { old: o, distance, similarity };
          }
        }
      }

      if (best) {
        pairs.push([best.old, n]);
        movedOld.add(best.old);
        movedNew.add(n);
      }
    }
  }

  return { pairs, movedOld, movedNew };
}

/** 2 * gemeinsame Woerter / (Woerter a + Woerter b), in Reihenfolge gezaehlt. */
function similarityOf(a: string[], b: string[]): number {
  const total = a.length + b.length;
  if (total === 0) return 0;
  // Schnellausstieg: schon der Laengenunterschied schliesst die Schwelle aus.
  // Erspart den Wortvergleich fuer die allermeisten Kandidaten.
  if ((2 * Math.min(a.length, b.length)) / total < MOVE_MIN_SIMILARITY) return 0;
  let common = 0;
  for (const part of diffArrays(a, b)) {
    if (!part.added && !part.removed) common += part.count ?? part.value.length;
  }
  return (2 * common) / total;
}

function diffWords(oldWords: Word[], newWords: Word[], fallback: number, result: DiffResult) {
  const parts = diffArrays(
    oldWords.map((w) => w.key),
    newWords.map((w) => w.key),
  );

  let ni = 0; // naechstes Wort im aktuellen Stand
  let pendingRemoval = 0;

  for (const part of parts) {
    const count = part.count ?? part.value.length;
    if (part.removed) {
      // Zeichenzahl wie im Text, mit je einem Leerzeichen zwischen den Woertern.
      pendingRemoval += part.value.join(' ').length;
      continue;
    }

    if (pendingRemoval > 0) {
      result.removed.push({ at: newWords[ni].start, length: pendingRemoval });
      pendingRemoval = 0;
    }

    if (part.added) {
      // Zusammenhaengende Woerter als EIN Bereich - so ist auch das
      // Leerzeichen dazwischen hinterlegt, statt Wort fuer Wort einzeln.
      // Ueber eine Blockgrenze hinweg wird getrennt, sonst laege der Bereich
      // ueber dem Trenner zwischen zwei Absaetzen.
      let runStart = newWords[ni];
      let runEnd = newWords[ni];
      for (let j = ni + 1; j < ni + count; j += 1) {
        const word = newWords[j];
        if (word.unit !== runEnd.unit) {
          result.added.push({ from: runStart.start, to: runEnd.end });
          runStart = word;
        }
        runEnd = word;
      }
      result.added.push({ from: runStart.start, to: runEnd.end });
    }

    ni += count;
  }

  if (pendingRemoval > 0) {
    result.removed.push({
      at: ni > 0 ? newWords[ni - 1].end : fallback,
      length: pendingRemoval,
    });
  }
}
