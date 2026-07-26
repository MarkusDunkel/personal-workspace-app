import { useCallback, useState } from 'react';
import { SplitPane } from './components/SplitPane';
import { StatusBar } from './components/StatusBar';
import type { TableStatus } from './components/StatusBar';
import { TableSection } from './components/TableSection';
import { TopBar } from './components/TopBar';
import { useContacts } from './hooks/useContacts';
import { useTableDefinitions } from './hooks/useTableDefinitions';

export function App() {
  const { definitions } = useTableDefinitions();
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
              <TableSection
                definition={aufgabe}
                contacts={contacts}
                onStatusChange={(status) => handleStatusChange(aufgabe.id, status)}
              />
            }
            right={
              <TableSection
                definition={info}
                contacts={contacts}
                onStatusChange={(status) => handleStatusChange(info.id, status)}
              />
            }
          />
        ) : (
          <p className="loading-hint">Lade Tabellen…</p>
        )}
      </main>
      <StatusBar tables={Object.values(statusById)} />
    </>
  );
}

export default App;
