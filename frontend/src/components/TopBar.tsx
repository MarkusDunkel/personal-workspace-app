import type { ViewId, ViewInfo } from '../api/viewsTypes';
import type { WorkspaceInfo } from '../api/workspaceTypes';
import { LabeledAutocompleteInput } from './LabeledAutocompleteInput';
import { SubmitFlow } from './submit/SubmitFlow';
import { TopBarMenuDropdown } from './TopBarMenuDropdown';

export type AppView = 'notes' | 'azureBoards' | 'workspaces' | 'views';

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
  workspaces: WorkspaceInfo[];
  activeWorkspace: string | null;
  onWorkspaceSelect: (name: string) => void;
  views: ViewInfo[];
  activeView: ViewId | null;
  onViewSelect: (id: ViewId) => void;
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
  workspaces,
  activeWorkspace,
  onWorkspaceSelect,
  views,
  activeView,
  onViewSelect,
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
        {/* Workspaces sind mehrere Dokumente, daher ein aufklappbarer
            Menuepunkt statt einer einfachen Schaltflaeche. Angelegt und
            aufgeloest werden sie ausserhalb der App (VS Code) - hier wird nur
            ausgewaehlt und bearbeitet. */}
        <TopBarMenuDropdown
          label="Workspaces"
          active={view === 'workspaces'}
          items={workspaces.map((w) => ({ id: w.name, label: w.title }))}
          selectedId={activeWorkspace}
          onSelect={onWorkspaceSelect}
          onActivate={() => onViewChange('workspaces')}
          emptyLabel="Keine Workspaces in 2_ai-ready/workspaces"
        />
        {/* Wie bei den Workspaces ein aufklappbarer Menuepunkt statt drei
            weiterer Schaltflaechen: es sind mehrere Dokumente mit bleibender
            Auswahl, und die Topbar bliebe sonst sehr breit. Erzeugt werden
            die Ansichten von den ai-vault-Skripten - hier wird nur
            ausgewaehlt, angesehen und neu erzeugt. */}
        <TopBarMenuDropdown
          label="Ansichten"
          active={view === 'views'}
          items={views.map((v) => ({ id: v.id, label: v.label }))}
          selectedId={activeView}
          onSelect={(id) => onViewSelect(id as ViewId)}
          onActivate={() => onViewChange('views')}
          emptyLabel="Keine Ansichten in 5_output"
        />
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
