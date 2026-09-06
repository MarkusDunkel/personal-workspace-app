import { useCallback, useState } from 'react';
import { StatusBar } from './components/StatusBar';
import type { TableStatus } from './components/StatusBar';
import { NoteSection } from './components/NoteSection';
import { TopBar } from './components/TopBar';
import type { AppView } from './components/TopBar';
import { AzureBoardsView } from './components/AzureBoardsView';
import { WorkspacesView } from './components/WorkspacesView';
import { useContacts } from './hooks/useContacts';
import { usePersonRegister } from './hooks/usePersonRegister';
import { useProjekte } from './hooks/useProjekte';
import { useMeetings } from './hooks/useMeetings';
import { useNoteTableDefinitions } from './hooks/useNoteTableDefinitions';
import { useWorkspaces } from './hooks/useWorkspaces';

const HINT = 'Pfeile/Tab navigieren · Strg+Enter neue Zeile · Entf leert Zelle · Esc abbrechen';

export function App() {
  const [view, setView] = useState<AppView>('notes');
  const { definitions } = useNoteTableDefinitions();
  const [statusById, setStatusById] = useState<Record<string, TableStatus>>({});
  // Wird nach erfolgreichem Absenden hochgezaehlt, um useNoteTableData und
  // die drei Vorschlagslisten zu einem erneuten Ladevorgang zu zwingen (die
  // Notizen-Quelle wurde serverseitig geleert, die Listen ggf. durch die
  // Reconciliation veraendert - siehe NoteSubmitService.applyDecisions).
  const [reloadToken, setReloadToken] = useState(0);
  const contacts = useContacts(reloadToken);
  // Pseudonym -> Klarname, nur fuer die ANZEIGE in den Workspaces (siehe
  // MarkdownView.splitPseudonyms). Haengt am selben reloadToken: nach dem
  // Absenden kann eine neue Person ins Register aufgenommen worden sein.
  const personNames = usePersonRegister(reloadToken);
  const projekte = useProjekte(reloadToken);
  const meetings = useMeetings(reloadToken);

  const [currentProjekt, setCurrentProjekt] = useState('');
  const [currentMeeting, setCurrentMeeting] = useState('');

  const notes = definitions?.find((d) => d.id === 'notes');

  // Die Workspace-Liste liegt hier, weil die TopBar sie fuer ihr Aufklappmenue
  // braucht und die Workspaces-Ansicht denselben Stand sehen muss - dieselbe
  // Aufteilung wie bei projekte/meetings.
  const { workspaces, loaded: workspacesLoaded } = useWorkspaces();
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);

  const handleStatusChange = useCallback((tableId: string, status: TableStatus) => {
    setStatusById((prev) => ({ ...prev, [tableId]: status }));
  }, []);

  const handleNotesStatusChange = useCallback(
    (status: TableStatus) => {
      if (notes) handleStatusChange(notes.id, status);
    },
    [notes, handleStatusChange],
  );

  const handleSubmitSuccess = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  return (
    <>
      <TopBar
        view={view}
        onViewChange={setView}
        onSubmitSuccess={handleSubmitSuccess}
        currentProjekt={currentProjekt}
        currentMeeting={currentMeeting}
        onProjektCommit={setCurrentProjekt}
        onMeetingCommit={setCurrentMeeting}
        projekte={projekte}
        meetings={meetings}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onWorkspaceSelect={setActiveWorkspace}
      />
      {/* Bewusst eine Kette EXPLIZITER Zweige und kein Ternary mit Else-Fall:
          der frueher hier stehende Else-Zweig rendete AzureBoardsView,
          wodurch jeder neu hinzugefuegte AppView-Wert stillschweigend Azure
          Boards zeigte, statt sichtbar zu fehlen. */}
      {view === 'notes' && (
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
              onStatusChange={handleNotesStatusChange}
            />
          ) : (
            <p className="loading-hint">Lade Notizen…</p>
          )}
        </main>
      )}
      {view === 'azureBoards' && <AzureBoardsView />}
      {view === 'workspaces' && (
        <WorkspacesView
          workspaces={workspaces}
          workspacesLoaded={workspacesLoaded}
          activeWorkspace={activeWorkspace}
          contacts={contacts}
          personNames={personNames}
        />
      )}
      {view === 'notes' && <StatusBar tables={Object.values(statusById)} hint={HINT} />}
    </>
  );
}

export default App;
