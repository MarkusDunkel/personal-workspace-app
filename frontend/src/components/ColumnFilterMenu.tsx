import { useEffect, useRef, useState } from 'react';

interface ColumnFilterMenuProps {
  label: string;
  /** Alle waehlbaren Werte, bereits sortiert. */
  options: string[];
  /** Die ausgewaehlten Werte. Leer = "alle" (keine Einschraenkung). */
  selected: Set<string>;
  onChange: (values: Set<string>) => void;
}

/**
 * Mehrfachauswahl-Dropdown fuer die Filterleiste. Uebernimmt Bedienung und
 * Optik der Zell-Vorschlagslisten (siehe TypCell/AutocompleteCell und
 * .autocomplete-suggestions in app.css), damit sich beides gleich anfuehlt:
 * umlaufende Pfeiltasten-Navigation, Escape schliesst, und onMouseDown mit
 * preventDefault auf jedem Eintrag, damit ein Klick den Tastaturfokus nicht
 * aus dem Filterfeld reisst.
 *
 * Unterschied zu den Zellen: hier wird nichts committet und geschlossen,
 * sondern umgeschaltet - man waehlt in der Regel mehrere Werte. Die
 * isOnlyCurrentValue-Sonderbehandlung aus TypCell fehlt bewusst: sie
 * existiert, weil sich der eigene Zellwert immer selbst matcht, was bei
 * einer Filterliste keine Entsprechung hat.
 */
export function ColumnFilterMenu({ label, options, selected, onChange }: ColumnFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = draft
    ? options.filter((o) => o.toLowerCase().includes(draft.toLowerCase()))
    : options;

  // Klick ausserhalb schliesst. mousedown und nicht click: ein Klick auf
  // eine Gridzelle loest dort einen Rerender aus, der das Klick-Ziel
  // zwischen mousedown und mouseup ersetzen kann - das click-Event kaeme
  // dann nie hier an (dasselbe Problem wie bei den Zellen in DataGrid).
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const summary = selected.size === 0
    ? 'alle'
    : selected.size === 1
      ? [...selected][0]
      : `${selected.size} gewählt`;

  return (
    <div className="column-filter" ref={rootRef}>
      <button
        type="button"
        className={`column-filter-button${selected.size > 0 ? ' active' : ''}`}
        aria-expanded={open}
        title={selected.size > 0 ? `${label}: ${[...selected].join(', ')}` : `${label}: alle`}
        onClick={() => {
          setOpen((o) => !o);
          setDraft('');
          setHighlightIndex(0);
        }}
      >
        <span className="column-filter-label">{label}:</span> {summary} ▾
      </button>
      {open && (
        <div className="column-filter-popup">
          <input
            className="column-filter-search"
            autoFocus
            value={draft}
            placeholder="suchen…"
            onChange={(e) => {
              setDraft(e.target.value);
              setHighlightIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
                return;
              }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (matches.length === 0) return;
                setHighlightIndex((i) => {
                  const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
                  return ((next % matches.length) + matches.length) % matches.length;
                });
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const value = matches[highlightIndex];
                if (value !== undefined) toggle(value);
              }
            }}
          />
          <div className="column-filter-actions">
            <button type="button" onClick={() => onChange(new Set(options))}>
              alle
            </button>
            <button type="button" onClick={() => onChange(new Set())}>
              keine
            </button>
          </div>
          <ul className="autocomplete-suggestions column-filter-list">
            {matches.length === 0 ? (
              <li className="column-filter-empty">keine Treffer</li>
            ) : (
              matches.map((value, i) => (
                <li
                  key={value}
                  className={i === highlightIndex ? 'highlighted' : undefined}
                  onMouseDown={(e) => {
                    // Verhindert, dass der Klick den Fokus aus dem Suchfeld
                    // nimmt - so bleibt die Tastaturbedienung waehrend
                    // mehrerer Klicks erhalten.
                    e.preventDefault();
                    toggle(value);
                  }}
                >
                  <span className="column-filter-check" aria-hidden="true">
                    {selected.has(value) ? '☑' : '☐'}
                  </span>
                  {value}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
