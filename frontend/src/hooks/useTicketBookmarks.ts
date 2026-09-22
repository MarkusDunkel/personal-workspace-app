import { useCallback, useEffect, useState } from 'react';

/**
 * Ein Lesezeichen zeigt IMMER auf Projekt UND Id.
 *
 * Die Ticket-Id ist nur innerhalb eines Projekts eindeutig (dieselbe Annahme
 * steht schon in AzureBoardsView: beim Projektwechsel wird die Auswahl
 * verworfen, weil sie sonst "eine Leiche aus dem vorigen" waere). Ein
 * Lesezeichen ohne Projekt koennte nach einem Wechsel auf ein fremdes Ticket
 * zeigen.
 */
export interface TicketBookmark {
  category: string;
  id: string;
  /** Nur zur Anzeige - der Titel steht sonst erst nach dem Laden zur Verfuegung. */
  title: string;
  workItemType: string;
}

const STORAGE_KEY = 'azure-tickets.bookmarks.v1';

/**
 * Die gesetzten Lesezeichen, projektuebergreifend.
 *
 * Bewusst im localStorage und nicht im Vault: ein Lesezeichen ist eine
 * persoenliche Merkhilfe an diesem Rechner, kein Ticketinhalt. Es in
 * 2_ai-ready zu schreiben hiesse, die Dateien um ein Feld zu erweitern, das
 * die Pipeline nicht kennt - genau das, was AzureTicketService sonst
 * ueberall verhindert.
 *
 * Jeder Zugriff ist abgesichert: im privaten Fenster und bei gesperrten
 * Website-Daten wirft schon das Lesen. Ohne Speicher funktioniert die Liste
 * weiter, sie ueberlebt dann nur das Neuladen nicht.
 */
export function useTicketBookmarks() {
  const [bookmarks, setBookmarks] = useState<TicketBookmark[]>(() => read());

  // Ein zweiter Tab derselben App soll nicht mit einem veralteten Stand
  // weiterlaufen und ihn beim naechsten Setzen zurueckschreiben.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setBookmarks(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isBookmarked = useCallback(
    (category: string, id: string) =>
      bookmarks.some((b) => b.category === category && b.id === id),
    [bookmarks],
  );

  const toggle = useCallback((entry: TicketBookmark) => {
    setBookmarks((current) => {
      const without = current.filter(
        (b) => !(b.category === entry.category && b.id === entry.id),
      );
      // Neue Lesezeichen vorne: zuletzt gemerkt heisst in aller Regel gerade
      // in Arbeit, und genau die sollen oben stehen.
      const next = without.length === current.length ? [entry, ...current] : without;
      write(next);
      return next;
    });
  }, []);

  return { bookmarks, isBookmarked, toggle };
}

function read(): TicketBookmark[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Fremde oder aeltere Eintraege aussortieren statt ihnen zu vertrauen -
    // ein Eintrag ohne category liesse sich nicht mehr aufloesen.
    return parsed.filter(
      (b): b is TicketBookmark =>
        !!b
        && typeof (b as TicketBookmark).category === 'string'
        && typeof (b as TicketBookmark).id === 'string',
    );
  } catch {
    return [];
  }
}

function write(bookmarks: TicketBookmark[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Kein Speicher verfuegbar - die Liste bleibt fuer diese Sitzung gueltig.
  }
}
