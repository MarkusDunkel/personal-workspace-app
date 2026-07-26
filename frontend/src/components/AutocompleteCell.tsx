import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CellProps } from './Cell';

interface AutocompleteCellProps extends CellProps {
  contacts: string[];
}

export function AutocompleteCell({
  value,
  focused,
  editing,
  initialChar,
  onCommit,
  onCancelEdit,
  contacts,
}: AutocompleteCellProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(initialChar ?? value ?? '');
      setHighlightIndex(0);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
    }
  }, [editing]);

  if (!editing) {
    return <span className={`cell-display${focused ? ' cell-focused' : ''}`}>{value ?? ''}</span>;
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
            if (listOpen) {
              e.preventDefault();
              e.stopPropagation();
              setDraft(matches[highlightIndex]);
              return;
            }
            // not stopping propagation: let the event bubble to DataGrid's
            // <td> handler, which advances focus after this commits below.
            commit(draft);
            return;
          }
          if (e.key === 'Tab') {
            // same as Enter: commit here, let Tab bubble for navigation.
            commit(draft);
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
