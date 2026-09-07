import { useCallback, useState } from 'react';
import { applyIngestDecisions, scanIngest } from '../api/azureBoardsApi';
import type { AzureBoardsCategory, KnownPerson, SubmitCandidate, SubmitDecision } from '../api/azureBoardsTypes';

export type IngestPhase = 'idle' | 'scanning' | 'reviewing' | 'applying' | 'done' | 'error';

interface IngestState {
  phase: IngestPhase;
  category: AzureBoardsCategory | null;
  candidates: SubmitCandidate[];
  knownPersons: KnownPerson[];
  currentIndex: number;
  decisions: SubmitDecision[];
  reviewToken: string | null;
  log: string | null;
  errorMessage: string | null;
  // Merge-Konflikte (run_merge.sh Exit 5): erfolgreich, braucht aber eine
  // Entscheidung in 2_ai-ready, bevor importiert werden kann.
  warningMessage: string | null;
  conflictFiles: string[];
}

const initialState: IngestState = {
  phase: 'idle',
  category: null,
  candidates: [],
  knownPersons: [],
  currentIndex: 0,
  decisions: [],
  reviewToken: null,
  log: null,
  errorMessage: null,
  warningMessage: null,
  conflictFiles: [],
};

export function useAzureBoardsIngest() {
  const [state, setState] = useState<IngestState>(initialState);

  const start = useCallback(async (category: AzureBoardsCategory) => {
    setState({ ...initialState, phase: 'scanning', category });
    try {
      const response = await scanIngest(category);
      if (response.candidates.length === 0) {
        setState((prev) => ({ ...prev, phase: 'applying', knownPersons: response.knownPersons, log: response.log }));
        const result = await applyIngestDecisions(response.reviewToken, [], category);
        setState((prev) => ({
          ...prev,
          phase: result.success ? 'done' : 'error',
          log: result.log ?? prev.log,
          errorMessage: result.success ? null : (result.error ?? 'Unbekannter Fehler.'),
          warningMessage: result.warning ?? null,
          conflictFiles: result.conflictFiles ?? [],
        }));
        return;
      }
      setState((prev) => ({
        ...prev,
        phase: 'reviewing',
        candidates: response.candidates,
        knownPersons: response.knownPersons,
        reviewToken: response.reviewToken,
        currentIndex: 0,
        decisions: [],
        log: response.log,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Scan fehlgeschlagen.',
      }));
    }
  }, []);

  const decide = useCallback(
    (decision: SubmitDecision) => {
      setState((prev) => {
        const nextDecisions = [...prev.decisions, decision];
        const nextIndex = prev.currentIndex + 1;
        if (nextIndex < prev.candidates.length) {
          return { ...prev, decisions: nextDecisions, currentIndex: nextIndex };
        }
        // Letzter Kandidat entschieden -> anwenden.
        void applyNow(prev.reviewToken, nextDecisions, prev.category!);
        return { ...prev, decisions: nextDecisions, phase: 'applying' };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const applyNow = useCallback(
    async (reviewToken: string | null, decisions: SubmitDecision[], category: AzureBoardsCategory) => {
      try {
        const result = await applyIngestDecisions(reviewToken, decisions, category);
        setState((prev) => ({
          ...prev,
          phase: result.success ? 'done' : 'error',
          log: result.log ?? prev.log,
          errorMessage: result.success ? null : (result.error ?? 'Unbekannter Fehler.'),
          warningMessage: result.warning ?? null,
          conflictFiles: result.conflictFiles ?? [],
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          phase: 'error',
          errorMessage: err instanceof Error ? err.message : 'Uebertragung fehlgeschlagen.',
        }));
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    phase: state.phase,
    candidates: state.candidates,
    knownPersons: state.knownPersons,
    currentIndex: state.currentIndex,
    log: state.log,
    errorMessage: state.errorMessage,
    warningMessage: state.warningMessage,
    conflictFiles: state.conflictFiles,
    start,
    decide,
    reset,
  };
}
