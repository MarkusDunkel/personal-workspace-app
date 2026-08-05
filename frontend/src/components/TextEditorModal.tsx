import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TextEditorModalProps {
  value: string | null;
  onCommit: (value: string | null) => void;
  onCancel: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveHorizontal: (delta: 1 | -1) => void;
  onMoveTab: (delta: 1 | -1) => void;
}

export function TextEditorModal({ value, onCommit, onCancel, onMoveUp, onMoveDown, onMoveHorizontal, onMoveTab }: TextEditorModalProps) {
  const [draft, setDraft] = useState(value ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  const commit = () => onCommit(draft === '' ? null : draft);

  // Per Portal direkt an document.body gerendert, ABER: React-Events
  // (onMouseDown/onClick/...) bubbeln durch den REACT-Komponentenbaum, nicht
  // durch die tatsaechliche DOM-Position - ein Portal aendert daran nichts.
  // Diese Komponente haengt im Baum weiterhin unter DataGrid.tsx' <div
  // role="cell" onClick={...}>, dessen Handler bei jedem Klick/Drag im
  // Textarea (z.B. beim Setzen des Selektionsankers oder Ziehen einer
  // Textauswahl) nav.setFocused(...) aufrief - das riss den State-Update-
  // Zyklus des Grids mit rein und konkurrierte mit der laufenden nativen
  // Text-Selektion um den Fokus (Symptom: Fokus geht schon beim reinen
  // Markieren von Text verloren, Endlos-Re-Render waehrend der Selektion).
  // stopPropagation auf mousedown/click verhindert das Durchbubbeln zur
  // Grid-Zelle, ohne die native Text-Selektion oder Fokusvergabe im
  // Textarea selbst zu beeintraechtigen.
  return createPortal(
    <div
      className="submit-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }}
    >
      <div className="text-editor-modal" role="dialog" aria-modal="true">
        <textarea
          ref={textareaRef}
          className="text-editor-modal-textarea"
          value={draft}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit();
              onMoveDown();
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
              return;
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              commit();
              onMoveTab(e.shiftKey ? -1 : 1);
              return;
            }
            const el = e.currentTarget;
            const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
            const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
            const atFirstLine = el.value.slice(0, el.selectionStart).indexOf('\n') === -1;
            const atLastLine = el.value.slice(el.selectionEnd).indexOf('\n') === -1;

            if (e.key === 'ArrowLeft' && atStart) {
              e.preventDefault();
              commit();
              onMoveHorizontal(-1);
              return;
            }
            if (e.key === 'ArrowRight' && atEnd) {
              e.preventDefault();
              commit();
              onMoveHorizontal(1);
              return;
            }
            if (e.key === 'ArrowUp' && atFirstLine) {
              if (!atStart) {
                // erster Druck: nur an den Textanfang springen, wie gewuenscht.
                return;
              }
              e.preventDefault();
              commit();
              onMoveUp();
              return;
            }
            if (e.key === 'ArrowDown' && atLastLine) {
              if (!atEnd) {
                return;
              }
              e.preventDefault();
              commit();
              onMoveDown();
            }
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
