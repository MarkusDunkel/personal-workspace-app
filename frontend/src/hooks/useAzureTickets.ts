import { useCallback, useEffect, useState } from 'react';
import { listTickets } from '../api/azureTicketsApi';
import type { TicketSummary } from '../api/azureTicketTypes';

/**
 * Die Tickets eines Azure-Projekts aus 2_ai-ready.
 *
 * loaded trennt "laedt noch" von "keine Tickets" - ein leeres Projekt ist ein
 * normaler Zustand (die Pipeline hat dort noch nichts abgelegt) und darf nicht
 * wie ein Fehler aussehen.
 */
export function useAzureTickets(category: string) {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    listTickets(category)
      .then((list) => {
        if (cancelled) return;
        setTickets(list);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setTickets([]);
        setError('Konnte die Tickets nicht laden.');
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [category, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return { tickets, loaded, error, reload };
}
