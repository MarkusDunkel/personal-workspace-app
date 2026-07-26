export interface TableStatus {
  label: string;
  saveStatus: string;
  rowCount: number;
}

interface StatusBarProps {
  tables: TableStatus[];
}

export function StatusBar({ tables }: StatusBarProps) {
  return (
    <footer className="statusbar">
      {tables.map((t) => (
        <span key={t.label} className="statusbar-table">
          {t.label}: {t.saveStatus} · {t.rowCount} Zeilen
        </span>
      ))}
    </footer>
  );
}
