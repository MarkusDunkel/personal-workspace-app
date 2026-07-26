interface StatusBarProps {
  saveStatus: string;
  lineCount: number;
}

export function StatusBar({ saveStatus, lineCount }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span id="save-status">{saveStatus}</span>
      <span id="line-count">{lineCount} Zeilen</span>
    </footer>
  );
}
