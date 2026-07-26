import { useCallback, useEffect, useRef, useState } from 'react';
import { validateNote } from '../api/notesApi';
import type { LineValidation } from '../api/types';
import { useDebouncedCallback } from './useDebouncedCallback';

const HELP_DISPLAY_MS = 4000;
const HELP_TEXT =
  'Praefixe: t: td: tm: d: r: risk: blk: nx: | f: p: proj: @ # -> !';

export function useValidation(content: string, activeLineIndex: number) {
  const [results, setResults] = useState<LineValidation[]>([]);
  const [hintText, setHintText] = useState('');
  const helpShownAtRef = useRef(0);
  const contentRef = useRef(content);
  contentRef.current = content;
  const activeLineRef = useRef(activeLineIndex);
  activeLineRef.current = activeLineIndex;

  const updateHint = useCallback((validations: LineValidation[]) => {
    if (Date.now() - helpShownAtRef.current < HELP_DISPLAY_MS) {
      return;
    }
    const idx = activeLineRef.current;
    const validation = validations.find((v) => v.lineIndex === idx);
    if (!validation) {
      setHintText('');
    } else if (validation.error) {
      setHintText('Fehler: ' + validation.error);
    } else if (validation.warnings && validation.warnings.length > 0) {
      setHintText('Hinweis: ' + validation.warnings.map((w) => w.message).join(' / '));
    } else {
      setHintText('');
    }
  }, []);

  const doValidate = useCallback(async () => {
    try {
      const validations = await validateNote(contentRef.current);
      setResults(validations);
      updateHint(validations);
    } catch {
      // Validierung ist best-effort, kein Blocker
    }
  }, [updateHint]);

  const scheduleValidate = useDebouncedCallback(doValidate, 400);

  const showHelp = useCallback(() => {
    helpShownAtRef.current = Date.now();
    setHintText(HELP_TEXT);
  }, []);

  const showIngestMessage = useCallback(() => {
    setHintText('Ingest-Lauf: bitte ueber das Pipeline-Dashboard oder run_ingest.sh starten.');
  }, []);

  const refreshHint = useCallback(() => {
    updateHint(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, updateHint]);

  // Initiale Validierung beim Laden (mirrors editor.js: validate() nach dem ersten Laden)
  useEffect(() => {
    doValidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { results, hintText, scheduleValidate, showHelp, showIngestMessage, refreshHint };
}
