import { useCallback, useState } from 'react';
import { applyDigest, planDigest } from '../api/azureBoardsApi';
import type { AzureBoardsCategory } from '../api/azureBoardsTypes';

export type DigestPhase = 'idle' | 'planning' | 'planReady' | 'applying' | 'done' | 'error';

interface DigestState {
  phase: DigestPhase;
  planToken: string | null;
  planMarkdown: string | null;
  comparisonPath: string | null;
  log: string | null;
  errorMessage: string | null;
}

const initialState: DigestState = {
  phase: 'idle',
  planToken: null,
  planMarkdown: null,
  comparisonPath: null,
  log: null,
  errorMessage: null,
};

export function useAzureBoardsDigest() {
  const [state, setState] = useState<DigestState>(initialState);

  const createPlan = useCallback(async (category: AzureBoardsCategory) => {
    setState({ ...initialState, phase: 'planning' });
    try {
      const response = await planDigest(category);
      setState({
        ...initialState,
        phase: 'planReady',
        planToken: response.planToken,
        planMarkdown: response.planMarkdown,
        log: response.log,
      });
    } catch (err) {
      setState({
        ...initialState,
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Plan-Erstellung fehlgeschlagen.',
      });
    }
  }, []);

  const apply = useCallback(async () => {
    setState((prev) => ({ ...prev, phase: 'applying' }));
    try {
      const result = await applyDigest(state.planToken!);
      setState((prev) => ({
        ...prev,
        phase: result.success ? 'done' : 'error',
        comparisonPath: result.comparisonPath,
        log: result.log,
        errorMessage: result.success ? null : (result.error ?? 'Anwenden fehlgeschlagen.'),
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Anwenden fehlgeschlagen.',
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.planToken]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    phase: state.phase,
    planMarkdown: state.planMarkdown,
    comparisonPath: state.comparisonPath,
    log: state.log,
    errorMessage: state.errorMessage,
    createPlan,
    apply,
    reset,
  };
}
