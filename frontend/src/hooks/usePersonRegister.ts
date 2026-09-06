import { useEffect, useState } from 'react';
import { getPersonRegister } from '../api/listsApi';

/**
 * Die Zuordnung Pseudonym -> Klarname, fuer die ANZEIGE.
 *
 * Aufgebaut wie useSuggestionList (laden, bei reloadToken erneut, im Fehler-
 * fall leer). Ein leeres Ergebnis ist ausdruecklich in Ordnung: die Ansicht
 * zeigt dann die Pseudonyme, also den heutigen Zustand - fehlende Klarnamen
 * duerfen ein Meeting nicht aufhalten.
 */
export function usePersonRegister(reloadToken: number = 0): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    getPersonRegister()
      .then(setNames)
      .catch(() => setNames({}));
  }, [reloadToken]);

  return names;
}
