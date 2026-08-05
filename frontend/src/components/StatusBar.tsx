export interface TableStatus {
  label: string;
  saveStatus: string;
  rowCount: number;
}

interface StatusBarProps {
  tables: TableStatus[];
  hint: string;
}

export function StatusBar({ tables, hint }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="statusbar-tables">
        {tables.map((t) => (
          <span key={t.label} className="statusbar-table">
            {t.label}: {t.saveStatus} · {t.rowCount} Zeilen
          </span>
        ))}
      </span>
      <span className="hint">{hint}</span>
      <span className="statusbar-spacer" />
    </footer>
  );
}
