import { useEffect, useRef } from 'react';
import { useNoteSubmit } from '../../hooks/useNoteSubmit';
import { ReviewCandidateModal } from './ReviewCandidateModal';
import { SubmitProgressModal } from './SubmitProgressModal';
import { SubmitResultModal } from './SubmitResultModal';

interface SubmitFlowProps {
  onSubmitSuccess: () => void;
}

export function SubmitFlow({ onSubmitSuccess }: SubmitFlowProps) {
  const { phase, candidates, knownPersons, currentIndex, resultMessage, errorMessage, begin, decide, reset } =
    useNoteSubmit();

  const notifiedRef = useRef(false);
  useEffect(() => {
    if (phase === 'done' && !notifiedRef.current) {
      notifiedRef.current = true;
      onSubmitSuccess();
    } else if (phase !== 'done') {
      notifiedRef.current = false;
    }
  }, [phase, onSubmitSuccess]);

  if (phase === 'idle') {
    return (
      <button type="button" className="submit-button" onClick={begin}>
        Absenden
      </button>
    );
  }

  return (
    <>
      <button type="button" className="submit-button" disabled>
        Absenden
      </button>
      {phase === 'scanning' && <SubmitProgressModal label="Suche nach Personen und E-Mails…" />}
      {phase === 'reviewing' && candidates[currentIndex] && (
        <ReviewCandidateModal
          // Erzwingt Neu-Mount pro Kandidat, damit interner State (z.B.
          // korrigierter Name) nicht faelschlich fuer den naechsten
          // Kandidaten uebernommen wird.
          key={currentIndex}
          candidate={candidates[currentIndex]}
          index={currentIndex}
          total={candidates.length}
          knownPersons={knownPersons}
          onDecide={decide}
        />
      )}
      {phase === 'applying' && <SubmitProgressModal label="Pseudonymisiere und übertrage…" />}
      {phase === 'done' && (
        <SubmitResultModal success targetPath={resultMessage} errorMessage={null} onClose={reset} />
      )}
      {phase === 'error' && (
        <SubmitResultModal success={false} targetPath={null} errorMessage={errorMessage} onClose={reset} />
      )}
    </>
  );
}
