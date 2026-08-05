import { useCallback, useState } from 'react';
import { StatusBar } from './components/StatusBar';
import type { TableStatus } from './components/StatusBar';
import { NoteSection } from './components/NoteSection';
import { TopBar } from './components/TopBar';
import { useContacts } from './hooks/useContacts';
import { useProjekte } from './hooks/useProjekte';
import { useMeetings } from './hooks/useMeetings';
import { useNoteTableDefinitions } from './hooks/useNoteTableDefinitions';

const HINT = 'Pfeile/Tab navigieren · Eingabe neue Zeile · Entf leert Zelle · Esc abbrechen';

export function App() {
  const { definitions } = useNoteTableDefinitions();
  const [statusById, setStatusById] = useState<Record<string, TableStatus>>({});
  // Wird nach erfolgreichem Absenden hochgezaehlt, um useNoteTableData und
  // die drei Vorschlagslisten zu einem erneuten Ladevorgang zu zwingen (die
  // Notizen-Quelle wurde serverseitig geleert, die Listen ggf. durch die
  // Reconciliation veraendert - siehe NoteSubmitService.applyDecisions).
  const [reloadToken, setReloadToken] = useState(0);
  const contacts = useContacts(reloadToken);
  const projekte = useProjekte(reloadToken);
  const meetings = useMeetings(reloadToken);

  const [currentProjekt, setCurrentProjekt] = useState('');
  const [currentMeeting, setCurrentMeeting] = useState('');

  const notes = definitions?.find((d) => d.id === 'notes');

  const handleStatusChange = useCallback((tableId: string, status: TableStatus) => {
    setStatusById((prev) => ({ ...prev, [tableId]: status }));
  }, []);

  const handleSubmitSuccess = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  return (
    <>
      <TopBar
        onSubmitSuccess={handleSubmitSuccess}
        currentProjekt={currentProjekt}
        currentMeeting={currentMeeting}
        onProjektCommit={setCurrentProjekt}
        onMeetingCommit={setCurrentMeeting}
        projekte={projekte}
        meetings={meetings}
      />
      <main className="tables-wrap">
        {notes ? (
          <NoteSection
            definition={notes}
            contacts={contacts}
            projekte={projekte}
            meetings={meetings}
            currentProjekt={currentProjekt}
            currentMeeting={currentMeeting}
            reloadToken={reloadToken}
            onStatusChange={(status) => handleStatusChange(notes.id, status)}
          />
        ) : (
          <p className="loading-hint">Lade Notizen…</p>
        )}
      </main>
      <StatusBar tables={Object.values(statusById)} hint={HINT} />
    </>
  );
}

export default App;
