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
  const [resolvedValue, setResolvedValue] = useState(candidate.value);

  const typeLabel = candidate.type === 'email' ? 'E-Mail' : 'Person';

  // Nur mitschicken, wenn der Nutzer den erkannten Wert tatsaechlich
  // veraendert hat (z.B. NER-Rauschen wie "Arne Nowak:\nWir" auf
  // "Arne Nowak" korrigiert) - sonst bleibt es leer, damit die review.csv
  // nicht unnoetig befuellt wird.
  const trimmedResolvedValue = resolvedValue.trim();
  const resolvedValueChanged = trimmedResolvedValue !== '' && trimmedResolvedValue !== candidate.value;
  // Der korrigierte Wert muss Teilstring des tatsaechlich erkannten Textes
  // sein - sonst wuerde spaeter ein Wert ins Register wandern, der im
  // Quelltext gar nicht vorkommt, wodurch die Ersetzung bei apply()
  // stillschweigend leerlaeuft und der echte Name unpseudonymisiert bleibt.
  const resolvedValueInvalid = resolvedValueChanged && !candidate.value.includes(trimmedResolvedValue);
  const resolvedValueForDecision = resolvedValueChanged ? trimmedResolvedValue : '';

  const handleAccept = () => {
    if (resolvedValueInvalid) return;
    onDecide({
      value: candidate.value,
      type: candidate.type,
      action: 'accept',
      resolvedValue: resolvedValueForDecision,
    });
  };

  const handleAlias = () => {
    if (!aliasTarget) return;
    onDecide({ value: candidate.value, type: candidate.type, action: 'alias_of', aliasTarget });
  };

  const handleAliasOnce = () => {
    if (!aliasTarget) return;
    onDecide({ value: candidate.value, type: candidate.type, action: 'alias_of_once', aliasTarget });
  };

  const handleAliasPosition = () => {
    if (!aliasTarget) return;
    onDecide({ value: candidate.value, type: candidate.type, action: 'alias_of_position', aliasTarget });
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

      {candidate.type === 'person' && (
        <label className="submit-modal-resolved-value">
          Name (bei Bedarf korrigieren):
          <input
            type="text"
            className="submit-modal-input"
            value={resolvedValue}
            onChange={(e) => setResolvedValue(e.target.value)}
          />
          {resolvedValueInvalid && (
            <span className="submit-modal-input-error">
              Der korrigierte Wert muss im erkannten Text ({candidate.value}) vorkommen.
            </span>
          )}
        </label>
      )}

      <div className="submit-modal-actions">
        <button
          type="button"
          className="submit-modal-button submit-modal-button-primary"
          disabled={resolvedValueInvalid}
          onClick={handleAccept}
        >
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
            <button
              type="button"
              className="submit-modal-button"
              disabled={!aliasTarget}
              onClick={handleAliasOnce}
              title="Ersetzt den Wert mit diesem Pseudonym nur fuer diesen Import, ohne den Alias dauerhaft zu speichern. Vorsicht bei mehrdeutigen Werten (z.B. Vornamen) - ersetzt JEDES Vorkommen im Lauf. Bei Mehrdeutigkeit ist 'Nur diese Stelle' sicherer."
            >
              Nur für diesen Import verwenden
            </button>
            <button
              type="button"
              className="submit-modal-button"
              disabled={!aliasTarget}
              onClick={handleAliasPosition}
              title="Ersetzt nur diese eine Fundstelle, alle anderen Vorkommen des Werts bleiben unveraendert. Sicher bei mehrdeutigen Werten (z.B. Vornamen, wenn mehrere Personen so heissen)."
            >
              Nur diese Stelle
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
