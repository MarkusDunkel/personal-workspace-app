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

export interface TextProjection {
  /** Der reine Text des Dokuments, Bloecke durch \n getrennt. */
  text: string;
  /** Nach flatStart sortiert - Voraussetzung fuer die binaere Suche. */
  segments: TextSegment[];
  /** Die Bloecke der obersten Ebene, fuer die Randmarkierung. */
  blocks: BlockRange[];
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
  let text = '';

  doc.forEach((block, offset) => {
    const blockFlatStart = text.length;
    // +1: die Position INNERHALB des Blockknotens, nicht die des Knotens
    // selbst. doc.forEach liefert den Offset des Knotens; sein Inhalt
    // beginnt eine Position weiter.
    const blockPmFrom = offset;
    const blockPmTo = offset + block.nodeSize;

    block.descendants((node, pos) => {
      if (!node.isText || !node.text) return true;
      // pos ist relativ zum Blockknoten; +1 ueberspringt dessen oeffnende
      // Marke, damit die Position im Gesamtdokument stimmt.
      const pmFrom = blockPmFrom + 1 + pos;
      segments.push({
        flatStart: text.length,
        flatEnd: text.length + node.text.length,
        pmFrom,
      });
      text += node.text;
      return true;
    });

    blocks.push({
      flatStart: blockFlatStart,
      flatEnd: text.length,
      pmFrom: blockPmFrom,
      pmTo: blockPmTo,
    });

    // Blocktrenner. Er gehoert zu KEINEM Segment - eine Position darin hat
    // also keine Entsprechung im Dokument, was richtig ist: zwischen zwei
    // Absaetzen steht kein Zeichen, das man markieren koennte.
    text += '\n';
  });

  return { text, segments, blocks };
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
