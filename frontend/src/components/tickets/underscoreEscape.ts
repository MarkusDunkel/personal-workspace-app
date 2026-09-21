import type { Handle } from 'mdast-util-to-markdown';

/**
 * Laesst Unterstriche INNERHALB von Woertern unmaskiert.
 *
 * Standardmaessig maskiert remark-stringify jedes "_" in Fliesstext, weil es
 * eine Hervorhebung einleiten koennte. Aus "Person_085" wird dadurch bei
 * jedem Speichern "Person\_085".
 *
 * Das war kein Schoenheitsfehler: Die Reidentifikation der Pipeline suchte
 * nach "Person_085" und fand die maskierte Form nicht. In Ticket 569 - dem
 * einzigen, das im visuellen Editor bearbeitet worden war - blieben deshalb
 * fuenf Pseudonyme stehen und gelangten unersetzt bis nach Azure, waehrend
 * alle unbearbeiteten Tickets korrekt aufgeloest wurden. Die Pipeline faengt
 * beide Schreibweisen inzwischen ab (reidentify_core.PSEUDONYM_RE); hier wird
 * die Ursache selbst beseitigt, damit 2_ai-ready sauber bleibt und das
 * git-Diff nicht bei jedem Speichern mit Backslashes zurauscht.
 *
 * Warum das gefahrlos ist: Eine ECHTE Hervorhebung ist im Baum ein eigener
 * emphasis-Knoten und wird ohnehin als "*kursiv*" ausgegeben - der Stern ist
 * Milkdowns Vorgabe. Der Unterstrich, um den es hier geht, ist blosser
 * Textinhalt. Maskiert wird weiterhin, sobald links oder rechts KEIN
 * Wortzeichen steht ("Wert _ allein" bleibt "Wert \_ allein"), denn nur dort
 * koennte er tatsaechlich eine Hervorhebung oeffnen oder schliessen.
 *
 * Geprueft ueber Hin- und Rueckweg: fuer alle Faelle bleiben Textinhalt und
 * Hervorhebungen identisch, und das Ergebnis ist stabil (zweimal
 * serialisieren aendert nichts mehr).
 */

/**
 * Verengt die eingebaute Regel fuer "_" um eine Bedingung an das Zeichen davor.
 *
 * Der Eingriff sitzt im root-Handler, weil die Liste der zu maskierenden
 * Zeichen (``state.unsafe``) erst beim Serialisieren aus den eingebauten und
 * den Erweiterungs-Regeln zusammengesetzt wird. Ueber die ``unsafe``-Option
 * einer Erweiterung liesse sie sich nur ERGAENZEN - aendern kann man sie
 * ausschliesslich an dieser Stelle, und root laeuft als erstes.
 *
 * Die vorhandene Regel wird ABGEWANDELT, nicht entfernt und neu gesetzt. Das
 * ist wesentlich: Ein erster Entwurf loeschte sie und fuegte zwei eigene
 * hinzu ("kein Wortzeichen links" ODER "keines rechts"). Damit war der
 * Geltungsbereich groesser als vorher, und Adressen wie
 * ".../Digital%20Transformation/_workitems/edit/273/" wurden neuerdings zu
 * "\_workitems" maskiert - in fuenf Tickets nachweisbar. Durch das Abwandeln
 * bleiben alle uebrigen Bedingungen der Originalregel (inConstruct,
 * notInConstruct) unangetastet.
 *
 * ``_compiled`` muss mit zurueckgesetzt werden: mdast-util-to-markdown legt
 * dort den fertigen regulaeren Ausdruck ab und wuerde sonst den alten
 * weiterverwenden.
 */
const root: Handle = (node, _parent, state, info) => {
  state.unsafe = state.unsafe.map((pattern) =>
    pattern.character === '_' && pattern.inConstruct === 'phrasing' && !pattern.atBreak
      ? { ...pattern, before: '[^A-Za-z0-9]', _compiled: undefined }
      : pattern,
  );
  return state.containerFlow(node, info);
};

/**
 * Fuer remarkStringifyOptionsCtx. Wird in MilkdownDescriptionEditor zu den
 * uebrigen Handlern gemischt.
 */
export const intraWordUnderscoreHandler = { root };
