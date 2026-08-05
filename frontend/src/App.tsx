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
  // Wird nach erfolgreichem Absenden hochgezaehlt, um useNoteTableData zu
  // einem erneuten Ladevorgang zu zwingen (die Quelle wurde serverseitig
  // geleert, siehe NoteSubmitService.applyDecisions).
  const [reloadToken, setReloadToken] = useState(0);

  const notes = definitions?.find((d) => d.id === 'notes');

  const handleStatusChange = useCallback((tableId: string, status: TableStatus) => {
    setStatusById((prev) => ({ ...prev, [tableId]: status }));
  }, []);

  const handleSubmitSuccess = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  return (
    <>
      <TopBar onSubmitSuccess={handleSubmitSuccess} />
      <main className="tables-wrap">
        {notes ? (
          <NoteSection
            definition={notes}
            contacts={contacts}
            reloadToken={reloadToken}
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
