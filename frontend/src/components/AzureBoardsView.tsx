import { useState } from 'react';
import { useAzureBoardsIngest } from '../hooks/useAzureBoardsIngest';
import { useAzureBoardsDigest } from '../hooks/useAzureBoardsDigest';
import type { AzureBoardsCategory } from '../api/azureBoardsTypes';
import { ReviewCandidateModal } from './submit/ReviewCandidateModal';
import { SubmitProgressModal } from './submit/SubmitProgressModal';

const AVAILABLE_CATEGORIES: { id: AzureBoardsCategory; label: string }[] = [
  { id: 'main', label: 'Main' },
  { id: 'technical', label: 'Technical' },
  { id: 'costs', label: 'Costs' },
];

export function AzureBoardsView() {
  // Einfachauswahl statt Mehrfachauswahl: mit dem Scan+Review-Schritt
  // (neue Namen muessen einzeln bestaetigt werden, siehe useAzureBoardsIngest)
  // wuerde eine Mehrfachauswahl mehrere Review-Dialoge nacheinander/
  // verschachtelt ausloesen - Einfachauswahl haelt den Ablauf eindeutig
  // einer Kategorie zugeordnet, analog zum Digest-Bereich.
  const [ingestCategory, setIngestCategory] = useState<AzureBoardsCategory>('main');
  const [digestCategory, setDigestCategory] = useState<AzureBoardsCategory>('main');

  const ingest = useAzureBoardsIngest();
  const digest = useAzureBoardsDigest();

  const ingestBusy = ingest.phase === 'scanning' || ingest.phase === 'reviewing' || ingest.phase === 'applying';

  return (
    <main className="azure-boards-view">
      <div className="azb-pipeline">
        <section className="azb-box">
          <h2 className="azb-heading">Ingest</h2>
          <p className="azb-box-description">
            Holt den aktuellen Stand aus Azure Boards, verarbeitet ihn und pseudonymisiert ihn
            nach <code>2_ai-ready</code>.
          </p>
          <div className="azb-digest-category">
            <label>
              Kategorie:
              <select
                value={ingestCategory}
                onChange={(e) => setIngestCategory(e.target.value as AzureBoardsCategory)}
                disabled={ingestBusy}
              >
                {AVAILABLE_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="azb-primary-button"
            disabled={ingestBusy}
            onClick={() => ingest.start(ingestCategory)}
          >
            {ingestBusy ? 'Läuft…' : 'Ingest starten'}
          </button>
          {ingest.phase === 'scanning' && <SubmitProgressModal label="Suche nach Personen und E-Mails…" />}
          {ingest.phase === 'reviewing' && ingest.candidates[ingest.currentIndex] && (
            <ReviewCandidateModal
              // Erzwingt Neu-Mount pro Kandidat, damit interner State
              // (z.B. korrigierter Name) nicht faelschlich fuer den
              // naechsten Kandidaten uebernommen wird.
              key={ingest.currentIndex}
              candidate={ingest.candidates[ingest.currentIndex]}
              index={ingest.currentIndex}
              total={ingest.candidates.length}
              knownPersons={ingest.knownPersons}
              onDecide={ingest.decide}
            />
          )}
          {ingest.phase === 'applying' && <SubmitProgressModal label="Pseudonymisiere…" />}
          {ingest.phase === 'done' && !ingest.warningMessage && (
            <p className="azb-status azb-status-ok">Fertig.</p>
          )}
          {ingest.phase === 'done' && ingest.warningMessage && (
            // Erfolgreich, aber der 3-Wege-Merge hat Konflikte gefunden. Der
            // Import bleibt blockiert (run_import.sh Exit 8), bis der
            // '_conflicts'-Schluessel in 2_ai-ready entfernt ist.
            <div className="azb-status azb-status-warn">
              <p>{ingest.warningMessage}</p>
              {ingest.conflictFiles.length > 0 && (
                <ul>
                  {ingest.conflictFiles.map((file) => (
                    <li key={file}>
                      <code>{file}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {ingest.phase === 'error' && (
            <p className="azb-status azb-status-error">{ingest.errorMessage}</p>
          )}
          {ingest.log && (
            <details className="azb-log">
              <summary>Log anzeigen</summary>
              <pre>{ingest.log}</pre>
            </details>
          )}
        </section>

        <div className="azb-connector" aria-hidden="true">
          <span className="azb-connector-arrow">→</span>
          <span className="azb-connector-label">
            Dazwischen: <code>2_ai-ready</code> manuell bearbeiten
          </span>
          <span className="azb-connector-arrow">→</span>
        </div>

        <section className="azb-box">
          <h2 className="azb-heading">Digest</h2>
          <p className="azb-box-description">
            Stellt Klarnamen wieder her, plant den Rückschreib-Vorgang und schreibt ihn nach
            Bestätigung nach Azure Boards zurück.
          </p>
          <div className="azb-digest-category">
            <label>
              Kategorie:
              <select
                value={digestCategory}
                onChange={(e) => setDigestCategory(e.target.value as AzureBoardsCategory)}
                disabled={digest.phase === 'planning' || digest.phase === 'applying'}
              >
                {AVAILABLE_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="azb-primary-button"
            disabled={digest.phase === 'planning' || digest.phase === 'applying'}
            onClick={() => digest.createPlan(digestCategory)}
          >
            {digest.phase === 'planning' ? 'Plan wird erstellt…' : 'Plan erstellen'}
          </button>

          {digest.phase === 'error' && (
            <p className="azb-status azb-status-error">{digest.errorMessage}</p>
          )}

          {digest.planMarkdown && (
            <div className="azb-plan-preview">
              <h3 className="azb-heading azb-heading-sub">Plan</h3>
              <pre className="azb-plan-markdown">{digest.planMarkdown}</pre>
              {(digest.phase === 'planReady' || digest.phase === 'applying') && (
                <button
                  type="button"
                  className="azb-apply-button"
                  disabled={digest.phase === 'applying'}
                  onClick={() => digest.apply()}
                >
                  {digest.phase === 'applying' ? 'Schreibt nach Azure Boards…' : 'Nach Azure Boards schreiben'}
                </button>
              )}
            </div>
          )}

          {digest.phase === 'done' && (
            <div className="azb-status azb-status-ok">
              Fertig.
              {digest.comparisonPath && <div className="azb-result-path">{digest.comparisonPath}</div>}
            </div>
          )}

          {digest.log && (
            <details className="azb-log">
              <summary>Log anzeigen</summary>
              <pre>{digest.log}</pre>
            </details>
          )}
        </section>
      </div>
    </main>
  );
}
