import { useLayoutEffect, useRef, useState } from 'react';
import type { ColumnDefinition } from '../api/noteTypes';
import { AutocompleteCell } from './AutocompleteCell';
import { DatePickerCell } from './DatePickerCell';
import { TypCell } from './TypCell';
import { TextEditorModal } from './TextEditorModal';

export interface CellProps {
  column: ColumnDefinition;
  value: string | null;
  focused: boolean;
  editing: boolean;
  initialChar: string | undefined;
  onCommit: (value: string | null) => void;
  onCancelEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveHorizontal: (delta: 1 | -1) => void;
  onMoveTab: (delta: 1 | -1) => void;
}

export interface CellDispatchProps extends CellProps {
  contacts: string[];
  typValues: string[];
}

export function TextCell({
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
}: CellProps) {
  // Tippen auf eine bereits gefuellte Zelle haengt an, statt den Wert zu
  // ersetzen - anders als bei Typ/Datum/Person, wo Ueberschreiben gewuenscht
  // ist (siehe Plan: "Inhalt" wird ueber das Vollbild-Modal bearbeitet, ein
  // versehentliches Ueberschreiben durch einen einzelnen Tastendruck waere
  // hier besonders folgenschwer). Wird bei jedem neuen Editiervorgang frisch
  // gemountet (siehe DataGrid.tsx key={editing ? `editing-${editSession}` :
  // 'idle'}), daher initialisiert sich draft garantiert korrekt.
  const [draft, setDraft] = useState(initialChar ? (value ?? '') + initialChar : value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
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

  if (column.label === 'Inhalt') {
    return (
      <TextEditorModal
        value={value}
        onCommit={onCommit}
        onCancel={onCancelEdit}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onMoveHorizontal={onMoveHorizontal}
        onMoveTab={onMoveTab}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      className="cell-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft === '' ? null : draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          onCommit(draft === '' ? null : draft);
          onMoveDown();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          onCommit(draft === '' ? null : draft);
          onMoveTab(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
          onCancelEdit();
        }
      }}
    />
  );
}

export function Cell({ contacts, typValues, ...props }: CellDispatchProps) {
  switch (props.column.type) {
    case 'PERSON':
      return <AutocompleteCell {...props} contacts={contacts} />;
    case 'DATE':
      return <DatePickerCell {...props} />;
    case 'TYP':
      return <TypCell {...props} typValues={typValues} />;
    default:
      return <TextCell {...props} />;
  }
}
