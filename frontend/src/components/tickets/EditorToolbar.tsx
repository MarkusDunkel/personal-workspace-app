import type { Editor } from '@milkdown/core';
import { commandsCtx, editorViewCtx } from '@milkdown/core';
import {
  toggleEmphasisCommand,
  toggleStrongCommand,
  toggleInlineCodeCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  insertHrCommand,
} from '@milkdown/preset-commonmark';
import {
  insertTableCommand,
  addRowAfterCommand,
  addColAfterCommand,
  toggleStrikethroughCommand,
} from '@milkdown/preset-gfm';
import { toggleHighlightCommand } from './highlightMark';
import { deleteColCommand, deleteRowCommand, deleteTableCommand } from './tableCommands';
import { toggleTaskListCommand } from './taskListCommand';

interface EditorToolbarProps {
  /** Die laufende Editor-Instanz; null, solange sie noch aufgebaut wird. */
  editor: Editor | undefined;
  /** Steht der Cursor in einer Tabelle? Steuert die Tabellen-Schaltflaechen. */
  inTable: boolean;
}

/**
 * Werkzeugleiste ueber dem Ticket-Editor.
 *
 * Fast alle Befehle kommen fertig aus Milkdowns Presets - eigene Ergaenzungen
 * sind nur die Markierung (highlightMark.ts), die Aufgabenliste
 * (taskListCommand.ts) und die Tabellen-Loeschbefehle (tableCommands.ts, die
 * liegen in prosemirror-tables und sind in Milkdown nicht als Befehl
 * registriert).
 *
 * Alle Schaltflaechen verhindern das Standardverhalten beim mousedown: ohne
 * das naehme der Klick dem Editor den Fokus, und die Textauswahl waere beim
 * Ausfuehren des Befehls schon verloren. Dasselbe Muster wie in
 * TopBarMenuDropdown.
 */
export function EditorToolbar({ editor, inTable }: EditorToolbarProps) {
  // Der Schluesseltyp ist je Befehl ein anderer generischer CmdKey; fuer die
  // Leiste zaehlt nur, dass er an commandsCtx.call weitergereicht wird.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (key: any, payload?: unknown) => {
    editor?.action((ctx) => {
      ctx.get(commandsCtx).call(key, payload);
      // Nach jedem Befehl zurueck in den Editor - sonst bliebe der Fokus auf
      // der Schaltflaeche und die naechste Eingabe ginge ins Leere.
      ctx.get(editorViewCtx).focus();
    });
  };

  const Btn = ({
    onRun,
    title,
    children,
    disabled,
  }: {
    onRun: () => void;
    title: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      className="ticket-tool-button"
      title={title}
      disabled={disabled || !editor}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
    >
      {children}
    </button>
  );

  return (
    <div className="ticket-toolbar" role="toolbar" aria-label="Formatierung">
      <div className="ticket-tool-group">
        <Btn onRun={() => run(toggleStrongCommand.key)} title="Fett (Strg+B)">
          <strong>F</strong>
        </Btn>
        <Btn onRun={() => run(toggleEmphasisCommand.key)} title="Kursiv (Strg+I)">
          <em>K</em>
        </Btn>
        <Btn onRun={() => run(toggleStrikethroughCommand.key)} title="Durchgestrichen">
          <s>S</s>
        </Btn>
        <Btn onRun={() => run(toggleInlineCodeCommand.key)} title="Code">
          <code>{'<>'}</code>
        </Btn>
        <Btn onRun={() => run(toggleHighlightCommand.key)} title="Markieren (Strg+Umschalt+H)">
          <span className="ticket-mark-swatch" aria-hidden="true" />
        </Btn>
      </div>

      <div className="ticket-tool-group">
        <Btn onRun={() => run(wrapInHeadingCommand.key, 1)} title="Überschrift 1">H1</Btn>
        <Btn onRun={() => run(wrapInHeadingCommand.key, 2)} title="Überschrift 2">H2</Btn>
        <Btn onRun={() => run(wrapInHeadingCommand.key, 3)} title="Überschrift 3">H3</Btn>
        <Btn onRun={() => run(turnIntoTextCommand.key)} title="Als Fließtext">¶</Btn>
      </div>

      <div className="ticket-tool-group">
        <Btn onRun={() => run(wrapInBulletListCommand.key)} title="Aufzählung">•</Btn>
        <Btn onRun={() => run(wrapInOrderedListCommand.key)} title="Nummerierte Liste">1.</Btn>
        <Btn onRun={() => run(toggleTaskListCommand.key)} title="Aufgabenliste zum Abhaken">☑</Btn>
        <Btn onRun={() => run(wrapInBlockquoteCommand.key)} title="Zitat">❝</Btn>
        <Btn onRun={() => run(insertHrCommand.key)} title="Trennlinie">—</Btn>
      </div>

      <div className="ticket-tool-group">
        <Btn
          onRun={() => run(insertTableCommand.key, { row: 3, col: 3 })}
          title="Tabelle einfügen (3 × 3)"
        >
          ▦
        </Btn>
        {/* Die folgenden wirken nur innerhalb einer Tabelle - ausserhalb
            deaktiviert, damit der Klick nicht wirkungslos verpufft. */}
        <Btn onRun={() => run(addRowAfterCommand.key)} title="Zeile einfügen" disabled={!inTable}>
          +Zeile
        </Btn>
        <Btn onRun={() => run(addColAfterCommand.key)} title="Spalte einfügen" disabled={!inTable}>
          +Spalte
        </Btn>
        <Btn onRun={() => run(deleteRowCommand.key)} title="Zeile löschen" disabled={!inTable}>
          −Zeile
        </Btn>
        <Btn onRun={() => run(deleteColCommand.key)} title="Spalte löschen" disabled={!inTable}>
          −Spalte
        </Btn>
        <Btn onRun={() => run(deleteTableCommand.key)} title="Tabelle löschen" disabled={!inTable}>
          ▦✕
        </Btn>
      </div>
    </div>
  );
}
