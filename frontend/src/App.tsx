import { useCallback, useState } from 'react';
import { SplitPane } from './components/SplitPane';
import { StatusBar } from './components/StatusBar';
import type { TableStatus } from './components/StatusBar';
import { NoteSection } from './components/NoteSection';
import { TopBar } from './components/TopBar';
import { useContacts } from './hooks/useContacts';
import { useNoteTableDefinitions } from './hooks/useNoteTableDefinitions';

export function App() {
  const { definitions } = useNoteTableDefinitions();
  const contacts = useContacts();
  const [statusById, setStatusById] = useState<Record<string, TableStatus>>({});

  const aufgabe = definitions?.find((d) => d.id === 'aufgabe');
  const info = definitions?.find((d) => d.id === 'info');

  const handleStatusChange = useCallback((tableId: string, status: TableStatus) => {
    setStatusById((prev) => ({ ...prev, [tableId]: status }));
  }, []);

  return (
    <>
      <TopBar />
      <main className="tables-wrap">
        {aufgabe && info ? (
          <SplitPane
            storageKey="split-pane-width"
            left={
              <NoteSection
                definition={aufgabe}
                contacts={contacts}
                onStatusChange={(status) => handleStatusChange(aufgabe.id, status)}
              />
            }
            right={
              <NoteSection
                definition={info}
                contacts={contacts}
                onStatusChange={(status) => handleStatusChange(info.id, status)}
              />
            }
          />
        ) : (
          <p className="loading-hint">Lade Notizen…</p>
        )}
      </main>
      <StatusBar tables={Object.values(statusById)} />
    </>
  );
}

export default App;
