import { useCallback, useState } from 'react';
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

  const notes = definitions?.find((d) => d.id === 'notes');

  const handleStatusChange = useCallback((tableId: string, status: TableStatus) => {
    setStatusById((prev) => ({ ...prev, [tableId]: status }));
  }, []);

  return (
    <>
      <TopBar />
      <main className="tables-wrap">
        {notes ? (
          <NoteSection
            definition={notes}
            contacts={contacts}
            onStatusChange={(status) => handleStatusChange(notes.id, status)}
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
