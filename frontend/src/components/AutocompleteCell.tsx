import { useLayoutEffect, useRef, useState } from 'react';
import type { CellProps } from './Cell';

interface AutocompleteCellProps extends CellProps {
  contacts: string[];
}

export function AutocompleteCell({
  column,
  value,
  focused,
  editing,
  initialChar,
  onCommit,
  onCancelEdit,
  onMoveDown,
  onMoveTab,
  contacts,
}: AutocompleteCellProps) {
  // Wird bei jedem neuen Editiervorgang frisch gemountet (siehe DataGrid.tsx
  // key={editing ? `editing-${editSession}` : 'idle'}), daher initialisiert
  // sich draft garantiert korrekt - kein Effect-Timing-Risiko mehr.
  const [draft, setDraft] = useState(initialChar ?? value ?? '');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      if (initialChar) {
        // Zeichen-Direkteintritt: Cursor ans Ende, nicht markieren, sonst
        // wuerde das naechste Zeichen das gerade getippte wieder loeschen.
        const pos = el.value.length;
        el.setSelectionRange(pos, pos);
      } else {
        // Doppelklick/F2/Pfeiltasten-Ankunft: bestehenden Wert markieren,
        // damit sofortiges Lostippen ihn ersetzt statt anzuhaengen.
        el.setSelectionRange(0, el.value.length);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editing) {
    return (
      <span className={`cell-display${focused ? ' cell-focused' : ''}${value ? '' : ' cell-placeholder'}`}>
        {value ?? column.label}
      </span>
    );
  }

  const matches =
    draft.trim() === ''
      ? []
      : contacts.filter((c) => c.toLowerCase().includes(draft.trim().toLowerCase())).slice(0, 8);
  const listOpen = matches.length > 0;

  const commit = (text: string) => {
    onCommit(text === '' ? null : text);
  };

  return (
    <div className="autocomplete-cell">
      <input
        ref={inputRef}
        className="cell-input"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setHighlightIndex(0);
        }}
        onBlur={() => commit(matches.length === 1 ? matches[0] : draft)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancelEdit();
            return;
          }
          if (listOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            e.stopPropagation();
            setHighlightIndex((i) => {
              const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
              return ((next % matches.length) + matches.length) % matches.length;
            });
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (listOpen) {
              e.stopPropagation();
              setDraft(matches[highlightIndex]);
              return;
            }
            e.stopPropagation();
            commit(draft);
            onMoveDown();
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            commit(matches.length === 1 ? matches[0] : draft);
            onMoveTab(e.shiftKey ? -1 : 1);
          }
        }}
      />
      {listOpen && (
        <ul className="autocomplete-suggestions">
          {matches.map((m, i) => (
            <li
              key={m}
              className={i === highlightIndex ? 'highlighted' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(m);
              }}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
