import { LabeledAutocompleteInput } from './LabeledAutocompleteInput';
import { SubmitFlow } from './submit/SubmitFlow';

export type AppView = 'notes' | 'azureBoards';

interface TopBarProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
  onSubmitSuccess: () => void;
  currentProjekt: string;
  currentMeeting: string;
  onProjektCommit: (value: string) => void;
  onMeetingCommit: (value: string) => void;
  projekte: string[];
  meetings: string[];
}

export function TopBar({
  view,
  onViewChange,
  onSubmitSuccess,
  currentProjekt,
  currentMeeting,
  onProjektCommit,
  onMeetingCommit,
  projekte,
  meetings,
}: TopBarProps) {
  return (
    <header className="topbar">
      <span className="title">Aufgaben &amp; Info</span>
      <nav className="topbar-menu">
        <button
          type="button"
          className={`topbar-menu-item${view === 'notes' ? ' active' : ''}`}
          onClick={() => onViewChange('notes')}
        >
          Notizen
        </button>
        <button
          type="button"
          className={`topbar-menu-item${view === 'azureBoards' ? ' active' : ''}`}
          onClick={() => onViewChange('azureBoards')}
        >
          Azure Boards
        </button>
      </nav>
      {view === 'notes' && (
        <>
          <div className="topbar-fields">
            <LabeledAutocompleteInput
              label="Projekt"
              value={currentProjekt}
              onCommit={onProjektCommit}
              suggestions={projekte}
              allowFreeText
            />
            <LabeledAutocompleteInput
              label="Meeting"
              value={currentMeeting}
              onCommit={onMeetingCommit}
              suggestions={meetings}
              allowFreeText
            />
          </div>
          <SubmitFlow onSubmitSuccess={onSubmitSuccess} />
        </>
      )}
    </header>
  );
}
