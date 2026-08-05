import { useEffect, useRef, useState } from 'react';

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

  return (
    <div className="submit-modal-overlay">
      <div className="text-editor-modal" role="dialog" aria-modal="true">
        <textarea
          ref={textareaRef}
          className="text-editor-modal-textarea"
          value={draft}
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
    </div>
  );
}
