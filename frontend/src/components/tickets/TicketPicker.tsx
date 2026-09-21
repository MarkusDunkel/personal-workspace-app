import { useMemo, useState } from 'react';
import type { TicketSummary } from '../../api/azureTicketTypes';

interface TicketPickerProps {
  tickets: TicketSummary[];
  loaded: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Auswahlliste der Tickets eines Projekts.
 *
 * Mit einem Suchfeld statt eines reinen Aufklappmenues: allein "main" hat ueber
 * 200 Tickets, die sich nur ueber Nummer und Titel unterscheiden.
 */
export function TicketPicker({
  tickets,
  loaded,
  error,
  selectedId,
  onSelect,
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

  if (!loaded) {
    return <p className="ticket-hint">Lade Tickets…</p>;
  }
  if (error) {
    return <p className="ticket-status ticket-status-error">{error}</p>;
  }

  return (
    <div className="ticket-picker">
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
    </div>
  );
}
