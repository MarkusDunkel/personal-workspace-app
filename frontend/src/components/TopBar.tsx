import { SubmitFlow } from './submit/SubmitFlow';

interface TopBarProps {
  onSubmitSuccess: () => void;
}

export function TopBar({ onSubmitSuccess }: TopBarProps) {
  return (
    <header className="topbar">
      <span className="title">Aufgaben &amp; Info</span>
      <span className="hint">Pfeile/Tab navigieren · Eingabe neue Zeile · Entf leert Zelle · Esc abbrechen</span>
      <SubmitFlow onSubmitSuccess={onSubmitSuccess} />
    </header>
  );
}
