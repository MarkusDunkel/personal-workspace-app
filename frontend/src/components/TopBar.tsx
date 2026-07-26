interface TopBarProps {
  date: string;
}

export function TopBar({ date }: TopBarProps) {
  return (
    <header className="topbar">
      <span className="date" id="current-date">
        {date}
      </span>
      <span className="hint">Strg+. Hilfe · Strg+S Speichern · Strg+Shift+Enter Ingest</span>
    </header>
  );
}
