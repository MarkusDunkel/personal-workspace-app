interface SelectionActionBarProps {
  /** Viewport-relative Position der Auswahl. */
  rect: DOMRect;
  /** Liegt die Auswahl in einer bestehenden Hervorhebung? */
  isHighlighted: boolean;
  hasComment: boolean;
  onHighlight: () => void;
  onComment: () => void;
}

const BAR_OFFSET = 8;
/** Geschaetzte Hoehe der Leiste - nur fuer die Platzierung ueber der Auswahl. */
const BAR_HEIGHT = 30;

/**
 * Schwebeleiste an der Textauswahl: hervorheben oder kommentieren.
 *
 * position: fixed, weil getBoundingClientRect bereits viewport-relativ
 * liefert - damit entfaellt jede Scroll-Arithmetik und jede Abhaengigkeit
 * von der Positionierung eines Vorfahren. Genau die Klasse Fehler, die der
 * Scroll-Erhalt in BulletTextCell dokumentiert.
 */
export function SelectionActionBar({
  rect,
  isHighlighted,
  hasComment,
  onHighlight,
  onComment,
}: SelectionActionBarProps) {
  // Ueber der Auswahl, wenn dort Platz ist, sonst darunter.
  const above = rect.top > BAR_HEIGHT + BAR_OFFSET;
  const top = above ? rect.top - BAR_HEIGHT - BAR_OFFSET : rect.bottom + BAR_OFFSET;
  const left = Math.max(BAR_OFFSET, Math.min(rect.left, window.innerWidth - 220));

  return (
    <div className="ws-selection-bar" style={{ top, left }} role="toolbar">
      <button
        type="button"
        title={
          isHighlighted
            ? 'Hervorhebung entfernen (Strg+Shift+H)'
            : 'Hervorheben (Strg+Shift+H)'
        }
        // onMouseDown mit preventDefault ist hier NICHT kosmetisch: ohne das
        // loest der Mousedown genau die Auswahl auf, auf die die
        // Schaltflaeche wirken soll. Dasselbe Mittel wie bei den Eintraegen
        // in ColumnFilterMenu, aber aus einem anderen Grund.
        onMouseDown={(e) => {
          e.preventDefault();
          onHighlight();
        }}
      >
        {isHighlighted ? '✕ Hervorhebung' : '== Hervorheben'}
      </button>
      <button
        type="button"
        title={hasComment ? 'Kommentar bearbeiten (Strg+Shift+K)' : 'Kommentieren (Strg+Shift+K)'}
        onMouseDown={(e) => {
          e.preventDefault();
          onComment();
        }}
      >
        💬 {hasComment ? 'Kommentar' : 'Kommentieren'}
      </button>
    </div>
  );
}
