import { useMemo, useState } from 'react';
import type { TicketSummary } from '../../api/azureTicketTypes';
import type { TicketBookmark } from '../../hooks/useTicketBookmarks';

interface TicketPickerProps {
  tickets: TicketSummary[];
  loaded: boolean;
  error: string | null;
  /** Das gerade gewaehlte Projekt - fuer den Vergleich mit den Lesezeichen. */
  category: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Alle Lesezeichen, ueber ALLE Projekte hinweg. */
  bookmarks: TicketBookmark[];
  /** Waehlt ein Lesezeichen an - wechselt bei Bedarf auch das Projekt. */
  onSelectBookmark: (bookmark: TicketBookmark) => void;
  onRemoveBookmark: (bookmark: TicketBookmark) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  main: 'Main',
  technical: 'Technical',
  costs: 'Costs',
};

/**
 * Auswahlliste der Tickets eines Projekts, mit den Lesezeichen darueber.
 *
 * Mit einem Suchfeld statt eines reinen Aufklappmenues: allein "main" hat ueber
 * 200 Tickets, die sich nur ueber Nummer und Titel unterscheiden.
 *
 * Die Lesezeichen stehen als eigener Block VOR der Suchliste und zeigen immer
 * ALLE gemerkten Tickets, auch die aus anderen Projekten - eine Merkliste, die
 * beim Projektwechsel halb verschwaende, waere als Einstieg wertlos. Sie
 * bleiben deshalb auch von der Suche unberuehrt: sie sollen an einer festen
 * Stelle stehen, nicht beim Tippen wegwandern.
 */
export function TicketPicker({
  tickets,
  loaded,
  error,
  category,
  selectedId,
  onSelect,
  bookmarks,
  onSelectBookmark,
  onRemoveBookmark,
}: TicketPickerProps) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tickets;
    return tickets.filter(
      (t) =>
        t.id.includes(needle)
        || t.title.toLowerCase().includes(needle)
        || t.workItemType.toLowerCase().includes(needle),
    );
  }, [tickets, query]);

  return (
    <div className="ticket-picker">
      {bookmarks.length > 0 && (
        <div className="ticket-bookmarks">
          <p className="ticket-bookmarks-heading">Lesezeichen</p>
          <ul className="ticket-list">
            {bookmarks.map((b) => {
              const isSelected = b.category === category && b.id === selectedId;
              return (
                <li key={`${b.category}:${b.id}`} className="ticket-bookmark-row">
                  <button
                    type="button"
                    className={`ticket-list-item${isSelected ? ' selected' : ''}`}
                    onClick={() => onSelectBookmark(b)}
                  >
                    <span className="ticket-list-id">#{b.id}</span>
                    <span className="ticket-list-title">{b.title}</span>
                    {/* Das Projekt gehoert sichtbar dazu: ohne es waere bei
                        gleichen Nummern aus verschiedenen Projekten nicht
                        erkennbar, welches Ticket gemeint ist. */}
                    <span className="ticket-list-category">
                      {CATEGORY_LABEL[b.category] ?? b.category}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ticket-bookmark-remove"
                    title="Lesezeichen entfernen"
                    onClick={() => onRemoveBookmark(b)}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!loaded && <p className="ticket-hint">Lade Tickets…</p>}
      {loaded && error && <p className="ticket-status ticket-status-error">{error}</p>}

      {loaded && !error && (
        <>
          <input
            className="ticket-search"
            type="search"
            placeholder="Suchen (Nummer, Titel, Typ)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p className="ticket-count">
            {visible.length} von {tickets.length}
          </p>
          <ul className="ticket-list">
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`ticket-list-item${t.id === selectedId ? ' selected' : ''}`}
                  onClick={() => onSelect(t.id)}
                >
                  <span className="ticket-list-id">#{t.id}</span>
                  <span className="ticket-list-title">{t.title}</span>
                  <span className="ticket-list-type">{t.workItemType}</span>
                  {t.hasRoadmapHistory && (
                    <span className="ticket-list-flag" title="Enthält eine Roadmap-Historie">
                      ⌗
                    </span>
                  )}
                  {t.hasConflicts && (
                    <span className="ticket-list-flag" title="Merge-Konflikt offen">
                      ⚠
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
