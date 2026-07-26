import { useCallback, useEffect, useRef, useState } from 'react';
import { getNote, saveNote } from '../api/notesApi';
import { useDebouncedCallback } from './useDebouncedCallback';

export function useNote(date: string) {
  const [content, setContentState] = useState('');
  const [saveStatus, setSaveStatus] = useState('Bereit');

  const dirtyRef = useRef(false);
  const contentRef = useRef(content);
  contentRef.current = content;

  const doSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    setSaveStatus('speichert…');
    try {
      await saveNote(date, contentRef.current);
      dirtyRef.current = false;
      setSaveStatus('Gespeichert ' + new Date().toLocaleTimeString());
    } catch (err) {
      setSaveStatus(
        err instanceof TypeError
          ? 'Fehler beim Speichern (offline?)'
          : 'Fehler beim Speichern',
      );
    }
  }, [date]);

  const scheduleSave = useDebouncedCallback(doSave, 800);

  const setContent = useCallback(
    (next: string) => {
      setContentState(next);
      dirtyRef.current = true;
      setSaveStatus('Ungespeicherte Aenderungen…');
      scheduleSave();
    },
    [scheduleSave],
  );

  useEffect(() => {
    const id = window.setInterval(doSave, 30000);
    return () => window.clearInterval(id);
  }, [doSave]);

  useEffect(() => {
    getNote(date)
      .then((data) => {
        setContentState(data.content || '');
        dirtyRef.current = false;
      })
      .catch(() => setSaveStatus('Konnte Notizen nicht laden'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return {
    content,
    setContent,
    saveStatus,
    saveNow: doSave,
    lineCount: content.split('\n').length,
  };
}
