import { useCallback, useState } from 'react';
import { sendDecisions, startSubmit } from '../api/submitApi';
import type { KnownPerson, SubmitCandidate, SubmitDecision } from '../api/submitTypes';

export type SubmitPhase = 'idle' | 'scanning' | 'reviewing' | 'applying' | 'done' | 'error';

interface SubmitState {
  phase: SubmitPhase;
  candidates: SubmitCandidate[];
  knownPersons: KnownPerson[];
  currentIndex: number;
  decisions: SubmitDecision[];
  reviewToken: string | null;
  resultMessage: string | null;
  errorMessage: string | null;
}

const initialState: SubmitState = {
  phase: 'idle',
  candidates: [],
  knownPersons: [],
  currentIndex: 0,
  decisions: [],
  reviewToken: null,
  resultMessage: null,
  errorMessage: null,
};

export function useNoteSubmit() {
  const [state, setState] = useState<SubmitState>(initialState);

  const begin = useCallback(async () => {
    setState({ ...initialState, phase: 'scanning' });
    try {
      const response = await startSubmit();
      if (response.candidates.length === 0) {
        setState((prev) => ({ ...prev, phase: 'applying', knownPersons: response.knownPersons }));
        const result = await sendDecisions(response.reviewToken, []);
        setState((prev) => ({
          ...prev,
          phase: result.success ? 'done' : 'error',
          resultMessage: result.success ? (result.targetPath ?? null) : null,
          errorMessage: result.success ? null : (result.error ?? 'Unbekannter Fehler.'),
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
    async (decision: SubmitDecision) => {
      setState((prev) => {
        const nextDecisions = [...prev.decisions, decision];
        const nextIndex = prev.currentIndex + 1;
        if (nextIndex < prev.candidates.length) {
          return { ...prev, decisions: nextDecisions, currentIndex: nextIndex };
        }
        // Letzter Kandidat entschieden -> anwenden.
        void applyNow(prev.reviewToken, nextDecisions);
        return { ...prev, decisions: nextDecisions, phase: 'applying' };
      });
    },
    [],
  );

  const applyNow = useCallback(async (reviewToken: string | null, decisions: SubmitDecision[]) => {
    try {
      const result = await sendDecisions(reviewToken, decisions);
      setState((prev) => ({
        ...prev,
        phase: result.success ? 'done' : 'error',
        resultMessage: result.success ? (result.targetPath ?? null) : null,
        errorMessage: result.success ? null : (result.error ?? 'Unbekannter Fehler.'),
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Uebertragung fehlgeschlagen.',
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    phase: state.phase,
    candidates: state.candidates,
    knownPersons: state.knownPersons,
    currentIndex: state.currentIndex,
    resultMessage: state.resultMessage,
    errorMessage: state.errorMessage,
    begin,
    decide,
    reset,
  };
}
