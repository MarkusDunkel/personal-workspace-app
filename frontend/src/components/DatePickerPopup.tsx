import { useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import { addDays, addMonths, addYears, daysInMonth, isSameDay } from '../utils/dates';

interface DatePickerPopupProps {
  cursorDate: Date;
  committedDate: Date | null;
  today: Date;
  onCursorMove: (next: Date) => void;
  onConfirm: (date: Date) => void;
  onRequestClose: () => void;
  onTypeChar: (char: string) => void;
}

const WEEKDAY_HEADERS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Monday-first weekday index: JS getDay() is 0=Sunday..6=Saturday.
function mondayFirstIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function buildWeeks(monthAnchor: Date): Date[][] {
  const first = startOfMonth(monthAnchor);
  const gridStart = addDays(first, -mondayFirstIndex(first));
  const weeks: Date[][] = [];
  let cursor = gridStart;
  for (let week = 0; week < 6; week++) {
    const days: Date[] = [];
    for (let day = 0; day < 7; day++) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(days);
  }
  return weeks;
}

export function DatePickerPopup({
  cursorDate,
  committedDate,
  today,
  onCursorMove,
  onConfirm,
  onRequestClose,
  onTypeChar,
}: DatePickerPopupProps) {
  const weeks = useMemo(() => buildWeeks(cursorDate), [cursorDate]);
  const monthLabel = `${MONTH_NAMES[cursorDate.getMonth()]} ${cursorDate.getFullYear()}`;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        onCursorMove(addDays(cursorDate, -1));
        return;
      case 'ArrowRight':
        e.preventDefault();
        onCursorMove(addDays(cursorDate, 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        onCursorMove(addDays(cursorDate, -7));
        return;
      case 'ArrowDown':
        e.preventDefault();
        onCursorMove(addDays(cursorDate, 7));
        return;
      case 'PageUp':
        e.preventDefault();
        onCursorMove(e.shiftKey ? addYears(cursorDate, -1) : addMonths(cursorDate, -1));
        return;
      case 'PageDown':
        e.preventDefault();
        onCursorMove(e.shiftKey ? addYears(cursorDate, 1) : addMonths(cursorDate, 1));
        return;
      case 'Home':
        e.preventDefault();
        onCursorMove(startOfMonth(cursorDate));
        return;
      case 'End':
        e.preventDefault();
        onCursorMove(new Date(cursorDate.getFullYear(), cursorDate.getMonth(), daysInMonth(cursorDate.getFullYear(), cursorDate.getMonth())));
        return;
      case 't':
      case 'T':
        e.preventDefault();
        onCursorMove(today);
        return;
      case 'Enter':
        e.preventDefault();
        onConfirm(cursorDate);
        return;
      case 'Escape':
        e.preventDefault();
        onRequestClose();
        return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          onTypeChar(e.key);
        }
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="date-picker-popup" onKeyDown={handleKeyDown} role="dialog" aria-label="Datumsauswahl">
      <div className="date-picker-header">
        <button
          type="button"
          className="date-picker-nav"
          aria-label="Vorheriger Monat"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCursorMove(addMonths(cursorDate, -1))}
        >
          ‹
        </button>
        <span className="date-picker-month-label">{monthLabel}</span>
        <button
          type="button"
          className="date-picker-nav"
          aria-label="Nächster Monat"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCursorMove(addMonths(cursorDate, 1))}
        >
          ›
        </button>
      </div>
      <div className="date-picker-weekdays">
        {WEEKDAY_HEADERS.map((wd) => (
          <span key={wd}>{wd}</span>
        ))}
      </div>
      <div className="date-picker-grid">
        {weeks.flat().map((day) => {
          const inCurrentMonth = day.getMonth() === cursorDate.getMonth();
          const isCursor = isSameDay(day, cursorDate);
          const isToday = isSameDay(day, today);
          const isSelected = committedDate !== null && isSameDay(day, committedDate);
          const classes = [
            'date-picker-day',
            !inCurrentMonth && 'muted',
            isCursor && 'cursor',
            isToday && 'today',
            isSelected && 'selected',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              type="button"
              key={day.toISOString()}
              className={classes}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onConfirm(day)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <div className="date-picker-footer">Enter bestätigen · t Heute · PgUp/PgDn Monat · Esc schließen</div>
    </div>
  );
}
