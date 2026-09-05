import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { CellHandle, CellProps } from './Cell';
import { useCommitOnce } from '../hooks/useCommitOnce';

interface AutocompleteCellProps extends CellProps {
  contacts: string[];
}

export const AutocompleteCell = forwardRef<CellHandle, AutocompleteCellProps>(function AutocompleteCell(
  {
    column,
    value,
    focused,
    editing,
    initialChar,
    onCommit,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
    onMoveHorizontal,
    onMoveTab,
    contacts,
  },
  ref,
) {
  // Wird bei jedem neuen Editiervorgang frisch gemountet (siehe DataGrid.tsx
  // key={editing ? `editing-${editSession}` : 'idle'}), daher initialisiert
  // sich draft garantiert korrekt - kein Effect-Timing-Risiko mehr.
  const [draft, setDraft] = useState(initialChar ?? value ?? '');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitOnce = useCommitOnce();

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
  // Genau ein Treffer, der exakt dem bereits committeten value entspricht,
  // ist keine echte Auswahlmoeglichkeit - ohne diese Ausnahme oeffnete sich
  // das Dropdown beim blossen Fokussieren einer bereits ausgefuellten Zelle
  // von selbst (der Wert matcht sich immer selbst) und blockierte zugleich
  // ArrowUp/ArrowDown zum Verlassen der Zelle (die nur bei !listOpen
  // greifen, siehe unten).
  const isOnlyCurrentValue = matches.length === 1 && matches[0].toLowerCase() === (value ?? '').toLowerCase();
  const listOpen = matches.length > 0 && !isOnlyCurrentValue;

  const commit = (text: string) => {
    return commitOnce(() => {
      const committed = text === '' ? null : text;
      onCommit(committed);
      return committed;
    });
  };

  useImperativeHandle(ref, () => ({
    commitPending: () => commit(matches.length === 1 ? matches[0] : draft),
  }));

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
          // Strg+Enter gehoert dem Grid ("neue Zeile anlegen") - hier
          // durchlassen, damit es das aeussere onKeyDown und damit
          // useGridNavigation erreicht.
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            return;
          }
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
            e.stopPropagation();
            if (listOpen && matches.length > 1) {
              // Mehrere Treffer: Enter uebernimmt zunaechst nur den
              // hervorgehobenen Vorschlag ins Feld, damit weiteres Tippen
              // die Auswahl noch eingrenzen kann - ein zweiter Enter-Druck
              // committet dann den (jetzt einzigen) Treffer und verlaesst
              // die Zelle, siehe Zweig unten.
              setDraft(matches[highlightIndex]);
              return;
            }
            // Kein oder genau ein Treffer: sofort committen und verlassen -
            // ohne diesen Zweig blieb man bei einem eindeutigen Treffer
            // (z.B. "MA" -> nur "Markus Dunkel") in der Zelle haengen, weil
            // Enter nur den Vorschlag ins Feld schrieb, ohne zu committen;
            // ein Klick nach draussen verwarf diesen Text dann komplett.
            commit(listOpen ? matches[0] : draft);
            onMoveDown();
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            commit(matches.length === 1 ? matches[0] : draft);
            onMoveTab(e.shiftKey ? -1 : 1);
            return;
          }

          // Pfeiltasten verlassen die Zelle am Feldrand, analog zu
          // BulletTextCell.tsx - ArrowDown/ArrowUp sind bei offener
          // Vorschlagsliste bereits oben abgefangen (Highlight wechseln),
          // hier greifen sie nur bei geschlossener Liste.
          const el = e.currentTarget;
          const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
          const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;

          if (e.key === 'ArrowLeft' && atStart) {
            e.preventDefault();
            e.stopPropagation();
            commit(draft);
            onMoveHorizontal(-1);
            return;
          }
          if (e.key === 'ArrowRight' && atEnd) {
            e.preventDefault();
            e.stopPropagation();
            commit(draft);
            onMoveHorizontal(1);
            return;
          }
          if (e.key === 'ArrowUp' && !listOpen) {
            e.preventDefault();
            e.stopPropagation();
            commit(draft);
            onMoveUp();
            return;
          }
          if (e.key === 'ArrowDown' && !listOpen) {
            e.preventDefault();
            e.stopPropagation();
            commit(draft);
            onMoveDown();
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
});
