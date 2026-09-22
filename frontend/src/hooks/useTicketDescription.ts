import { useCallback, useEffect, useRef, useState } from 'react';
import { getTicket, putTicketField, TicketConflictError } from '../api/azureTicketsApi';
import type { EditableField, TicketDocument } from '../api/azureTicketTypes';

/**
 * Laedt die bearbeitbaren Felder eines Tickets, haelt ihren Bearbeitungsstand
 * und speichert ihn - aufgebaut wie useWorkspaceDocument, mit denselben teuer
 * erarbeiteten Eigenschaften:
 *
 * - Debounce, damit nicht jeder Tastendruck schreibt.
 * - Sofortiges Speichern beim Verlassen und beim Ticketwechsel.
 * - Ein Konflikt (409) PAUSIERT das Speichern bis zum Neuladen, statt es in
 *   einer Schleife zu wiederholen.
 *
 * Zusaetzlich hier: originalsRef haelt die geladenen Rohwerte JE FELD. Solange
 * ein Entwurf damit identisch ist, gilt das Feld als unveraendert - Oeffnen
 * ohne Bearbeiten loest also keinen Schreibvorgang aus. Der Server prueft das
 * unabhaengig noch einmal (AzureTicketService.writeField), diese Ebene spart
 * nur den Aufruf.
 *
 * Gespeichert wird FELDWEISE, in einem Aufruf je geaendertem Feld. Ein
 * gemeinsamer Auftrag waere zwar sparsamer, wuerde aber die Zusage aufgeben,
 * dass ein Speichervorgang genau ein Feld beruehrt - und der Dialekt-Abgleich
 * gilt ohnehin je Feld. Die Aufrufe laufen deshalb NACHEINANDER: jeder
 * liefert eine neue Revision, die der naechste braucht.
 */
const SAVE_DEBOUNCE_MS = 1200;

export interface UseTicketDescription {
  doc: TicketDocument | null;
  /** Der aktuelle Entwurf je Feld, unter dem Feldnamen. */
  values: Record<string, string>;
  loading: boolean;
  loadError: string | null;
  saveStatus: string;
  /** Die Datei wurde von aussen geaendert - Speichern ruht bis zum Neuladen. */
  conflict: string | null;
  hasUnsavedChanges: boolean;
  setValue: (field: EditableField, next: string) => void;
  reload: () => void;
  saveNow: () => Promise<void>;
}

export function useTicketDescription(
  category: string,
  ticketId: string | null,
): UseTicketDescription {
  const [doc, setDoc] = useState<TicketDocument | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState('Bereit');
  const [conflict, setConflict] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Refs, weil save() sie liest: eine veraltete Closure waere hier ein
  // Korrektheitsfehler (dieselbe Begruendung wie in useWorkspaceDocument).
  const valuesRef = useRef(values);
  const originalsRef = useRef<Record<string, string>>({});
  const docRef = useRef<TicketDocument | null>(null);
  const dirtyRef = useRef(false);
  const conflictRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  valuesRef.current = values;
  docRef.current = doc;
  dirtyRef.current = dirty;
  conflictRef.current = conflict;

  useEffect(() => {
    let cancelled = false;
    if (!ticketId) {
      setDoc(null);
      setValues({});
      originalsRef.current = {};
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
        const loadedValues: Record<string, string> = {};
        for (const f of loaded.fields) loadedValues[f.field] = f.value;
        setDoc(loaded);
        setValues(loadedValues);
        originalsRef.current = { ...loadedValues };
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

    const changed = current.fields.filter(
      (f) => (valuesRef.current[f.field] ?? '') !== (originalsRef.current[f.field] ?? ''),
    );
    if (changed.length === 0) return;

    setSaveStatus('speichert…');
    // Jeder Schreibvorgang aendert die Datei und damit ihre Revision; der
    // naechste muss die neue mitbringen, sonst lehnt der Server ihn als
    // Fremdaenderung ab. Deshalb nacheinander und nicht parallel.
    let revision = current.revision;
    try {
      for (const field of changed) {
        const value = valuesRef.current[field.field] ?? '';
        const result = await putTicketField(
          category,
          current.id,
          field.field,
          value,
          revision,
          field.dialect,
        );
        revision = result.revision;
        originalsRef.current[field.field] = value;
      }
      setDirty(false);
      setDoc({ ...current, revision });
      setSaveStatus('Gespeichert ' + new Date().toLocaleTimeString());
    } catch (err) {
      // Was vor dem Fehler durchlief, ist geschrieben - originalsRef wurde
      // je Feld einzeln nachgezogen. Die Revision im Dokument muss deshalb
      // mitwandern, sonst scheiterte auch ein Wiederholungsversuch.
      setDoc({ ...current, revision });
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

  const setValue = useCallback(
    (field: EditableField, next: string) => {
      setValues((current) => {
        const updated = { ...current, [field]: next };
        valuesRef.current = updated;
        return updated;
      });
      // Gegen die geladenen Rohwerte vergleichen, nicht gegen den letzten
      // Entwurf: tippt jemand ein Zeichen und loescht es wieder, ist das
      // keine Aenderung. Geprueft ueber ALLE Felder - ein anderes kann
      // weiterhin offene Aenderungen tragen.
      const changed = Object.keys({ ...originalsRef.current, [field]: next }).some(
        (key) => (valuesRef.current[key] ?? '') !== (originalsRef.current[key] ?? ''),
      );
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
    values,
    loading,
    loadError,
    saveStatus,
    conflict,
    hasUnsavedChanges: dirty,
    setValue,
    reload,
    saveNow: save,
  };
}
