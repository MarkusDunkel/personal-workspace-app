import { useEffect, useState } from 'react';

/**
 * Laedt eine Vorschlagsliste (Contacts/Projekte/Meetings) und laedt sie bei
 * jeder Aenderung von reloadToken neu - nach einem erfolgreichen Absenden
 * kann sich die Liste durch die serverseitige Reconciliation veraendert
 * haben (Werte bestaetigt oder wieder entfernt).
 */
export function useSuggestionList(fetcher: () => Promise<string[]>, reloadToken: number = 0): string[] {
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    fetcher()
      .then(setValues)
      .catch(() => setValues([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  return values;
}
