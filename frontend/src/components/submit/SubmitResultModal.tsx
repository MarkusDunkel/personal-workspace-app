import { SubmitModal } from './SubmitModal';

interface SubmitResultModalProps {
  success: boolean;
  targetPath: string | null;
  errorMessage: string | null;
  onClose: () => void;
}

export function SubmitResultModal({ success, targetPath, errorMessage, onClose }: SubmitResultModalProps) {
  return (
    <SubmitModal>
      {success ? (
        <>
          <h3 className="submit-modal-value">Übertragen</h3>
          <p>Die Notizen wurden pseudonymisiert nach {targetPath ?? '2_ai-ready/notes'} übertragen.</p>
        </>
      ) : (
        <>
          <h3 className="submit-modal-value submit-modal-error-title">Fehler</h3>
          <pre className="submit-modal-error">{errorMessage ?? 'Unbekannter Fehler.'}</pre>
        </>
      )}
      <div className="submit-modal-actions">
        <button type="button" className="submit-modal-button submit-modal-button-primary" onClick={onClose}>
          Schließen
        </button>
      </div>
    </SubmitModal>
  );
}
