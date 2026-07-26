import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface SplitterProps {
  onDrag: (deltaPx: number) => void;
  onDragEnd: () => void;
}

export function Splitter({ onDrag, onDragEnd }: SplitterProps) {
  const lastXRef = useRef(0);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastXRef.current = e.clientX;
  }, []);

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.buttons !== 1) return;
      const delta = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      if (delta !== 0) onDrag(delta);
    },
    [onDrag],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      onDragEnd();
    },
    [onDragEnd],
  );

  return (
    <div
      className="splitter"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="separator"
      aria-orientation="vertical"
      aria-label="Spaltenbreite anpassen"
    />
  );
}
