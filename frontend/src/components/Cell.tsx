import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ColumnDefinition } from '../api/tableTypes';
import { AutocompleteCell } from './AutocompleteCell';
import { DatePickerCell } from './DatePickerCell';

export interface CellProps {
  column: ColumnDefinition;
  value: string | null;
  focused: boolean;
  editing: boolean;
  initialChar: string | undefined;
  onCommit: (value: string | null) => void;
  onCancelEdit: () => void;
}

export interface CellDispatchProps extends CellProps {
  contacts: string[];
}

export function TextCell({ value, focused, editing, initialChar, onCommit, onCancelEdit }: CellProps) {
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(initialChar ?? value ?? '');
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
    return (
      <span className={`cell-display${focused ? ' cell-focused' : ''}`}>{value ?? ''}</span>
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
        if (e.key === 'Enter' || e.key === 'Tab') {
          onCommit(draft === '' ? null : draft);
        } else if (e.key === 'Escape') {
          onCancelEdit();
        }
      }}
    />
  );
}

export function Cell({ contacts, ...props }: CellDispatchProps) {
  switch (props.column.type) {
    case 'PERSON':
      return <AutocompleteCell {...props} contacts={contacts} />;
    case 'DATE':
      return <DatePickerCell {...props} />;
    default:
      return <TextCell {...props} />;
  }
}
