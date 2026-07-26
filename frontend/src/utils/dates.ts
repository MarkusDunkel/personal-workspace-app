// Ported from NoteValidator.resolveExpression / nextOrSameWeekday (Java),
// plus a German DD.MM.[YYYY] literal form the backend parser does not
// support today. All arithmetic stays in local-date semantics only -
// never use toISOString() here, it shifts to UTC first and can silently
// move the date by one day depending on timezone offset/time of day.

const WEEKDAY_ABBREVIATIONS: Record<string, number> = {
  so: 0,
  mo: 1,
  di: 2,
  mi: 3,
  do: 4,
  fr: 5,
  sa: 6, // JS Date#getDay(): 0 = Sunday
};

export interface ParsedDate {
  date: Date | null;
  isoDate: string | null;
}

const EMPTY: ParsedDate = { date: null, isoDate: null };

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function addMonths(d: Date, months: number): Date {
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDayOfTargetMonth = daysInMonth(target.getFullYear(), target.getMonth());
  target.setDate(Math.min(day, lastDayOfTargetMonth));
  return target;
}

export function addYears(d: Date, years: number): Date {
  return addMonths(d, years * 12);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function nextOrSameWeekday(from: Date, targetDow: number): Date {
  // Always advances at least one day (strictly future, never returns
  // "today" even if today already matches targetDow) - matches
  // NoteValidator.nextOrSameWeekday exactly: typing "mo" on a Monday
  // resolves to NEXT Monday, not today.
  let candidate = addDays(from, 1);
  while (candidate.getDay() !== targetDow) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIsoDate(iso: string): Date | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
}

function fromDate(d: Date): ParsedDate {
  return { date: d, isoDate: toIsoDate(d) };
}

export function parseRelativeOrLiteralDate(raw: string, referenceDate: Date): ParsedDate {
  const v = raw.trim().toLowerCase();
  if (v === '') return EMPTY;
  if (v === 'heute') return fromDate(referenceDate);
  if (v === 'morgen') return fromDate(addDays(referenceDate, 1));
  if (v === 'uebermorgen' || v === 'übermorgen') return fromDate(addDays(referenceDate, 2));
  if (v in WEEKDAY_ABBREVIATIONS) {
    return fromDate(nextOrSameWeekday(referenceDate, WEEKDAY_ABBREVIATIONS[v]));
  }

  const relMatch = v.match(/^\+(\d+)d$/);
  if (relMatch) return fromDate(addDays(referenceDate, Number(relMatch[1])));

  const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = fromIsoDate(v);
    return d ? fromDate(d) : EMPTY;
  }

  const deMatch = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/);
  if (deMatch) {
    const day = Number(deMatch[1]);
    const month = Number(deMatch[2]) - 1;
    const explicitYear = deMatch[3] ? Number(deMatch[3]) : null;
    const year = explicitYear ?? referenceDate.getFullYear();
    let d = new Date(year, month, day);
    if (d.getMonth() !== month || d.getDate() !== day) return EMPTY;
    if (explicitYear === null && d < startOfDay(referenceDate)) {
      d = new Date(year + 1, month, day);
    }
    return fromDate(d);
  }

  return EMPTY;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
