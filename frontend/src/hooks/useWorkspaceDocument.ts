import { useCallback, useEffect, useRef, useState } from 'react';
import { getWorkspace, putWorkspace, WorkspaceConflictError } from '../api/workspacesApi';
import { useDebouncedCallback } from './useDebouncedCallback';

/**
 * Laedt ein Workspace-Dokument, haelt den Bearbeitungsstand und speichert
 * automatisch.
 *
 * Debounce 1200 ms statt der 800 ms aus useMergedNoteData: dort wird eine
 * einzelne Zelle geschrieben, hier jedes Mal das GANZE Dokument. Ein
 * Kommentar ist ausserdem eine abgeschlossene, bewusste Handlung - etwas
 * mehr Ruhe kostet nichts und spart Schreibvorgaenge.
 *
 * Zusaetzlich SOFORT (ohne Debounce) gespeichert wird beim Wechsel des
 * Dokuments, beim Verlassen der Ansicht und wenn das Fenster in den
 * Hintergrund geht - billige Absicherung fuer "Laptop nach dem Meeting
 * zugeklappt". Bewusst KEIN beforeunload: das kann ein asynchrones fetch
 * nicht zuverlaessig abwarten und erzeugt einen Browser-Dialog.
 */
const SAVE_DEBOUNCE_MS = 1200;
const SAVE_FALLBACK_MS = 30000;

export interface UseWorkspaceDocument {
  markdown: string;
  loading: boolean;
  /** Ladefehler (nicht Speicherfehler). */
  loadError: string | null;
  saveStatus: string;
  /** Die Datei wurde von aussen geaendert - Speichern ruht bis zum Neuladen. */
  conflict: string | null;
  hasUnsavedChanges: boolean;
  setMarkdown: (next: string) => void;
  /** Verwirft die lokalen Aenderungen und laedt neu (Konfliktausweg). */
  reload: () => void;
  saveNow: () => Promise<void>;
}

export function useWorkspaceDocument(name: string | null): UseWorkspaceDocument {
  const [markdown, setMarkdownState] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState('Bereit');
  const [conflict, setConflict] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Refs, weil doSave sie liest: eine veraltete Closure waere hier ein
  // Korrektheitsfehler (dieselbe Begruendung wie bei dirtyRef in
  // useMergedNoteData).
  const markdownRef = useRef(markdown);
  markdownRef.current = markdown;
  const revisionRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const nameRef = useRef(name);
  nameRef.current = name;
  const conflictRef = useRef<string | null>(null);
  conflictRef.current = conflict;

  const doSave = useCallback(async () => {
    const current = nameRef.current;
    if (!current || !dirtyRef.current) return;
    // Nach einem Konflikt ruht das Speichern, bis der Nutzer neu geladen hat -
    // sonst liefe jeder Debounce-Tick in denselben 409.
    if (conflictRef.current) return;

    setSaveStatus('speichert…');
    try {
      await putWorkspace(current, markdownRef.current, revisionRef.current);
      dirtyRef.current = false;
      setDirty(false);
      setSaveStatus('Gespeichert ' + new Date().toLocaleTimeString());
      // Die Revision ist nach dem Schreiben veraltet. Statt sie zu erraten,
      // wird sie beim naechsten Speichern ohne Pruefung geschickt (null) -
      // die App hat gerade selbst geschrieben, ein Konflikt kann nur durch
      // eine Aenderung DANACH entstehen, und die faellt beim naechsten
      // Neuladen auf.
      revisionRef.current = null;
    } catch (err) {
      if (err instanceof WorkspaceConflictError) {
        // Absichtlich dirty bleiben: die Aenderung steht in der Oberflaeche,
        // wurde aber nicht geschrieben.
        setConflict(err.message);
        setSaveStatus('Nicht gespeichert – Konflikt');
        return;
      }
      setSaveStatus(
        err instanceof TypeError ? 'Fehler beim Speichern (offline?)' : 'Fehler beim Speichern',
      );
    }
  }, []);

  const scheduleSave = useDebouncedCallback(doSave, SAVE_DEBOUNCE_MS);

  const setMarkdown = useCallback(
    (next: string) => {
      // Nur echte Aenderungen zaehlen. Ein Moduswechsel ohne Textaenderung
      // darf das Dokument nicht als geaendert markieren - genau dieser Fehler
      // (Anklicken = Aenderung) ist in der Notizansicht schon einmal
      // aufgetreten.
      if (next === markdownRef.current) return;
      markdownRef.current = next;
      setMarkdownState(next);
      dirtyRef.current = true;
      setDirty(true);
      setSaveStatus('Ungespeicherte Änderungen…');
      scheduleSave();
    },
    [scheduleSave],
  );

  // Laden - auch erneut nach einem Konflikt (reloadToken).
  useEffect(() => {
    if (!name) {
      setMarkdownState('');
      markdownRef.current = '';
      revisionRef.current = null;
      dirtyRef.current = false;
      setDirty(false);
      setConflict(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getWorkspace(name)
      .then((doc) => {
        if (cancelled) return;
        setMarkdownState(doc.markdown);
        markdownRef.current = doc.markdown;
        revisionRef.current = doc.revision;
        dirtyRef.current = false;
        setDirty(false);
        setConflict(null);
        setSaveStatus('Bereit');
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(`Konnte „${name}" nicht laden.`);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, reloadToken]);

  // Rueckfall-Intervall, wie in useMergedNoteData.
  useEffect(() => {
    const id = window.setInterval(doSave, SAVE_FALLBACK_MS);
    return () => window.clearInterval(id);
  }, [doSave]);

  // Sofort speichern, wenn das Fenster in den Hintergrund geht.
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === 'hidden') void doSave();
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [doSave]);

  // Sofort speichern, wenn das Dokument gewechselt oder die Ansicht
  // verlassen wird. Der Effect-Cleanup laeuft genau dann - und liest den
  // Stand aus den Refs, die zu diesem Zeitpunkt noch das alte Dokument
  // halten.
  useEffect(() => {
    return () => {
      if (dirtyRef.current && !conflictRef.current) void doSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const reload = useCallback(() => {
    dirtyRef.current = false;
    setDirty(false);
    setConflict(null);
    setReloadToken((n) => n + 1);
  }, []);

  return {
    markdown,
    loading,
    loadError,
    saveStatus,
    conflict,
    hasUnsavedChanges: dirty,
    setMarkdown,
    reload,
    saveNow: doSave,
  };
}
