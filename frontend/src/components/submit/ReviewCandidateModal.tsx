import { useState } from 'react';
import type { KnownPerson, SubmitCandidate, SubmitDecision } from '../../api/submitTypes';
import { SubmitModal } from './SubmitModal';

interface ReviewCandidateModalProps {
  candidate: SubmitCandidate;
  index: number;
  total: number;
  knownPersons: KnownPerson[];
  onDecide: (decision: SubmitDecision) => void;
}

function highlightContext(context: string) {
  const start = context.indexOf('[[');
  const end = context.indexOf(']]');
  if (start === -1 || end === -1 || end < start) {
    return context;
  }
  const before = context.slice(0, start);
  const match = context.slice(start + 2, end);
  const after = context.slice(end + 2);
  return (
    <>
      {before}
      <mark>{match}</mark>
      {after}
    </>
  );
}

export function ReviewCandidateModal({
  candidate,
  index,
  total,
  knownPersons,
  onDecide,
}: ReviewCandidateModalProps) {
  const [aliasTarget, setAliasTarget] = useState('');

  const typeLabel = candidate.type === 'email' ? 'E-Mail' : 'Person';

  const handleAccept = () => {
    onDecide({ value: candidate.value, type: candidate.type, action: 'accept' });
  };

  const handleAlias = () => {
    if (!aliasTarget) return;
    onDecide({ value: candidate.value, type: candidate.type, action: 'alias_of', aliasTarget });
  };

  const handleIgnore = () => {
    onDecide({ value: candidate.value, type: candidate.type, action: 'ignore' });
  };

  return (
    <SubmitModal>
      <p className="submit-modal-progress-label">
        Kandidat {index + 1} von {total}
      </p>
      <h3 className="submit-modal-value">
        {candidate.value} <span className="submit-modal-type">({typeLabel})</span>
      </h3>
      <p className="submit-modal-context">{highlightContext(candidate.context)}</p>

      <div className="submit-modal-actions">
        <button type="button" className="submit-modal-button submit-modal-button-primary" onClick={handleAccept}>
          Neue Person/E-Mail anlegen
        </button>

        {candidate.type === 'person' && knownPersons.length > 0 && (
          <div className="submit-modal-alias-row">
            <select
              className="submit-modal-select"
              value={aliasTarget}
              onChange={(e) => setAliasTarget(e.target.value)}
            >
              <option value="">Ist Alias von…</option>
              {knownPersons.map((person) => (
                <option key={person.pseudonym} value={person.pseudonym}>
                  {person.canonicalValue} ({person.pseudonym})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="submit-modal-button"
              disabled={!aliasTarget}
              onClick={handleAlias}
            >
              Als Alias speichern
            </button>
          </div>
        )}

        <button type="button" className="submit-modal-button submit-modal-button-muted" onClick={handleIgnore}>
          Ignorieren
        </button>
      </div>
    </SubmitModal>
  );
}
