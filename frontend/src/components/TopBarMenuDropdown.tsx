import { useEffect, useRef, useState } from 'react';

export interface DropdownItem {
  id: string;
  label: string;
}

interface TopBarMenuDropdownProps {
  label: string;
  /** Ist die zugehoerige Ansicht gerade aktiv? */
  active: boolean;
  items: DropdownItem[];
  /** Welcher Eintrag ist gewaehlt (wird hervorgehoben). */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Wird bei jedem Klick auf die Schaltflaeche gerufen - wechselt die Ansicht. */
  onActivate: () => void;
  /** Text, wenn die Liste leer ist. */
  emptyLabel: string;
}

/**
 * Menuepunkt in der Topbar, der zusaetzlich eine Auswahlliste aufklappt.
 *
 * In der Topbar gab es dafuer kein Vorbild; die beiden nicht offensichtlichen
 * Verhaltensweisen sind aus ColumnFilterMenu uebernommen, wo sie erarbeitet
 * wurden:
 *
 * 1. Der Aussenklick wird per mousedown am document erkannt, NICHT per click.
 *    Ein Klick auf ein anderes Bedienelement kann dort einen Rerender
 *    ausloesen, der das Klick-Ziel zwischen mousedown und mouseup im DOM
 *    ersetzt - der Browser findet dann kein gemeinsames Element mehr und
 *    liefert "click" an einen stabilen Vorfahren, dieser Handler feuerte nie.
 * 2. Jeder Eintrag nutzt onMouseDown mit preventDefault, damit der Klick den
 *    Tastaturfokus nicht aus der Liste reisst.
 */
export function TopBarMenuDropdown({
  label,
  active,
  items,
  selectedId,
  onSelect,
  onActivate,
  emptyLabel,
}: TopBarMenuDropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const select = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className="topbar-menu-dropdown-anchor" ref={rootRef}>
      <button
        type="button"
        className={`topbar-menu-item${active ? ' active' : ''}`}
        aria-expanded={open}
        onClick={() => {
          // Der Klick wechselt die Ansicht UND klappt die Auswahl auf - so
          // ist ein Workspace in zwei Klicks erreichbar, auch aus einer
          // anderen Ansicht heraus.
          onActivate();
          setOpen((o) => !o);
          setHighlightIndex(Math.max(0, items.findIndex((i) => i.id === selectedId)));
        }}
      >
        {label} ▾
      </button>
      {open && (
        <ul className="autocomplete-suggestions topbar-menu-dropdown">
          {items.length === 0 ? (
            <li className="topbar-menu-dropdown-empty">{emptyLabel}</li>
          ) : (
            items.map((item, i) => (
              <li
                key={item.id}
                className={
                  i === highlightIndex
                    ? 'highlighted'
                    : item.id === selectedId
                      ? 'topbar-menu-dropdown-selected'
                      : undefined
                }
                onMouseEnter={() => setHighlightIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(item.id);
                }}
              >
                {item.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
