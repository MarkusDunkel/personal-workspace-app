import { useCallback, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { LineValidation } from '../api/types';
import { currentLineIndex, duplicateLine, toggleDoneOnLine } from '../utils/lines';
import { Overlay } from './Overlay';

interface EditorProps {
  content: string;
  onChange: (next: string) => void;
  validations: LineValidation[];
  activeLineIndex: number;
  onActiveLineChange: () => void;
  onSaveNow: () => void;
  onIngestHint: () => void;
}

export function Editor({
  content,
  onChange,
  validations,
  activeLineIndex,
  onActiveLineChange,
  onSaveNow,
  onIngestHint,
}: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const syncOverlayScroll = useCallback(() => {
    const editor = textareaRef.current;
    if (editor && overlayRef.current) {
      overlayRef.current.scrollTop = editor.scrollTop;
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const editor = textareaRef.current;
      if (!editor) return;

      if (ctrl && e.key === 's') {
        e.preventDefault();
        onSaveNow();
      } else if (ctrl && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const idx = currentLineIndex(editor.value, editor.selectionStart);
        onChange(toggleDoneOnLine(editor.value, idx));
      } else if (ctrl && e.key === 'd') {
        e.preventDefault();
        const idx = currentLineIndex(editor.value, editor.selectionStart);
        onChange(duplicateLine(editor.value, idx));
      } else if (ctrl && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        onIngestHint();
      }
    },
    [onChange, onSaveNow, onIngestHint],
  );

  return (
    <div className="editor-stack">
      <Overlay
        overlayRef={overlayRef}
        lines={content.split('\n')}
        validations={validations}
        activeLineIndex={activeLineIndex}
      />
      <textarea
        id="editor"
        ref={textareaRef}
        className="editor"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncOverlayScroll}
        onKeyDown={handleKeyDown}
        onClick={onActiveLineChange}
        onKeyUp={(e) => {
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            onActiveLineChange();
          }
        }}
        spellCheck={false}
        autoComplete="off"
        placeholder="Huber: t: Angebot nachfassen | f: 2026-08-01"
      />
    </div>
  );
}
