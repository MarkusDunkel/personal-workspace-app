import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBlockSelection } from '../hooks/useBlockSelection';
import { useWorkspaceDocument } from '../hooks/useWorkspaceDocument';
import {
  applyHighlight,
  blockAt,
  enclosingHighlight,
  removeComment,
  removeHighlight,
  setComment,
  unescapeCommentText,
} from '../utils/markdownOffsets';
import { plainTextOf } from '../utils/markdownInline';
import { CommentPopover } from './CommentPopover';
import { MarkdownView } from './MarkdownView';
import { SelectionActionBar } from './SelectionActionBar';

interface WorkspaceEditorProps {
  name: string;
  title: string;
  /** Kontaktliste fuer den Klarnamen-Hinweis beim Kommentieren. */
  contacts: string[];
}

/**
 * Ein Workspace-Dokument: gerendert lesen und kommentieren (Standard) oder
 * als Rohtext bearbeiten.
 *
 * Die Aufteilung ist bewusst so und nicht als WYSIWYG geloest. Der Grund
 * steht in bulletText.ts: eine zweite Ebene ueber dem Text ("was angezeigt
 * wird" gegen "wo der Cursor tatsaechlich ist") war in dieser App schon
 * einmal eingebaut und wurde wieder entfernt. contenteditable waere die
 * schlechtere Variante davon - der Browser veraendert das DOM selbst, und
 * die Rueckrechnung ins Markdown koennte genau die Datei still beschaedigen,
 * die die KI danach in VS Code einliest. So gibt es zu jedem Zeitpunkt genau
 * EIN Koordinatensystem.
 */
export function WorkspaceEditor({ name, title, contacts }: WorkspaceEditorProps) {
  const doc = useWorkspaceDocument(name);
  const [raw, setRaw] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  /** Offset der Hervorhebung, deren Kommentar gerade bearbeitet wird. */
  const [editingComment, setEditingComment] = useState<{ start: number; rect: DOMRect } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  const selection = useBlockSelection(doc.markdown, docRef, !raw);

  useEffect(() => {
    setRaw(false);
    setEditingComment(null);
  }, [name]);

  // Hinweise zu ungueltigen Auswahlen von selbst verschwinden lassen - sie
  // sind Erklaerung, nicht Fehlermeldung.
  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => setHint(null), 4000);
    return () => window.clearTimeout(id);
  }, [hint]);

  useEffect(() => {
    if (!selection.problem) return;
    setHint(
      selection.problem === 'crossBlock'
        ? 'Markierung muss innerhalb eines Absatzes liegen.'
        : selection.problem === 'insideCode'
          ? 'In Code kann nicht hervorgehoben werden.'
          : 'Markierung überlappt eine bestehende Hervorhebung nur teilweise.',
    );
  }, [selection.problem]);

  /**
   * Hoehe an den Inhalt anpassen. Uebernommen aus BulletTextCell, mit
   * derselben Begruendung: erst '0px', dann scrollHeight - mit 'auto' wuerde
   * scrollHeight nie unter die bereits gesetzte Hoehe fallen und das Feld
   * waechst monoton.
   *
   * Der dortige Scroll-Erhalt ueber closest('.tables-wrap') fehlt hier
   * absichtlich: diese Klasse gehoert der Notizansicht und liefert hier null,
   * die Rettung waere also ein stiller Leerlauf. Der Scrollbereich ist
   * .workspaces-view und wird direkt angesprochen.
   */
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const scrollParent = el.closest<HTMLElement>('.workspaces-view');
    const prev = scrollParent?.scrollTop;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
    if (scrollParent && prev !== undefined) scrollParent.scrollTop = prev;
  }, []);

  useLayoutEffect(() => {
    if (raw) resize();
  }, [raw, doc.markdown, resize]);

  const toggleRaw = useCallback(() => {
    setEditingComment(null);
    setRaw((wasRaw) => {
      // Beim Verlassen des Rohmodus sofort speichern, nicht auf den Debounce
      // warten: der Nutzer hat sichtbar mit dem Bearbeiten abgeschlossen.
      if (wasRaw) void doc.saveNow();
      return !wasRaw;
    });
  }, [doc]);

  /** Der Zustand der aktuellen Auswahl - liegt sie in einer Hervorhebung? */
  const activeHighlight = useMemo(() => {
    if (!selection.active) return null;
    const { block, start, end } = selection.active.selection;
    return enclosingHighlight(block, start, end);
  }, [selection.active]);

  const doHighlight = useCallback(() => {
    if (!selection.active) return;
    doc.setMarkdown(applyHighlight(doc.markdown, selection.active.selection));
    selection.clear();
  }, [doc, selection]);

  const openCommentForSelection = useCallback(() => {
    if (!selection.active) return;
    const { block, start, end } = selection.active.selection;
    const existing = enclosingHighlight(block, start, end);
    if (existing) {
      // Bestehende Hervorhebung: deren Kommentar bearbeiten.
      setEditingComment({ start: block.start + existing.start, rect: selection.active.rect });
      return;
    }
    // Noch keine Hervorhebung: erst setzen, dann den Kommentar erfassen. Der
    // Marker wandert um zwei Zeichen nach hinten.
    const next = applyHighlight(doc.markdown, selection.active.selection);
    doc.setMarkdown(next);
    setEditingComment({ start, rect: selection.active.rect });
    selection.clear();
  }, [doc, selection]);

  /** Die Hervorhebung, deren Kommentar gerade bearbeitet wird. */
  const commentTarget = useMemo(() => {
    if (!editingComment) return null;
    const block = blockAt(doc.markdown, editingComment.start);
    if (!block) return null;
    // Der Offset zeigt auf den Anfang der Hervorhebung; enclosingHighlight
    // braucht einen Punkt INNERHALB, daher zwei Zeichen weiter (hinter "==").
    const hl = enclosingHighlight(block, editingComment.start + 2, editingComment.start + 2);
    if (!hl) return null;
    return { block, hl };
  }, [editingComment, doc.markdown]);

  const detectNames = useCallback(
    (text: string) => {
      const lower = text.toLowerCase();
      return contacts.filter((c) => c && lower.includes(c.toLowerCase()));
    },
    [contacts],
  );

  // Tastenkuerzel am Container, nicht am document: so tun sie in den anderen
  // Ansichten nichts.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      toggleRaw();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      doHighlight();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommentForSelection();
    }
  };

  return (
    <div className="ws-editor" onKeyDown={handleKeyDown}>
      <div className="ws-header">
        <h2 className="ws-title">{title}</h2>
        <button
          type="button"
          className="ws-raw-toggle"
          title={raw ? 'Zurück zur Ansicht (Strg+E)' : 'Markdown bearbeiten (Strg+E)'}
          onClick={toggleRaw}
        >
          {raw ? 'Ansicht' : 'Bearbeiten'}
        </button>
        <span className="ws-status">{doc.saveStatus}</span>
      </div>

      {doc.conflict && (
        <div className="ws-conflict" role="alert">
          <span>{doc.conflict}</span>
          <button type="button" onClick={doc.reload}>
            Neu laden (lokale Änderungen verwerfen)
          </button>
        </div>
      )}

      {hint && <p className="ws-hint">{hint}</p>}
      {doc.loadError && <p className="ws-error">{doc.loadError}</p>}
      {doc.loading && <p className="loading-hint">Lade „{title}"…</p>}

      {!doc.loading && !doc.loadError && (
        raw ? (
          <textarea
            ref={textareaRef}
            className="ws-raw-input"
            value={doc.markdown}
            spellCheck={false}
            onChange={(e) => {
              doc.setMarkdown(e.target.value);
              // Waehrend einer Zeichenkomposition (auf einer deutschen
              // Tastatur etwa Tote-Taste plus Vokal) nicht umbauen - das kann
              // die Eingabe abbrechen.
              if (!composingRef.current) requestAnimationFrame(resize);
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              requestAnimationFrame(resize);
            }}
          />
        ) : (
          <div ref={docRef}>
            <MarkdownView
              markdown={doc.markdown}
              onCommentClick={(highlightStart) => {
                const el = document.querySelector<HTMLElement>(
                  `[data-ws-highlight="${highlightStart}"]`,
                );
                setEditingComment({
                  start: highlightStart,
                  rect: el?.getBoundingClientRect() ?? new DOMRect(20, 80, 0, 0),
                });
              }}
            />
          </div>
        )
      )}

      {!raw && selection.active && !editingComment && (
        <SelectionActionBar
          rect={selection.active.rect}
          isHighlighted={activeHighlight !== null}
          hasComment={activeHighlight?.comment !== undefined}
          onHighlight={doHighlight}
          onComment={openCommentForSelection}
        />
      )}

      {commentTarget && editingComment && (
        <CommentPopover
          rect={editingComment.rect}
          quote={plainTextOf(commentTarget.hl.children)}
          initialValue={
            commentTarget.hl.comment ? unescapeCommentText(commentTarget.hl.comment.text) : ''
          }
          detectNames={detectNames}
          onSave={(comment) => {
            doc.setMarkdown(
              setComment(doc.markdown, commentTarget.block, commentTarget.hl, comment),
            );
            setEditingComment(null);
            selection.clear();
          }}
          onRemoveComment={() => {
            doc.setMarkdown(removeComment(doc.markdown, commentTarget.block, commentTarget.hl));
            setEditingComment(null);
            selection.clear();
          }}
          onRemoveBoth={() => {
            doc.setMarkdown(removeHighlight(doc.markdown, commentTarget.block, commentTarget.hl));
            setEditingComment(null);
            selection.clear();
          }}
          onCancel={() => {
            setEditingComment(null);
            selection.clear();
          }}
        />
      )}
    </div>
  );
}
