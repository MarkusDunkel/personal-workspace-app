import { LabeledAutocompleteInput } from './LabeledAutocompleteInput';
import { SubmitFlow } from './submit/SubmitFlow';

interface TopBarProps {
  onSubmitSuccess: () => void;
  currentProjekt: string;
  currentMeeting: string;
  onProjektCommit: (value: string) => void;
  onMeetingCommit: (value: string) => void;
  projekte: string[];
  meetings: string[];
}

export function TopBar({
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
    </header>
  );
}
