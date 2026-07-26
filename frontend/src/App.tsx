import { useEffect, useMemo, useState } from 'react';
import { Editor } from './components/Editor';
import { LineHint } from './components/LineHint';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import { useNote } from './hooks/useNote';
import { useValidation } from './hooks/useValidation';
import { currentLineIndex } from './utils/lines';

export function App() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const note = useNote(today);
  const [activeLineIndex, setActiveLineIndex] = useState(0);

  const validation = useValidation(note.content, activeLineIndex);

  const updateActiveLineIndex = () => {
    const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
    if (editor) {
      setActiveLineIndex(currentLineIndex(editor.value, editor.selectionStart));
    }
    validation.refreshHint();
  };

  const handleChange = (next: string) => {
    note.setContent(next);
    validation.scheduleValidate();
    const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
    if (editor) {
      setActiveLineIndex(currentLineIndex(next, editor.selectionStart));
    }
  };

  // Hilfe-Kuerzel bewusst auf document statt nur editor: soll auch
  // reagieren, wenn der Fokus kurz nicht im Textarea liegt.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === '.') {
        e.preventDefault();
        validation.showHelp();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [validation]);

  return (
    <>
      <TopBar date={today} />
      <main className="editor-wrap">
        <Editor
          content={note.content}
          onChange={handleChange}
          validations={validation.results}
          activeLineIndex={activeLineIndex}
          onActiveLineChange={updateActiveLineIndex}
          onSaveNow={note.saveNow}
          onIngestHint={validation.showIngestMessage}
        />
        <LineHint text={validation.hintText} />
      </main>
      <StatusBar saveStatus={note.saveStatus} lineCount={note.lineCount} />
    </>
  );
}

export default App;
