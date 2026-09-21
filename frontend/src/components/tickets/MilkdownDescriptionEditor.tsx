import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@milkdown/prose/view';
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm, remarkGFMPlugin } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import {
  highlightKeymap,
  highlightSchema,
  highlightStringifyHandler,
  remarkHighlightPlugin,
  toggleHighlightCommand,
} from './highlightMark';
import { intraWordUnderscoreHandler } from './underscoreEscape';
import { EditorToolbar } from './EditorToolbar';
import { toggleTaskListCommand } from './taskListCommand';
import {
  cursorIsInTable,
  deleteColCommand,
  deleteRowCommand,
  deleteTableCommand,
} from './tableCommands';

interface MilkdownDescriptionEditorProps {
  /** Startwert. Wird NUR beim Aufbau gelesen - siehe Kommentar zum Remount. */
  initialValue: string;
  onChange: (markdown: string) => void;
}

/**
 * Der visuelle Editor fuer Ticketbeschreibungen (Milkdown/ProseMirror).
 *
 * ACHTUNG - bewusste Umkehr einer dokumentierten Entscheidung. In
 * WorkspaceEditor.tsx steht, warum die Workspaces KEIN WYSIWYG bekommen:
 * "contenteditable waere die schlechtere Variante davon - der Browser
 * veraendert das DOM selbst, und die Rueckrechnung ins Markdown koennte genau
 * die Datei still beschaedigen, die die KI danach in VS Code einliest."
 *
 * Das gilt fuer Workspaces unveraendert weiter. Fuer Ticketbeschreibungen
 * wurde bewusst anders entschieden, aus drei Gruenden:
 *
 * 1. Gegenstand ist EIN Feld, keine ganze Datei. Was der Serializer
 *    ausgibt, landet in genau einem JSON-Wert; die uebrigen Felder und alle
 *    anderen Tickets der Datei sind strukturell unerreichbar
 *    (AzureTicketService aendert nur System.Description).
 * 2. Der Server schreibt nur bei echter Abweichung und lehnt ab, wenn sich
 *    die Datei zwischenzeitlich geaendert hat - eine stille Beschaedigung
 *    braucht also mindestens einen bewussten Speichervorgang des Nutzers.
 * 3. Gemessen am Bestand: der Roundtrip haelt bei 32 von 57
 *    Markdown-Beschreibungen die Bytes exakt; bei den uebrigen normalisiert
 *    CommonMark (Leerzeile vor Ueberschriften, einheitliche Listenmarker).
 *    Inhalt geht dabei nicht verloren, und die Tabellenstruktur aller 29
 *    Roadmap-Historien bleibt unveraendert - die stakeholder-html-Pipeline
 *    liest sie danach genauso.
 *
 * Diese Komponente wird beim Ticketwechsel NEU GEMOUNTET (key im
 * TicketEditor). Milkdown haelt seinen Zustand in einer ProseMirror-View
 * ausserhalb von React; ein blosses Neusetzen des Inhalts wuerde die
 * Undo-Historie des vorigen Tickets behalten, und ein Strg+Z koennte fremden
 * Text in das offene Ticket schreiben. Deshalb liest diese Komponente
 * initialValue nur einmal.
 */
export function MilkdownDescriptionEditor({
  initialValue,
  onChange,
}: MilkdownDescriptionEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** Fuer die Werkzeugleiste: der Befehl braucht die laufende Editor-Instanz. */
  const editorRef = useRef<Editor | undefined>(undefined);
  /** Dieselbe Instanz als State, damit die Werkzeugleiste neu rendert, sobald sie steht. */
  const [editorInstance, setEditor] = useState<Editor | undefined>(undefined);
  /**
   * Steht der Cursor in einer Tabelle? Schaltet die Tabellen-Schaltflaechen
   * frei. Wird bei jeder Auswahl-Aenderung neu bestimmt.
   */
  const [inTable, setInTable] = useState(false);
  // In einer Ref, damit der Effect nicht an onChange haengt: eine neue
  // Funktionsidentitaet duerfte den Editor nicht neu aufbauen.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let editor: Editor | undefined;
    let destroyed = false;

    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, initialValue);
        // Tabellen NICHT auf Spaltenbreite ausrichten.
        //
        // remark-gfm richtet Pipe-Tabellen beim Serialisieren standardmaessig
        // aus: aus "|---|---|" wird "| ------------- | ---------- |", und jede
        // Zelle wird mit Leerzeichen auf die Spaltenbreite aufgefuellt. Der
        // Effekt ist am echten Bestand drastisch - Ticket #276 waechst von
        // 17.702 auf 40.324 Zeichen (+128 %), #343 von 2.003 auf 10.303
        // (+414 %), praktisch nur aus Strichen und Leerzeichen. Im Quelltext
        // und im git-diff ist das unlesbar.
        //
        // Ohne Ausrichtung bleiben dieselben Tickets bei 17.803 bzw. 2.014
        // Zeichen, also nahezu in Originalgroesse. Die Trennzeile wird zu
        // "| - | - |", was GFM ausdruecklich erlaubt und Azure genauso
        // rendert. Die Zahl der byte-identisch durchlaufenden Beschreibungen
        // bleibt unveraendert (178) - es geht also nichts verloren.
        ctx.update(remarkGFMPlugin.options.key, (prev) => ({
          ...prev,
          tablePipeAlign: false,
          tableCellPadding: true,
        }));
        // Zwei eigene Handler:
        // - highlight schreibt die <mark>-Tags um den markierten Text; ohne
        //   ihn kennt remark-stringify den highlight-Knoten nicht und bricht ab.
        // - root haelt Unterstriche innerhalb von Woertern unmaskiert, damit
        //   aus "Person_085" nicht bei jedem Speichern "Person\_085" wird
        //   (siehe underscoreEscape.ts - das hat die Reidentifikation von
        //   Ticket 569 ausgehebelt).
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({
          ...prev,
          handlers: {
            ...(prev.handlers ?? {}),
            ...highlightStringifyHandler,
            ...intraWordUnderscoreHandler,
          },
        }));
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: { class: 'ticket-milkdown-surface', spellcheck: 'false' },
          // Nach jeder Transaktion pruefen, ob der Cursor in einer Tabelle
          // steht - die Tabellen-Schaltflaechen sind sonst immer aktiv und
          // verpuffen wirkungslos. Ueber dispatchTransaction statt eines
          // Intervalls: so ist die Anzeige genau dann aktuell, wenn sich
          // wirklich etwas geaendert hat.
          dispatchTransaction(this: EditorView, tr) {
            const view = this;
            const next = view.state.apply(tr);
            view.updateState(next);
            setInTable(cursorIsInTable(next));
          },
        }));
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
          // Der erste Aufruf kommt vom Befuellen selbst (prevMarkdown ist
          // dann leer/undefined) - ohne diese Weiche gaelte jedes Oeffnen
          // sofort als Aenderung.
          if (prevMarkdown === undefined || prevMarkdown === null) return;
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      // Markierung (<mark>) als eigener Mark - siehe highlightMark.ts.
      // remarkHighlightPlugin muss mit dabei sein, sonst kaemen beim Laden
      // die rohen Tags statt einer Markierung im Editor an.
      .use(remarkHighlightPlugin)
      .use(highlightSchema)
      .use(toggleHighlightCommand)
      .use(highlightKeymap)
      // Befehle fuer die Werkzeugleiste, die Milkdown nicht fertig mitbringt:
      // Aufgabenliste (nur als Eingaberegel vorhanden) und die
      // Tabellen-Loeschbefehle (liegen in prosemirror-tables).
      .use(toggleTaskListCommand)
      .use(deleteRowCommand)
      .use(deleteColCommand)
      .use(deleteTableCommand)
      .use(history)
      .use(listener)
      .create()
      .then((created) => {
        if (destroyed) {
          created.destroy();
          return;
        }
        editor = created;
        editorRef.current = created;
        setEditor(created);
      })
      .catch(() => {
        // Schlaegt der Aufbau fehl, bleibt die Flaeche leer; der Nutzer sieht
        // den Ladehinweis der umgebenden Ansicht.
      });

    return () => {
      destroyed = true;
      editorRef.current = undefined;
      editor?.destroy();
    };
    // initialValue bewusst NICHT in den Abhaengigkeiten: der Editor wird bei
    // einem Ticketwechsel ueber seinen key neu gemountet, nicht aktualisiert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ticket-milkdown-wrap">
      <EditorToolbar editor={editorInstance} inTable={inTable} />
      <div className="ticket-milkdown" ref={hostRef} />
    </div>
  );
}
