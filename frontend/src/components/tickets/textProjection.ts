import type { Node as ProseNode } from '@milkdown/prose/model';

/**
 * Ein Stueck Text des Dokuments und wo es dort steht.
 *
 * flatStart/flatEnd sind Positionen in der abgeflachten Zeichenkette,
 * pmFrom die zugehoerige ProseMirror-Position im Dokument. Weil jedes
 * Segment genau einem Textknoten entspricht, gilt innerhalb eines Segments
 * die einfache Beziehung pmFrom + (offset - flatStart).
 */
export interface TextSegment {
  flatStart: number;
  flatEnd: number;
  pmFrom: number;
}

/** Ein Block des Dokuments mit seinem Bereich in beiden Raeumen. */
export interface BlockRange {
  flatStart: number;
  flatEnd: number;
  pmFrom: number;
  pmTo: number;
}

/**
 * Ein Textblock (Absatz, Ueberschrift, Listenpunkt, Tabellenzelle) im
 * projizierten Text - die Einheit, an der der Vergleich verankert wird.
 */
export interface TextUnit {
  flatStart: number;
  flatEnd: number;
}

export interface TextProjection {
  /** Der reine Text des Dokuments, Textbloecke durch \n getrennt. */
  text: string;
  /** Nach flatStart sortiert - Voraussetzung fuer die binaere Suche. */
  segments: TextSegment[];
  /** Die Bloecke der obersten Ebene, fuer die Randmarkierung. */
  blocks: BlockRange[];
  /** Alle Textbloecke in Dokumentreihenfolge, auch verschachtelte. */
  units: TextUnit[];
}

/**
 * Flacht ein ProseMirror-Dokument zu reinem Text ab und merkt sich dabei,
 * welche Stelle im Text welcher Dokumentposition entspricht.
 *
 * Das ist der Angelpunkt des ganzen Features. Ein Zeichenvergleich auf dem
 * MARKDOWN-Quelltext liesse sich naemlich nicht auf Dokumentpositionen
 * zurueckrechnen: ProseMirror zaehlt Knoten, nicht Quellzeichen. "**fett**"
 * sind acht Quellzeichen, aber vier Dokumentpositionen mit einer Mark; das
 * "#" einer Ueberschrift belegt zwei Quellzeichen und null Positionen;
 * Tabellenstriche belegen ebenfalls null. Eine Umrechnung zwischen beiden
 * Raeumen gibt es nicht.
 *
 * Deshalb wird nie das Markdown verglichen, sondern diese Projektion - und
 * weil sie hier selbst gebaut wird, faellt ihre Umkehrabbildung nebenbei ab
 * (siehe toDocPosition). Genau das macht den Unterschied zwischen "geht
 * nicht" und "ist eine binaere Suche".
 *
 * Nebenwirkung, die hier bewusst in Kauf genommen wird: eine reine
 * FORMATaenderung (recte zu fett) aendert den projizierten Text nicht und
 * erscheint deshalb nicht als Aenderung. Das ist fuer diesen Zweck eher
 * richtig als falsch - der Markdown-Serializer normalisiert beim Speichern
 * ohnehin Leerzeilen und Listenzeichen, und ein Quelltextvergleich wuerde
 * staendig Unterschiede zeigen, die niemand getippt hat.
 */
export function projectDoc(doc: ProseNode): TextProjection {
  const segments: TextSegment[] = [];
  const blocks: BlockRange[] = [];
  const units: TextUnit[] = [];
  let text = '';

  /**
   * Haengt einen Textblock an. contentStart ist die Dokumentposition seines
   * ersten Kindes, also die Position des Knotens + 1 (oeffnende Marke).
   */
  const addTextblock = (node: ProseNode, contentStart: number) => {
    const flatStart = text.length;
    node.forEach((child, childOffset) => {
      if (child.isText && child.text) {
        segments.push({
          flatStart: text.length,
          flatEnd: text.length + child.text.length,
          pmFrom: contentStart + childOffset,
        });
        text += child.text;
      } else if (child.isInline) {
        // Zeilenumbruch, Inline-HTML, Bild: kein Text, aber eine Wortgrenze.
        // Ohne den Trenner verschmoelzen die Woerter links und rechts davon
        // zu einem einzigen Vergleichswort.
        text += '\n';
      }
    });
    units.push({ flatStart, flatEnd: text.length });
    // Blocktrenner. Er gehoert zu KEINEM Segment - eine Position darin hat
    // also keine Entsprechung im Dokument, was richtig ist: zwischen zwei
    // Absaetzen steht kein Zeichen, das man markieren koennte.
    text += '\n';
  };

  doc.forEach((block, offset) => {
    const blockFlatStart = text.length;
    const unitsBefore = units.length;

    // +1: die Position INNERHALB des Blockknotens, nicht die des Knotens
    // selbst. doc.forEach liefert den Offset des Knotens; sein Inhalt
    // beginnt eine Position weiter.
    if (block.isTextblock) {
      addTextblock(block, offset + 1);
    } else {
      // Listen, Zitate, Tabellen: jeder enthaltene Textblock wird eine eigene
      // Einheit. Sonst waere eine ganze Liste EIN Vergleichsblock, und die
      // Punkte liefen ohne Trenner ineinander ("ErsterZweiter").
      block.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        // pos ist relativ zum Inhalt von block: +1 fuer dessen oeffnende
        // Marke, +1 fuer die des Textblocks selbst.
        addTextblock(node, offset + 1 + pos + 1);
        return false;
      });
    }

    blocks.push({
      flatStart: blockFlatStart,
      // Ende des letzten Textblocks, OHNE den folgenden Trenner - sonst
      // beruehrte eine Loeschstelle am Anfang des naechsten Blocks auch
      // diesen hier.
      flatEnd: units.length > unitsBefore ? units[units.length - 1].flatEnd : blockFlatStart,
      pmFrom: offset,
      pmTo: offset + block.nodeSize,
    });
  });

  return { text, segments, blocks, units };
}

/**
 * Rechnet eine Position im projizierten Text zurueck auf eine
 * Dokumentposition.
 *
 * Faellt der Offset in einen Blocktrenner (also zwischen zwei Segmente),
 * wird das Ende des vorangehenden Segments genommen. Das ist die
 * konservative Wahl: die Markierung endet dann am letzten echten Zeichen,
 * statt in den naechsten Absatz zu rutschen.
 *
 * Liegt der Offset hinter allem, kommt das Ende des letzten Segments; bei
 * einem leeren Dokument die 0. Beides ist fuer den Aufrufer eine gueltige
 * Position, sodass er keinen Sonderfall braucht.
 */
export function toDocPosition(projection: TextProjection, offset: number): number {
  const { segments } = projection;
  if (segments.length === 0) return 0;

  let low = 0;
  let high = segments.length - 1;
  let candidate = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = segments[mid];
    if (offset < segment.flatStart) {
      high = mid - 1;
    } else if (offset > segment.flatEnd) {
      candidate = mid;
      low = mid + 1;
    } else {
      // Treffer: der Offset liegt in diesem Segment (Ende eingeschlossen,
      // damit eine Markierung direkt hinter dem letzten Zeichen enden kann).
      return segment.pmFrom + (offset - segment.flatStart);
    }
  }

  // Kein Treffer - der Offset liegt in einem Blocktrenner oder dahinter.
  const previous = segments[candidate];
  return previous.pmFrom + (previous.flatEnd - previous.flatStart);
}

/**
 * Die Bloecke, die sich mit dem Bereich [from, to) ueberschneiden.
 *
 * Ein leerer Bereich (from === to, also eine Loeschstelle) zaehlt fuer den
 * Block, in dem er liegt - sonst bekaeme gerade eine Loeschung keinen
 * Randbalken, obwohl sie die wichtigere Aenderung ist.
 */
export function blocksTouching(
  projection: TextProjection,
  from: number,
  to: number,
): BlockRange[] {
  return projection.blocks.filter((block) =>
    from === to
      ? from >= block.flatStart && from <= block.flatEnd
      : from < block.flatEnd && to > block.flatStart,
  );
}
