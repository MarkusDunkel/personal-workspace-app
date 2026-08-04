import type { ReactNode } from 'react';

interface SubmitModalProps {
  children: ReactNode;
}

export function SubmitModal({ children }: SubmitModalProps) {
  return (
    <div className="submit-modal-overlay">
      <div className="submit-modal" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
