import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { CellHandle, CellProps } from './Cell';
import { useCommitOnce } from '../hooks/useCommitOnce';

interface TypCellProps extends CellProps {
  typValues: string[];
}

export const TypCell = forwardRef<CellHandle, TypCellProps>(function TypCell(
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
    typValues,
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
  // Genau ein Treffer, der exakt dem bereits committeten value entspricht,
  // ist keine echte Auswahlmoeglichkeit - ohne diese Ausnahme oeffnete sich
  // das Dropdown beim blossen Fokussieren einer bereits ausgefuellten Zelle
  // von selbst (der Wert matcht sich immer selbst) und blockierte zugleich
  // ArrowUp/ArrowDown zum Verlassen der Zelle (die nur bei !listOpen
  // greifen, siehe unten).
  const isOnlyCurrentValue = matches.length === 1 && matches[0].toLowerCase() === (value ?? '').toLowerCase();
  const listOpen = matches.length > 0 && !isOnlyCurrentValue;

  const matchExact = (text: string) => typValues.find((t) => t.toLowerCase() === text.trim().toLowerCase());

  const commit = (text: string) => {
    return commitOnce(() => {
      if (text.trim() === '') {
        onCommit(null);
        return null;
      }
      const exact = matchExact(text);
      if (exact) {
        onCommit(exact);
        return exact;
      }
      // Kein Datenverlust: "Typ" erlaubt nur Werte aus typValues, ein nicht
      // passender Freitext ist kein gueltiger, speicherbarer Zustand -
      // onCancelEdit() faellt auf den zuletzt committeten value zurueck,
      // statt einen ungueltigen Wert zu speichern oder ihn wortlos zu
      // verwerfen.
      onCancelEdit();
      return undefined;
    });
  };

  useImperativeHandle(ref, () => ({ commitPending: () => commit(draft) }));

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
              // hervorgehobenen Vorschlag ins Feld, ein zweiter Enter-Druck
              // committet dann den (jetzt einzigen) Treffer.
              setDraft(matches[highlightIndex]);
              return;
            }
            // Kein oder genau ein Treffer: sofort committen und verlassen -
            // sonst blieb man bei eindeutigem Treffer in der Zelle haengen
            // (Enter schrieb nur den Vorschlag ins Feld, ohne zu committen).
            commit(listOpen ? matches[0] : draft);
            onMoveDown();
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            commit(listOpen ? matches[highlightIndex] : draft);
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
