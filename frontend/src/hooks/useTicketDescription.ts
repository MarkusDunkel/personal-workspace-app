import { useCallback, useEffect, useRef, useState } from 'react';
import { getTicket, putTicketDescription, TicketConflictError } from '../api/azureTicketsApi';
import type { TicketDocument } from '../api/azureTicketTypes';

/**
 * Laedt die Beschreibung eines Tickets, haelt den Bearbeitungsstand und
 * speichert ihn - aufgebaut wie useWorkspaceDocument, mit denselben teuer
 * erarbeiteten Eigenschaften:
 *
 * - Debounce, damit nicht jeder Tastendruck schreibt.
 * - Sofortiges Speichern beim Verlassen und beim Ticketwechsel.
 * - Ein Konflikt (409) PAUSIERT das Speichern bis zum Neuladen, statt es in
 *   einer Schleife zu wiederholen.
 *
 * Zusaetzlich hier: originalRef haelt den geladenen Rohwert. Solange der
 * Entwurf damit identisch ist, gilt nichts als geaendert - Oeffnen ohne
 * Bearbeiten loest also keinen Schreibvorgang aus. Der Server prueft das
 * unabhaengig noch einmal (AzureTicketService.writeDescription), diese Ebene
 * spart nur den Aufruf.
 */
const SAVE_DEBOUNCE_MS = 1200;

export interface UseTicketDescription {
  doc: TicketDocument | null;
  description: string;
  loading: boolean;
  loadError: string | null;
  saveStatus: string;
  /** Die Datei wurde von aussen geaendert - Speichern ruht bis zum Neuladen. */
  conflict: string | null;
  hasUnsavedChanges: boolean;
  setDescription: (next: string) => void;
  reload: () => void;
  saveNow: () => Promise<void>;
}

export function useTicketDescription(
  category: string,
  ticketId: string | null,
): UseTicketDescription {
  const [doc, setDoc] = useState<TicketDocument | null>(null);
  const [description, setDescriptionState] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState('Bereit');
  const [conflict, setConflict] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Refs, weil save() sie liest: eine veraltete Closure waere hier ein
  // Korrektheitsfehler (dieselbe Begruendung wie in useWorkspaceDocument).
  const descriptionRef = useRef(description);
  const originalRef = useRef('');
  const docRef = useRef<TicketDocument | null>(null);
  const dirtyRef = useRef(false);
  const conflictRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  descriptionRef.current = description;
  docRef.current = doc;
  dirtyRef.current = dirty;
  conflictRef.current = conflict;

  useEffect(() => {
    let cancelled = false;
    if (!ticketId) {
      setDoc(null);
      setDescriptionState('');
      originalRef.current = '';
      setDirty(false);
      setConflict(null);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setConflict(null);
    setDirty(false);
    getTicket(category, ticketId)
      .then((loaded) => {
        if (cancelled) return;
        setDoc(loaded);
        setDescriptionState(loaded.description);
        originalRef.current = loaded.description;
        setSaveStatus('Bereit');
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDoc(null);
        setLoadError('Konnte das Ticket nicht laden.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, ticketId, reloadToken]);

  const save = useCallback(async () => {
    const current = docRef.current;
    if (!current || !dirtyRef.current || conflictRef.current) return;
    setSaveStatus('speichert…');
    try {
      const result = await putTicketDescription(
        category,
        current.id,
        descriptionRef.current,
        current.revision,
        current.dialect,
      );
      originalRef.current = descriptionRef.current;
      setDirty(false);
      setDoc({ ...current, description: descriptionRef.current, revision: result.revision });
      setSaveStatus(
        result.changed
          ? 'Gespeichert ' + new Date().toLocaleTimeString()
          : 'Unveraendert - nichts zu speichern',
      );
    } catch (err) {
      if (err instanceof TicketConflictError) {
        // Absichtlich dirty lassen: die Aenderung steht in der Oberflaeche,
        // wurde aber nicht geschrieben. Weiterversuche waeren zwecklos, bis
        // der Nutzer neu geladen hat.
        setConflict(err.message);
        setSaveStatus('Nicht gespeichert');
        return;
      }
      setSaveStatus('Fehler beim Speichern');
    }
  }, [category]);

  const setDescription = useCallback(
    (next: string) => {
      setDescriptionState(next);
      // Gegen den geladenen Rohwert vergleichen, nicht gegen den letzten
      // Entwurf: tippt jemand ein Zeichen und loescht es wieder, ist das
      // keine Aenderung.
      const changed = next !== originalRef.current;
      setDirty(changed);
      if (!changed || conflictRef.current) return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void save();
      }, SAVE_DEBOUNCE_MS);
    },
    [save],
  );

  // Beim Ticketwechsel und beim Verlassen der Ansicht sofort sichern.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      void save();
    };
  }, [save, ticketId]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void save();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [save]);

  const reload = useCallback(() => {
    setConflict(null);
    setReloadToken((n) => n + 1);
  }, []);

  return {
    doc,
    description,
    loading,
    loadError,
    saveStatus,
    conflict,
    hasUnsavedChanges: dirty,
    setDescription,
    reload,
    saveNow: save,
  };
}
