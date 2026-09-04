import { useCallback, useRef, useState } from 'react';
import { StatusBar } from './components/StatusBar';
import type { TableStatus } from './components/StatusBar';
import { NoteSection } from './components/NoteSection';
import { ArchiveNoteSection } from './components/ArchiveNoteSection';
import { TopBar } from './components/TopBar';
import type { AppView } from './components/TopBar';
import { AzureBoardsView } from './components/AzureBoardsView';
import { useContacts } from './hooks/useContacts';
import { useProjekte } from './hooks/useProjekte';
import { useMeetings } from './hooks/useMeetings';
import { useNoteTableDefinitions } from './hooks/useNoteTableDefinitions';
import { useArchiveFiles } from './hooks/useArchiveFiles';

const HINT = 'Pfeile/Tab navigieren · Eingabe neue Zeile · Entf leert Zelle · Esc abbrechen';

/**
 * "2026-08-21T06-57-51Z" (Format aus run_pseudonymize.sh) -> "21.08.2026 06:57".
 * Der Zeitstempel ist UTC; angezeigt wird er unveraendert, damit er zum
 * Dateinamen passt und nicht je nach Sommerzeit springt.
 */
function formatArchiveTimestamp(timestamp: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-\d{2}Z$/.exec(timestamp);
  if (!match) return timestamp;
  const [, year, month, day, hour, minute] = match;
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

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
  const projekte = useProjekte(reloadToken);
  const meetings = useMeetings(reloadToken);

  const [currentProjekt, setCurrentProjekt] = useState('');
  const [currentMeeting, setCurrentMeeting] = useState('');

  const notes = definitions?.find((d) => d.id === 'notes');
  const archiveFiles = useArchiveFiles(reloadToken);

  // Welche abgelegten Notizen aufgeklappt sind. Eingeklappte Sektionen werden
  // gar nicht gerendert - sonst laedt jede beim Seitenaufruf ihre Datei und
  // startet ein eigenes Autosave-Intervall, obwohl sie nicht sichtbar ist.
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());

  // Die Kopfzeilen der Archiv-Sektionen, in Anzeigereihenfolge: Enter/Tab am
  // unteren Ende einer Tabelle gibt den Fokus an die naechste weiter.
  const summaryRefs = useRef<Map<string, HTMLElement>>(new Map());

  const focusArchiveSummary = useCallback((index: number) => {
    const target = archiveFiles[index];
    if (target) summaryRefs.current.get(target.fileName)?.focus();
  }, [archiveFiles]);

  const toggleArchiveFile = useCallback((fileName: string) => {
    setOpenFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
  }, []);

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
      />
      {view === 'notes' ? (
        <main className="tables-wrap">
          {notes ? (
            <>
              <NoteSection
                definition={notes}
                contacts={contacts}
                projekte={projekte}
                meetings={meetings}
                currentProjekt={currentProjekt}
                currentMeeting={currentMeeting}
                reloadToken={reloadToken}
                onStatusChange={handleNotesStatusChange}
                onLeaveBottom={() => focusArchiveSummary(0)}
              />
              {/* Bewusst ein Button statt <details>/<summary>: bei <details>
                  fuehrt der Browser den open-Zustand selbst, waehrend das
                  Rendern der Sektion an openFiles haengt. Beide Zustaende
                  liefen dadurch auseinander (Symptom: der erste Klick oeffnete
                  nicht, der zweite schon, der dritte schloss nicht). Ein
                  Button hat nur EINE Quelle der Wahrheit - openFiles. */}
              {archiveFiles.map((file, index) => {
                const isOpen = openFiles.has(file.fileName);
                return (
                  <section key={file.fileName} className="archive-details">
                    <button
                      type="button"
                      className="archive-summary"
                      aria-expanded={isOpen}
                      ref={(el) => {
                        if (el) summaryRefs.current.set(file.fileName, el);
                        else summaryRefs.current.delete(file.fileName);
                      }}
                      // onMouseDown statt onClick - aus demselben Grund wie
                      // bei den Zellen in DataGrid (siehe Kommentar dort):
                      // der Klick auf diesen Button laesst die zuvor
                      // fokussierte Zelle neu rendern, wodurch das
                      // Klick-Ziel zwischen mousedown und mouseup im DOM
                      // ersetzt wird. Der Browser findet dann kein
                      // gemeinsames Element mehr und liefert "click" an einen
                      // stabilen Vorfahren (.tables-wrap) - dieser Handler
                      // feuerte nie (Symptom: der erste Klick auf eine
                      // Kopfzeile tat nichts, erst der zweite oeffnete).
                      onMouseDown={() => toggleArchiveFile(file.fileName)}
                      // Enter/Leertaste erzeugen nur ein click-, kein
                      // mousedown-Event - der Tastaturweg braucht daher einen
                      // eigenen Handler. preventDefault verhindert, dass der
                      // Browser daraus zusaetzlich einen Klick synthetisiert.
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleArchiveFile(file.fileName);
                        }
                      }}
                    >
                      <span className="archive-caret" aria-hidden="true">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      Notizen {formatArchiveTimestamp(file.timestamp)} · {file.rowCount}{' '}
                      {file.rowCount === 1 ? 'Zeile' : 'Zeilen'}
                    </button>
                    {isOpen && (
                      <ArchiveNoteSection
                        definition={notes}
                        fileName={file.fileName}
                        contacts={contacts}
                        onLeaveBottom={() => focusArchiveSummary(index + 1)}
                      />
                    )}
                  </section>
                );
              })}
            </>
          ) : (
            <p className="loading-hint">Lade Notizen…</p>
          )}
        </main>
      ) : (
        <AzureBoardsView />
      )}
      {view === 'notes' && <StatusBar tables={Object.values(statusById)} hint={HINT} />}
    </>
  );
}

export default App;
