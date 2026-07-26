import { useEffect, useState } from 'react';
import { getTableDefinitions } from '../api/tablesApi';
import type { TableDefinition } from '../api/tableTypes';

let cache: TableDefinition[] | null = null;
let inflight: Promise<TableDefinition[]> | null = null;

export function useTableDefinitions() {
  const [definitions, setDefinitions] = useState<TableDefinition[] | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) {
      setDefinitions(cache);
      return;
    }
    if (!inflight) {
      inflight = getTableDefinitions();
    }
    inflight
      .then((defs) => {
        cache = defs;
        setDefinitions(defs);
      })
      .catch(() => setError('Konnte Tabellendefinitionen nicht laden'));
  }, []);

  return { definitions, error };
}
