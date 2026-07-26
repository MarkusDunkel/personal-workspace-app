import { useMemo } from 'react';
import type { LineValidation } from '../api/types';

interface OverlayProps {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  lines: string[];
  validations: LineValidation[];
  activeLineIndex: number;
}

export function Overlay({ overlayRef, lines, validations, activeLineIndex }: OverlayProps) {
  const byLine = useMemo(() => {
    const m = new Map<number, LineValidation>();
    for (const v of validations) m.set(v.lineIndex, v);
    return m;
  }, [validations]);

  return (
    <div id="overlay" className="overlay" aria-hidden="true" ref={overlayRef}>
      {lines.map((lineText, index) => {
        const validation = index !== activeLineIndex ? byLine.get(index) : undefined;
        let cls = 'line';
        let title: string | undefined;
        if (validation) {
          if (validation.error) {
            cls = 'line error';
            title = validation.error;
          } else if (validation.warnings && validation.warnings.length > 0) {
            cls = 'line warn';
            title = validation.warnings.map((w) => w.message).join(' / ');
          }
        }
        return (
          <span key={index} className={cls} title={title}>
            {lineText.length === 0 ? ' ' : lineText}
            {'\n'}
          </span>
        );
      })}
    </div>
  );
}
