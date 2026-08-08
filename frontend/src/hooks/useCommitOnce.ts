import { useRef } from 'react';

// Jede Zellkomponente committet ihren Draft ueber mehrere unabhaengige Pfade
// (Blur, Enter, Tab, Pfeiltasten an Feldgrenzen, imperatives commitPending()
// beim Verlassen ueber Klick/Magic-Button - siehe CellHandle in Cell.tsx).
// Ohne Schutz wuerde ein zweiter Pfad denselben Wert ein zweites Mal
// committen (harmlos) oder, schlimmer, nach einem bereits erfolgten
// Escape/Cancel noch nachtraeglich committen. runOnce() garantiert pro
// Editiervorgang genau einen Commit, unabhaengig davon, welcher der
// moeglichen Ausloeser zuerst greift, und reicht den committeten Wert
// zurueck (commitPending() in DataGrid.tsx braucht ihn synchron).
export function useCommitOnce() {
  const committedRef = useRef(false);
  return <T,>(commit: () => T): T | undefined => {
    if (committedRef.current) return undefined;
    committedRef.current = true;
    return commit();
  };
}
