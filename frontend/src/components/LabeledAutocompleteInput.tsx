import { useState } from 'react';

interface LabeledAutocompleteInputProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  suggestions: string[];
  allowFreeText: boolean;
  disabled?: boolean;
}

/**
 * Eigenstaendiges, immer sichtbares Eingabefeld mit Autocomplete-Vorschlag,
 * losgeloest vom Grid-Editier-Lifecycle (kein editing/focused/initialChar,
 * kein Remount-per-Editiersession wie bei AutocompleteCell/TypCell - das
 * Feld ist einfach immer ein normaler Input). Bei allowFreeText=true wird
 * jeder eingetippte Text akzeptiert (Kopf-Eingabefelder Projekt/Meeting);
 * bei allowFreeText=false nur ein exakter (case-insensitiver) Treffer aus
 * suggestions (Fokus-Dropdown der aktuellen Zeile).
 */
export function LabeledAutocompleteInput({
  label,
  value,
  onCommit,
  suggestions,
  allowFreeText,
  disabled,
}: LabeledAutocompleteInputProps) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  // Wert von aussen kann sich aendern (z.B. andere Zeile fokussiert) - draft
  // synchron nachziehen, solange nicht gerade editiert wird.
  if (!open && draft !== value) {
    setDraft(value);
  }

  const matches = suggestions.filter((s) => s.toLowerCase().includes(draft.trim().toLowerCase())).slice(0, 8);
  const listOpen = open && matches.length > 0;

  const matchExact = (text: string) => suggestions.find((s) => s.toLowerCase() === text.trim().toLowerCase());

  const commit = (text: string) => {
    if (allowFreeText) {
      onCommit(text);
      setDraft(text);
      setOpen(false);
      return;
    }
    const exact = matchExact(text);
    if (exact) {
      onCommit(exact);
      setDraft(exact);
    } else {
      setDraft(value);
    }
    setOpen(false);
  };

  return (
    <div className="labeled-autocomplete">
      <span className="labeled-autocomplete-label">{label}</span>
      <div className="autocomplete-cell">
        <input
          className="cell-input"
          value={draft}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setHighlightIndex(0);
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(value);
              setOpen(false);
              return;
            }
            if (listOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              setHighlightIndex((i) => {
                const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
                return ((next % matches.length) + matches.length) % matches.length;
              });
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (listOpen) {
                commit(matches[highlightIndex]);
                return;
              }
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
    </div>
  );
}
