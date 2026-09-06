import type { ReactNode } from 'react';
import type { MdBlock, MdTableCell, TableAlign } from '../utils/markdownBlocks';
import { splitBlocks } from '../utils/markdownBlocks';
import type { InlineToken } from '../utils/markdownInline';
import { collectHighlights, plainTextOf, shift, tokenizeInline } from '../utils/markdownInline';
import { blockTokens } from '../utils/markdownOffsets';
import { highlightCode } from '../utils/highlightCode';

interface MarkdownViewProps {
  markdown: string;
  /** Klick auf eine Kommentarnotiz - zum Bearbeiten (Phase 6). */
  onCommentClick?: (highlightStart: number) => void;
}

/**
 * Zeigt Markdown gerendert an. Bewusst NICHT editierbar: Text wird im
 * Rohmodus geaendert (siehe WorkspaceEditor), hier wird gelesen, markiert und
 * kommentiert.
 *
 * Der Renderer gibt React-Elemente zurueck, niemals HTML-Strings. Nur einer
 * der beiden Gruende ist Sicherheit (JSX maskiert Textkinder automatisch,
 * dangerouslySetInnerHTML nicht). Der tragende Grund: es braucht echte
 * React-Knoten, um Quell-Offsets und Klick-Handler daran zu haengen.
 *
 * NICHT unterstuetzt - bewusst und ausreichend fuer kurzlebige
 * Arbeitsdokumente: Referenz-Links, Bilder, Fussnoten [^1], HTML-Bloecke,
 * Setext-Ueberschriften, verschachtelte Zitate, harter Umbruch durch zwei
 * Leerzeichen, Durchstreichen. Listen werden flach je Eintrag gerendert
 * (Einzug als Abstand), ohne echte <ul>-Verschachtelung. Alles davon bleibt
 * im Rohmodus vollstaendig bearbeitbar, und replaceBlock kann es nicht
 * beschaedigen.
 */
export function MarkdownView({ markdown, onCommentClick }: MarkdownViewProps) {
  const blocks = splitBlocks(markdown);

  return (
    <div className="ws-doc">
      {blocks.map((block) => (
        <BlockView
          key={block.start}
          block={block}
          onCommentClick={onCommentClick}
        />
      ))}
    </div>
  );
}

function BlockView({
  block,
  onCommentClick,
}: {
  block: MdBlock;
  onCommentClick?: (highlightStart: number) => void;
}) {
  // Code-Bloecke und Frontmatter bleiben woertlich stehen - ihr Inhalt darf
  // gar nicht als Markdown gedeutet werden.
  if (block.kind === 'codeFence' || block.kind === 'verbatim') {
    return <CodeBlockView block={block} />;
  }
  if (block.kind === 'blank') return null;
  if (block.kind === 'hr') return <hr className="ws-block-hr" />;
  if (block.kind === 'table') {
    return <TableView block={block} onCommentClick={onCommentClick} />;
  }

  const tokens = tokenizeInline(block.source);
  // Offsets der Tokens sind blockrelativ; fuer die Auswahl braucht die
  // Oberflaeche Dokument-Offsets. Die Umrechnung passiert beim Rendern, damit
  // jedes data-ws-off direkt im Dokument-Koordinatensystem steht.
  const body = renderTokens(tokens, block.start, stripPrefix(block));
  const notes = <CommentNotes tokens={tokens} blockStart={block.start} onCommentClick={onCommentClick} />;

  const attrs = { 'data-ws-block': block.start, className: 'ws-block' } as const;

  switch (block.kind) {
    case 'heading': {
      const level = Math.min(block.level ?? 1, 6);
      const Tag = `h${level}` as 'h1';
      return (
        <>
          <Tag {...attrs} className={`ws-block ws-block-h${level}`}>{body}</Tag>
          {notes}
        </>
      );
    }
    case 'quote':
      return (
        <>
          <blockquote {...attrs} className="ws-block ws-block-quote">{body}</blockquote>
          {notes}
        </>
      );
    case 'task':
      return (
        <>
          <div {...attrs} className="ws-block ws-block-task" style={indent(block.level)}>
            <span className="ws-task-box" aria-hidden="true">{block.checked ? '☑' : '☐'}</span>
            <span className="ws-task-text">{body}</span>
          </div>
          {notes}
        </>
      );
    case 'listItem':
      return (
        <>
          <div {...attrs} className="ws-block ws-block-list" style={indent(block.level)}>
            <span className="ws-list-bullet" aria-hidden="true">{block.ordered ? '·' : '•'}</span>
            <span className="ws-list-text">{body}</span>
          </div>
          {notes}
        </>
      );
    default:
      return (
        <>
          <p {...attrs}>{body}</p>
          {notes}
        </>
      );
  }
}

/**
 * Zeichenzahl des Syntax-Praefixes, das nicht mitgerendert wird ("## ",
 * "- [x] ", "> "). Wird uebersprungen, aber NICHT aus den Offsets
 * herausgerechnet - die Offsets der uebrigen Tokens bleiben absolut, damit
 * die Auswahlabbildung stimmt.
 */
function stripPrefix(block: MdBlock): number {
  const m = /^(\s*(?:#{1,6}\s+|[-*+]\s+\[[ xX]\]\s*|[-*+]\s+|\d+[.)]\s+|>\s?))/.exec(block.source);
  return m ? m[1].length : 0;
}

function indent(level?: number) {
  return level && level > 0 ? { paddingLeft: `${level * 0.6}rem` } : undefined;
}

/**
 * Die Kommentare eines Blocks, als Randnotizen darunter.
 *
 * Eigene Komponente, weil Absaetze und Tabellen sie gleichermassen brauchen -
 * bei der Tabelle stammen die Tokens aus allen Zellen zusammen.
 */
function CommentNotes({
  tokens,
  blockStart,
  onCommentClick,
}: {
  tokens: InlineToken[];
  blockStart: number;
  onCommentClick?: (highlightStart: number) => void;
}) {
  const comments = collectHighlights(tokens).filter((h) => h.comment);
  if (comments.length === 0) return null;
  return (
    <div className="ws-block-comments">
      {comments.map((h) => (
        <button
          key={h.start}
          type="button"
          className="ws-comment-note"
          title="Kommentar bearbeiten"
          onClick={() => onCommentClick?.(blockStart + h.start)}
        >
          <span className="ws-comment-note-marker" aria-hidden="true">
            └─ 💬
          </span>{' '}
          <span className="ws-comment-note-quote">„{plainTextOf(h.children)}"</span>{' '}
          <span className="ws-comment-note-text">{h.comment!.text}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Ein Code-Block: die Zaun-Zeilen werden NICHT mitgezeigt (frueher stand
 * "```json" woertlich im Dokument), der Inhalt wird nach Sprache eingefaerbt.
 *
 * data-ws-block bleibt - es ist die Blockidentitaet, nicht die
 * Auswahlabbildung. data-ws-off-Spans gibt es hier bewusst KEINE:
 * normalizeSelection lehnt eine Auswahl in codeFence/verbatim ohnehin ab
 * ('insideCode'), Hervorheben und Kommentieren sind hier also gar nicht
 * moeglich.
 */
function CodeBlockView({ block }: { block: MdBlock }) {
  // strict ist in diesem Projekt AUS - die Pruefung muss von Hand sein.
  const hasInner =
    typeof block.innerStart === 'number' && typeof block.innerEnd === 'number';
  // Blockrelativ gerechnet, damit block.source genuegt und das
  // Gesamtdokument nicht gebraucht wird.
  const code = hasInner
    ? block.source.slice(block.innerStart! - block.start, block.innerEnd! - block.start)
    : block.source;

  const nodes = highlightCode(code, block.lang);

  return (
    <pre className="ws-block ws-block-code" data-ws-block={block.start}>
      <code className={block.lang ? `language-${block.lang}` : undefined}>
        {nodes ?? code}
      </code>
    </pre>
  );
}

/** Die Tokens EINER Zelle, blockrelativ verschoben. */
function cellTokens(cell: MdTableCell): InlineToken[] {
  return shift(tokenizeInline(cell.text), cell.textStart);
}

function alignClass(align?: TableAlign): string | undefined {
  if (align === 'center') return 'ws-td--center';
  if (align === 'right') return 'ws-td--right';
  return undefined;
}

/**
 * Eine Tabelle als echtes <table>.
 *
 * Jede Zelle wird EINZELN tokenisiert und das Ergebnis um den Zellanfang
 * verschoben (cellTokens). Dadurch tragen die Zelltexte dieselben
 * data-ws-off-Spans wie ein gewoehnlicher Absatz, und Markieren und
 * Kommentieren funktionieren darin unveraendert.
 *
 * skipUpTo ist 0: eine Zelle hat kein Syntax-Praefix, das zu ueberspringen
 * waere - Pipes und Auffuell-Leerraum sind bereits ueber textStart/textEnd
 * ausgeschlossen. Deshalb bleiben renderTokens und renderToken unberuehrt.
 */
function TableView({
  block,
  onCommentClick,
}: {
  block: MdBlock;
  onCommentClick?: (highlightStart: number) => void;
}) {
  const rows = block.rows ?? [];
  const align = block.align ?? [];
  const header = rows.find((r) => r.kind === 'header');
  const body = rows.filter((r) => r.kind === 'body');
  // Fuer die Notizen unter der Tabelle zaehlen die Hervorhebungen ALLER
  // Zellen. blockTokens tokenisiert genau so wie cellTokens hier, damit
  // Anzeige und Auswahllogik nicht auseinanderlaufen.
  const allTokens = blockTokens(block);

  return (
    <>
      <table className="ws-block ws-block-table" data-ws-block={block.start}>
        {header && (
          <thead>
            <tr>
              {header.cells.map((c, n) => (
                <th key={c.textStart} className={alignClass(align[n])}>
                  {renderTokens(cellTokens(c), block.start, 0)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((r) => (
            <tr key={r.start}>
              {r.cells.map((c, n) => (
                <td key={c.textStart} className={alignClass(align[n])}>
                  {renderTokens(cellTokens(c), block.start, 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <CommentNotes
        tokens={allTokens}
        blockStart={block.start}
        onCommentClick={onCommentClick}
      />
    </>
  );
}

function renderTokens(tokens: InlineToken[], blockStart: number, skipUpTo: number): ReactNode[] {
  const out: ReactNode[] = [];
  for (const token of tokens) {
    // Innerhalb des Syntax-Praefixes wird nichts gerendert.
    if (token.end <= skipUpTo) continue;
    out.push(renderToken(token, blockStart, skipUpTo));
  }
  return out;
}

function renderToken(token: InlineToken, blockStart: number, skipUpTo: number): ReactNode {
  const key = token.start;
  switch (token.kind) {
    case 'text': {
      // Beginnt das Token im Syntax-Praefix, wird nur der Rest gezeigt - und
      // der Offset entsprechend verschoben, damit er weiter auf das erste
      // ANGEZEIGTE Zeichen zeigt.
      const from = Math.max(token.start, skipUpTo);
      const text = token.text.slice(from - token.start);
      if (text === '') return null;
      // ACHTUNG, tragende Regel: die gerenderten Zeichen eines Text-Tokens
      // sind EXAKT seine Quellzeichen. Kein Zusammenfassen von Leerzeichen,
      // keine typografischen Anfuehrungszeichen, keine HTML-Entities. Darauf
      // beruht, dass DOM-Zeichenindex minus data-ws-off den Quell-Offset
      // ergibt (siehe markdownOffsets.ts). Eine Aenderung von einem Zeichen
      // bricht die Abbildung, und nichts wuerde laut scheitern.
      return (
        <span key={key} data-ws-off={blockStart + from}>
          {text}
        </span>
      );
    }
    case 'code':
      return (
        <code key={key} className="ws-inline-code">
          {token.text}
        </code>
      );
    case 'strong':
      return <strong key={key}>{renderTokens(token.children, blockStart, skipUpTo)}</strong>;
    case 'em':
      return <em key={key}>{renderTokens(token.children, blockStart, skipUpTo)}</em>;
    case 'highlight':
      // <mark> ist semantisch genau richtig - und Obsidian rendert "==" auch
      // als <mark>, die Optik entspricht damit dem Zielsystem.
      return (
        <mark
          key={key}
          className={`ws-highlight${token.comment ? ' ws-highlight--commented' : ''}`}
          data-ws-highlight={blockStart + token.start}
        >
          {renderTokens(token.children, blockStart, skipUpTo)}
        </mark>
      );
    case 'comment':
      // Ein Kommentar ohne zugehoerige Hervorhebung. Als Notiz unter dem
      // Absatz erscheint er nicht (dort stehen nur kommentierte
      // Hervorhebungen), daher hier ein dezenter Inline-Marker.
      return (
        <span key={key} className="ws-loose-comment" title={token.text}>
          💬
        </span>
      );
    case 'link':
      return (
        <a key={key} href={token.href} className="ws-link" target="_blank" rel="noreferrer">
          {token.text}
        </a>
      );
  }
}
