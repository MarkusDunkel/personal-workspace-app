import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { ColumnDefinition } from '../api/noteTypes';
import { AutocompleteCell } from './AutocompleteCell';
import { DatePickerCell } from './DatePickerCell';
import { TypCell } from './TypCell';
import { TextEditorModal } from './TextEditorModal';
import { BulletTextCell } from './BulletTextCell';
import { useCommitOnce } from '../hooks/useCommitOnce';

// Vorerst deaktiviert: das automatische Oeffnen des Vollbild-Text-Editor-
// Modals fuer die Spalte "Inhalt" hat sich als unpraktikabel erwiesen und
// wurde durch Inline-Editing mit Bullet-Listen (BulletTextCell) ersetzt.
// Code bleibt fuer eine spaetere Reaktivierung erhalten (Muster analog zu
// CALENDAR_POPUP_ENABLED in DatePickerCell.tsx).
const TEXT_EDITOR_MODAL_ENABLED = false;

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

// Von jeder Zellkomponente mit eigenem lokalen Draft-State implementiert
// (TextCell, BulletTextCell, TypCell, AutocompleteCell, DatePickerCell).
// commitPending() uebernimmt den aktuell im Eingabefeld stehenden Wert
// synchron in onCommit - unabhaengig von einem echten DOM-blur-Event. Noetig
// weil DataGrid.tsx eine editierende Zelle auf mehreren Wegen verlassen kann,
// die KEIN blur ausloesen (Klick auf eine andere Zelle noetigt per
// mousedown.preventDefault() keinen Fokuswechsel, der Magic-Button ebenso) -
// ohne diese Schnittstelle ging der lokale draft beim Unmount der Zelle
// (Key-Wechsel editing-* -> idle in DataGrid.tsx) ersatzlos verloren.
//
// Gibt den committeten Wert zurueck (oder undefined, wenn nichts committet
// wurde, z.B. weil bereits committet war oder der Draft ungueltig ist und
// verworfen wurde) - der Magic-Button in DataGrid.tsx braucht diesen Wert
// SOFORT, da row.cells als Prop erst im naechsten Render den neuen Stand
// zeigt (onCellCommit loest nur ein asynchrones State-Update aus).
export interface CellHandle {
  commitPending: () => string | null | undefined;
}

export const TextCell = forwardRef<CellHandle, CellProps>(function TextCell(
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
  },
  ref,
) {
  // Tippen auf eine bereits gefuellte Zelle haengt an, statt den Wert zu
  // ersetzen - anders als bei Typ/Datum/Person, wo Ueberschreiben gewuenscht
  // ist (siehe Plan: "Inhalt" wird ueber das Vollbild-Modal bearbeitet, ein
  // versehentliches Ueberschreiben durch einen einzelnen Tastendruck waere
  // hier besonders folgenschwer). Wird bei jedem neuen Editiervorgang frisch
  // gemountet (siehe DataGrid.tsx key={editing ? `editing-${editSession}` :
  // 'idle'}), daher initialisiert sich draft garantiert korrekt.
  const [draft, setDraft] = useState(initialChar ? (value ?? '') + initialChar : value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const bulletRef = useRef<CellHandle>(null);
  const commitOnce = useCommitOnce();

  useImperativeHandle(ref, () => ({
    commitPending: () => {
      if (column.label === 'Inhalt') {
        return bulletRef.current?.commitPending();
      }
      return commitOnce(() => {
        const committed = draft === '' ? null : draft;
        onCommit(committed);
        return committed;
      });
    },
  }));

  useLayoutEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (column.label === 'Inhalt') {
    if (editing && TEXT_EDITOR_MODAL_ENABLED) {
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
      <BulletTextCell
        ref={bulletRef}
        column={column}
        value={value}
        focused={focused}
        editing={editing}
        initialChar={initialChar}
        onCommit={onCommit}
        onCancelEdit={onCancelEdit}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onMoveHorizontal={onMoveHorizontal}
        onMoveTab={onMoveTab}
      />
    );
  }

  if (!editing) {
    return (
      <span className={`cell-display${focused ? ' cell-focused' : ''}${value ? '' : ' cell-placeholder'}`}>
        {value ?? column.label}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      className="cell-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commitOnce(() => onCommit(draft === '' ? null : draft))}
      onKeyDown={(e) => {
        // Strg+Enter gehoert dem Grid ("neue Zeile anlegen") - hier
        // durchlassen, damit es das aeussere onKeyDown und damit
        // useGridNavigation erreicht.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          commitOnce(() => onCommit(draft === '' ? null : draft));
          onMoveDown();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          commitOnce(() => onCommit(draft === '' ? null : draft));
          onMoveTab(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
          onCancelEdit();
        }
      }}
    />
  );
});

export const Cell = forwardRef<CellHandle, CellDispatchProps>(function Cell({ contacts, typValues, ...props }, ref) {
  switch (props.column.type) {
    case 'PERSON':
      return <AutocompleteCell ref={ref} {...props} contacts={contacts} />;
    case 'DATE':
      return <DatePickerCell ref={ref} {...props} />;
    case 'TYP':
      return <TypCell ref={ref} {...props} typValues={typValues} />;
    default:
      return <TextCell ref={ref} {...props} />;
  }
});
