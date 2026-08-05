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

// Vorerst deaktiviert: das Text-Eingabefeld mit Autocomplete-Vorschlag
// reicht aus, der Kalender-Popup bleibt fuer eine spaetere Reaktivierung
// im Code, wird aber nicht mehr geoeffnet.
const CALENDAR_POPUP_ENABLED = false;

export function DatePickerCell({ column, value, focused, editing, initialChar, onCommit, onCancelEdit, onMoveDown, onMoveTab }: CellProps) {
  const committedDate = value ? fromIsoDate(value) : null;

  // Wird bei jedem neuen Editiervorgang frisch gemountet (siehe DataGrid.tsx
  // key={editing ? `editing-${editSession}` : 'idle'}), daher initialisieren
  // sich alle States hier garantiert korrekt - kein Effect-Timing-Risiko mehr.
  const [draft, setDraft] = useState(initialChar ?? '');
  const [popupOpen, setPopupOpen] = useState(CALENDAR_POPUP_ENABLED);
  const [gridFocused, setGridFocused] = useState(false);
  const [cursorDate, setCursorDate] = useState<Date>(committedDate ?? today());
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const hasCommittedRef = useRef(false);

  useLayoutEffect(() => {
    if (editing && !gridFocused && inputRef.current) {
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

  useEffect(() => {
    if (gridFocused) {
      popupRef.current?.focus();
    }
  }, [gridFocused]);

  const preview = draft.trim() === '' ? null : parseRelativeOrLiteralDate(draft, today());

  const commitFromDraft = () => {
    if (hasCommittedRef.current) return;
    const trimmed = draft.trim();
    if (trimmed === '') {
      hasCommittedRef.current = true;
      onCommit(null);
      return;
    }
    const parsed = parseRelativeOrLiteralDate(trimmed, today());
    hasCommittedRef.current = true;
    if (parsed.isoDate) {
      onCommit(parsed.isoDate);
    } else {
      onCancelEdit();
    }
  };

  const confirmDate = (date: Date) => {
    if (hasCommittedRef.current) return;
    hasCommittedRef.current = true;
    onCommit(toIsoDate(date));
  };

  if (!editing) {
    const display = value ? PREVIEW_FORMAT.format(fromIsoDate(value) ?? undefined) : null;
    return (
      <span className={`cell-display${focused ? ' cell-focused' : ''}${display ? '' : ' cell-placeholder'}`}>
        {display ?? column.label}
      </span>
    );
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
            setPopupOpen(CALENDAR_POPUP_ENABLED);
          }}
          onBlur={(e) => {
            if (hasCommittedRef.current) return;
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
              e.preventDefault();
              e.stopPropagation();
              if (preview?.isoDate) {
                confirmDate(preview.date as Date);
                onMoveDown();
              }
              return;
            }
            if (e.key === 'ArrowDown' && CALENDAR_POPUP_ENABLED) {
              e.preventDefault();
              e.stopPropagation();
              if (!popupOpen) setPopupOpen(true);
              setCursorDate(preview?.date ?? committedDate ?? today());
              setGridFocused(true);
              return;
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              e.stopPropagation();
              commitFromDraft();
              onMoveTab(e.shiftKey ? -1 : 1);
            }
          }}
        />
        {preview?.isoDate && (
          <ul className="autocomplete-suggestions date-picker-suggestions">
            <li
              className="highlighted"
              onMouseDown={(e) => {
                e.preventDefault();
                confirmDate(preview.date as Date);
                onMoveDown();
              }}
            >
              {PREVIEW_FORMAT.format(preview.date as Date)}
            </li>
          </ul>
        )}
      </div>
      {popupOpen && (
        <div
          className="date-picker-popup-anchor"
          ref={popupRef}
          tabIndex={-1}
          onBlur={(e) => {
            if (hasCommittedRef.current) return;
            if (popupRef.current?.contains(e.relatedTarget as Node)) return;
            commitFromDraft();
          }}
        >
          <DatePickerPopup
            cursorDate={cursorDate}
            committedDate={committedDate}
            today={today()}
            onCursorMove={setCursorDate}
            onConfirm={(date) => {
              confirmDate(date);
              onMoveDown();
            }}
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
