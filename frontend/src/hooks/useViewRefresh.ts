import { useCallback, useState } from 'react';
import { refreshView } from '../api/viewsApi';
import type { ViewId } from '../api/viewsTypes';

export type ViewRefreshPhase = 'idle' | 'refreshing' | 'done' | 'error';

interface RefreshState {
  phase: ViewRefreshPhase;
  log: string | null;
  errorMessage: string | null;
  generatedAt: string | null;
}

const initialState: RefreshState = {
  phase: 'idle',
  log: null,
  errorMessage: null,
  generatedAt: null,
};

/**
 * Stoesst "Neu erzeugen" an (Reidentifikation + Publish im ai-vault) und
 * haelt den Phasenstand dafuer - aufgebaut wie useAzureBoardsDigest.
 *
 * refresh() liefert zurueck, ob der Lauf erfolgreich war: die Ansicht laedt
 * das iframe nur dann neu. Nach einem Fehlschlag bleibt bewusst der alte,
 * noch gueltige Stand stehen.
 */
export function useViewRefresh() {
  const [state, setState] = useState<RefreshState>(initialState);

  const refresh = useCallback(async (id: ViewId): Promise<boolean> => {
    setState({ ...initialState, phase: 'refreshing' });
    try {
      const result = await refreshView(id);
      setState({
        phase: result.success ? 'done' : 'error',
        log: result.log,
        errorMessage: result.success ? null : (result.error ?? 'Neu erzeugen fehlgeschlagen.'),
        generatedAt: result.generatedAt,
      });
      return result.success;
    } catch (err) {
      setState({
        ...initialState,
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Neu erzeugen fehlgeschlagen.',
      });
      return false;
    }
  }, []);

  const reset = useCallback(() => setState(initialState), []);

  return {
    phase: state.phase,
    log: state.log,
    errorMessage: state.errorMessage,
    generatedAt: state.generatedAt,
    refresh,
    reset,
  };
}
