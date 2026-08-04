import { SubmitModal } from './SubmitModal';

interface SubmitProgressModalProps {
  label: string;
}

export function SubmitProgressModal({ label }: SubmitProgressModalProps) {
  return (
    <SubmitModal>
      <p className="submit-modal-progress">{label}</p>
    </SubmitModal>
  );
}
