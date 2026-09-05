import { useEffect, useRef, useState } from 'react';

interface CommentPopoverProps {
  /** Viewport-relative Position, an der der Kommentar haengt. */
  rect: DOMRect;
  /** Der hervorgehobene Text, als Kontext im Kopf des Feldes. */
  quote: string;
  initialValue: string;
  /** Erkannte Klarnamen im Text - nur ein Hinweis, kein Hindernis. */
  detectNames: (text: string) => string[];
  onSave: (comment: string) => void;
  onRemoveComment: () => void;
  onRemoveBoth: () => void;
  onCancel: () => void;
}

const POPOVER_OFFSET = 8;
const POPOVER_WIDTH = 320;

/**
 * Eingabefeld fuer einen Kommentar, direkt an der markierten Stelle.
 *
 * Bewusst OHNE .submit-modal-overlay: eine bildschirmfuellende Abdunklung
 * ist fuer eine leichte Anmerkung falsch und wuerde genau den Text
 * verdecken, um den es geht. Wer das spaeter "vereinheitlichen" will, sollte
 * diesen Satz gelesen haben.
 */
export function CommentPopover({
  rect,
  quote,
  initialValue,
  detectNames,
  onSave,
  onRemoveComment,
  onRemoveBoth,
  onCancel,
}: CommentPopoverProps) {
  const [draft, setDraft] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const top = rect.bottom + POPOVER_OFFSET;
  const left = Math.max(
    POPOVER_OFFSET,
    Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - POPOVER_OFFSET),
  );

  const names = detectNames(draft);

  return (
    <div className="ws-comment-popover" style={{ top, left }} role="dialog" aria-label="Kommentar">
      <div className="ws-comment-popover-quote">„{quote}"</div>
      <textarea
        ref={textareaRef}
        className="ws-comment-popover-input"
        value={draft}
        rows={3}
        placeholder="Anmerkung…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Innerhalb des Feldes soll Enter speichern, nicht das Grid oder
          // die Ansicht erreichen.
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSave(draft);
          }
        }}
      />
      {names.length > 0 && (
        // Nur ein Hinweis, kein Hindernis - die Begruendung steht in der
        // Klassen-Javadoc von WorkspaceService.
        <p className="ws-name-hint">
          Enthält {names.length === 1 ? 'einen Klarnamen' : 'Klarnamen'} ({names.join(', ')}) – wird
          beim Zusammenführen pseudonymisiert.
        </p>
      )}
      <div className="ws-comment-popover-actions">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); onSave(draft); }}>
          Speichern
        </button>
        {initialValue !== '' && (
          <button
            type="button"
            title="Nur den Kommentar entfernen, die Hervorhebung bleibt"
            onMouseDown={(e) => { e.preventDefault(); onRemoveComment(); }}
          >
            Kommentar löschen
          </button>
        )}
        <button
          type="button"
          title="Hervorhebung und Kommentar entfernen"
          onMouseDown={(e) => { e.preventDefault(); onRemoveBoth(); }}
        >
          Beides löschen
        </button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); onCancel(); }}>
          Abbrechen
        </button>
      </div>
      <p className="ws-comment-popover-hint">Eingabe speichert · Shift+Eingabe neue Zeile · Esc bricht ab</p>
    </div>
  );
}
