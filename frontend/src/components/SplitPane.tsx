import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Splitter } from './Splitter';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  storageKey: string;
  minPaneWidthPx?: number;
}

function readStoredWidth(storageKey: string): number | null {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function SplitPane({ left, right, storageKey, minPaneWidthPx = 240 }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number>(() => readStoredWidth(storageKey) ?? 0);
  const liveWidthRef = useRef(leftWidth);
  liveWidthRef.current = leftWidth;

  const handleDrag = useCallback(
    (deltaPx: number) => {
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.getBoundingClientRect().width;
      const maxLeftWidth = containerWidth - minPaneWidthPx;
      setLeftWidth((current) => {
        const base = current || containerWidth / 2;
        const next = Math.min(Math.max(base + deltaPx, minPaneWidthPx), Math.max(maxLeftWidth, minPaneWidthPx));
        return next;
      });
    },
    [minPaneWidthPx],
  );

  const handleDragEnd = useCallback(() => {
    window.localStorage.setItem(storageKey, String(liveWidthRef.current));
  }, [storageKey]);

  return (
    <div className="split-pane" ref={containerRef}>
      <div className="split-pane-left" style={leftWidth > 0 ? { width: leftWidth, flex: 'none' } : undefined}>
        {left}
      </div>
      <Splitter onDrag={handleDrag} onDragEnd={handleDragEnd} />
      <div className="split-pane-right">{right}</div>
    </div>
  );
}
