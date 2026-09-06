import { useEffect, useState } from 'react';
import type { SelectionProblem, SourceSelection } from '../utils/markdownOffsets';
import { domPointToSourceOffset, normalizeSelection } from '../utils/markdownOffsets';

export interface ActiveSelection {
  selection: SourceSelection;
  /** Fuer die Platzierung der Schwebeleiste (viewport-relativ). */
  rect: DOMRect;
}

export interface UseBlockSelection {
  active: ActiveSelection | null;
  /** Grund, warum die aktuelle Auswahl nicht hervorhebbar ist. */
  problem: SelectionProblem | null;
  /** Verwirft die gemerkte Auswahl (z.B. nach dem Anwenden). */
  clear: () => void;
}

/**
 * Beobachtet die Textauswahl im gerenderten Dokument und rechnet sie in
 * Offsets der Markdown-Quelle um.
 *
 * selectionchange am document, bewusst nicht onSelect (das gibt es nur bei
 * Eingabefeldern) und nicht mouseup (das verpasst die Tastaturauswahl mit
 * Shift+Pfeil). Registrierung im useEffect mit Cleanup, wie beim
 * Aussenklick-Listener in ColumnFilterMenu.
 */
export function useBlockSelection(
  markdown: string,
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): UseBlockSelection {
  const [active, setActive] = useState<ActiveSelection | null>(null);
  const [problem, setProblem] = useState<SelectionProblem | null>(null);

  useEffect(() => {
    if (!enabled) {
      setActive(null);
      setProblem(null);
      return;
    }

    const handle = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setActive(null);
        setProblem(null);
        return;
      }
      const range = sel.getRangeAt(0);

      // Nur Auswahlen innerhalb des gerenderten Dokuments beachten - eine
      // Auswahl in der Filterleiste oder in einer anderen Ansicht darf hier
      // nichts ausloesen.
      const container = containerRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setActive(null);
        setProblem(null);
        return;
      }

      const from = domPointToSourceOffset(range.startContainer, range.startOffset);
      const to = domPointToSourceOffset(range.endContainer, range.endOffset);
      // strict ist in tsconfig.app.json nicht aktiv, der Compiler erzwingt
      // diese Pruefung also nicht - sie muss hier von Hand stehen.
      if (from === null || to === null) {
        setActive(null);
        // Bewusst ein sichtbarer Hinweis und nicht mehr stilles Nichts: seit
        // domPointToSourceOffset auf den Block klemmt, ist dieser Fall selten
        // und bedeutet dann wirklich "hier ist nichts markierbar" (etwa eine
        // Auswahl allein im Code-Block). Ohne Rueckmeldung sah der fruehere
        // Fehler wie eine kaputte Schaltflaeche aus.
        setProblem('unmappable');
        return;
      }

      const result = normalizeSelection(markdown, from, to);
      if (typeof result === 'string') {
        setActive(null);
        // 'empty' ist kein Fehler, den man dem Nutzer zeigt - das passiert
        // bei jeder Auswahl aus reinen Leerzeichen.
        setProblem(result === 'empty' ? null : result);
        return;
      }

      let rect = range.getBoundingClientRect();
      // Manche Rand- und Zusammenbruchfaelle liefern ein Nullrechteck; dann
      // auf den Block ausweichen, statt die Leiste in die Ecke zu setzen.
      if (rect.width === 0 && rect.height === 0) {
        const el = range.startContainer.parentElement?.closest<HTMLElement>('[data-ws-block]');
        if (el) rect = el.getBoundingClientRect();
      }
      setActive({ selection: result, rect });
      setProblem(null);
    };

    document.addEventListener('selectionchange', handle);
    return () => document.removeEventListener('selectionchange', handle);
  }, [markdown, containerRef, enabled]);

  return {
    active,
    problem,
    clear: () => {
      setActive(null);
      setProblem(null);
      window.getSelection()?.removeAllRanges();
    },
  };
}
