import { useLayoutEffect, useRef, useState } from 'react';
import type { CellProps } from './Cell';

interface TypCellProps extends CellProps {
  typValues: string[];
}

export function TypCell({
  column,
  value,
  focused,
  editing,
  initialChar,
  onCommit,
  onCancelEdit,
  onMoveDown,
  onMoveTab,
  typValues,
}: TypCellProps) {
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
        const pos = el.value.length;
        el.setSelectionRange(pos, pos);
      } else {
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
      ? typValues
      : typValues.filter((t) => t.toLowerCase().includes(draft.trim().toLowerCase()));
  const listOpen = matches.length > 0;

  const matchExact = (text: string) => typValues.find((t) => t.toLowerCase() === text.trim().toLowerCase());

  const commit = (text: string) => {
    if (text.trim() === '') {
      onCommit(null);
      return;
    }
    const exact = matchExact(text);
    if (exact) {
      onCommit(exact);
    } else {
      onCancelEdit();
    }
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
        onBlur={() => commit(draft)}
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
            commit(listOpen ? matches[highlightIndex] : draft);
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
