import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CellProps } from './Cell';
import { DatePickerPopup } from './DatePickerPopup';
import { fromIsoDate, parseRelativeOrLiteralDate, toIsoDate } from '../utils/dates';

const PREVIEW_FORMAT = new Intl.DateTimeFormat('de-AT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function DatePickerCell({ value, focused, editing, initialChar, onCommit, onCancelEdit }: CellProps) {
  const [draft, setDraft] = useState('');
  const [popupOpen, setPopupOpen] = useState(false);
  const [gridFocused, setGridFocused] = useState(false);
  const [cursorDate, setCursorDate] = useState<Date>(today());
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const committedDate = value ? fromIsoDate(value) : null;

  useEffect(() => {
    if (editing) {
      const seed = initialChar ?? '';
      setDraft(seed);
      setGridFocused(false);
      setCursorDate(committedDate ?? today());
      setPopupOpen(true);
    } else {
      setPopupOpen(false);
      setGridFocused(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useLayoutEffect(() => {
    if (editing && !gridFocused && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
    }
  }, [editing, gridFocused]);

  useEffect(() => {
    if (gridFocused) {
      popupRef.current?.focus();
    }
  }, [gridFocused]);

  const preview = draft.trim() === '' ? null : parseRelativeOrLiteralDate(draft, today());

  const commitFromDraft = () => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      onCommit(null);
      return;
    }
    const parsed = parseRelativeOrLiteralDate(trimmed, today());
    if (parsed.isoDate) {
      onCommit(parsed.isoDate);
    } else {
      onCancelEdit();
    }
  };

  const confirmDate = (date: Date) => {
    onCommit(toIsoDate(date));
  };

  if (!editing) {
    const display = value ? PREVIEW_FORMAT.format(fromIsoDate(value) ?? undefined) : '';
    return <span className={`cell-display${focused ? ' cell-focused' : ''}`}>{display}</span>;
  }

  return (
    <div className="date-picker-cell">
      <div className="date-picker-input-row">
        <input
          ref={inputRef}
          className="cell-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setPopupOpen(true);
          }}
          onBlur={(e) => {
            if (popupRef.current?.contains(e.relatedTarget as Node)) return;
            commitFromDraft();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onCancelEdit();
              return;
            }
            if (e.key === 'Enter') {
              if (preview?.isoDate) {
                // let it bubble: DataGrid's <td> handler advances focus
                // down after this commits.
                confirmDate(preview.date as Date);
                return;
              }
              // unparseable non-empty text: stay put, do not commit/close.
              e.stopPropagation();
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              e.stopPropagation();
              if (!popupOpen) setPopupOpen(true);
              setCursorDate(preview?.date ?? committedDate ?? today());
              setGridFocused(true);
              return;
            }
            if (e.key === 'Tab') {
              // let it bubble: DataGrid's <td> handler advances focus.
              commitFromDraft();
            }
          }}
        />
        {preview?.isoDate && <span className="date-picker-preview">→ {PREVIEW_FORMAT.format(preview.date as Date)}</span>}
      </div>
      {popupOpen && (
        <div
          className="date-picker-popup-anchor"
          ref={popupRef}
          tabIndex={-1}
          onBlur={(e) => {
            if (popupRef.current?.contains(e.relatedTarget as Node)) return;
            commitFromDraft();
          }}
        >
          <DatePickerPopup
            cursorDate={cursorDate}
            committedDate={committedDate}
            today={today()}
            onCursorMove={setCursorDate}
            onConfirm={confirmDate}
            onRequestClose={onCancelEdit}
            onTypeChar={(char) => {
              setGridFocused(false);
              setDraft(char);
            }}
          />
        </div>
      )}
    </div>
  );
}
