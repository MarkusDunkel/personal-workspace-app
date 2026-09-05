import type { ColumnDefinition, TableDefinition } from '../api/noteTypes';
import type { UseNoteViewFilters } from '../hooks/useNoteViewFilters';
import { isTypExclusive, unionColumns } from '../utils/noteSort';
import { ColumnFilterMenu } from './ColumnFilterMenu';

interface NoteFilterBarProps {
  definition: TableDefinition;
  /**
   * Die Vorschlagslisten fuer Projekt/Meeting kommen NICHT hier herein:
   * useNoteViewFilters vereinigt sie bereits mit den in den Daten
   * vorkommenden Werten und liefert sie ueber availableValues.
   */
  filters: UseNoteViewFilters;
  /** Wie viele Zeilen von wie vielen gerade sichtbar sind. */
  visibleCount: number;
  totalCount: number;
}

/**
 * Sortier- und Filterbedienelemente ueber der Tabelle.
 *
 * Bewusst KEINE Kopfzeile ueber den Datenspalten: eine solche liesse sich
 * nicht ausrichten, weil die Zeilen je Typ unterschiedliche Spaltensaetze
 * haben (Aufgabe: typ/von/inhalt/bis/an, Info: typ/quelle/inhalt - "quelle"
 * sitzt optisch unter "von", die beiden richten sich nur zufaellig
 * gleichbreit aus). Eine echte Kopfzeile haette daher verlangt, jede Zeile
 * mit allen Spaltenplaetzen zu rendern und in Info-Zeilen leere Felder zu
 * zeigen - ein groesserer Eingriff in die Tabelle, als die Aufgabe wert ist.
 *
 * Der Zeilenaufbau bleibt deshalb unveraendert; alle Bedienelemente sitzen
 * hier. Die Klasse .note-filter-bar wird ausserdem vom focusin-Handler in
 * DataGrid geprueft (siehe Kommentar dort) - das Grid muss seine
 * Fokusmarkierung abgeben, solange hier gearbeitet wird.
 */
export function NoteFilterBar({
  definition,
  filters,
  visibleCount,
  totalCount,
}: NoteFilterBarProps) {
  const columns = unionColumns(definition);
  const sortable = columns.filter((c) => c.id !== 'inhalt');
  const filterable = columns.filter((c) => c.id !== 'inhalt');

  const typScope = filters.state.typScope;
  const scopeCause = typScope
    ? columns.find((c) => c.id === typScope.causedBy)?.label ?? typScope.causedBy
    : null;

  const sortLabel = (column: ColumnDefinition) => {
    const sort = filters.state.sort;
    if (sort?.columnId !== column.id) return '';
    return sort.direction === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="note-filter-bar">
      <div className="note-filter-row">
        <span className="note-filter-group-label">Sortieren</span>
        {sortable.map((column) => (
          <button
            key={column.id}
            type="button"
            className={`note-sort-button${
              filters.state.sort?.columnId === column.id ? ' active' : ''
            }`}
            title={
              isTypExclusive(definition, column.id)
                ? `Nach ${column.label} sortieren – beschränkt die Ansicht auf den passenden Typ`
                : `Nach ${column.label} sortieren`
            }
            onClick={() => filters.toggleSort(column.id)}
          >
            {column.label}
            {sortLabel(column)}
          </button>
        ))}
        <span className="note-filter-count">
          {visibleCount === totalCount
            ? `${totalCount} ${totalCount === 1 ? 'Zeile' : 'Zeilen'}`
            : `${visibleCount} von ${totalCount} Zeilen`}
        </span>
        {filters.isActive && (
          <button type="button" className="note-filter-clear" onClick={filters.clearAll}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      <div className="note-filter-row">
        <span className="note-filter-group-label">Filtern</span>
        {filterable.map((column) => (
          <ColumnFilterMenu
            key={column.id}
            label={column.label}
            options={filters.availableValues(column.id)}
            selected={filters.state.columnValues[column.id] ?? new Set()}
            onChange={(values) => filters.setColumnValues(column.id, values)}
          />
        ))}
        {/* Projekt und Meeting sind keine Grid-Spalten (sie stehen nur in den
            Zeilenfeldern darunter), lassen sich hier aber genauso filtern. */}
        <ColumnFilterMenu
          label="Projekt"
          options={filters.availableValues('projekt')}
          selected={filters.state.projekt}
          onChange={filters.setProjektValues}
        />
        <ColumnFilterMenu
          label="Meeting"
          options={filters.availableValues('meeting')}
          selected={filters.state.meeting}
          onChange={filters.setMeetingValues}
        />
        {typScope && (
          // Macht die automatische Typ-Einschraenkung sichtbar und in einem
          // Klick aufhebbar. Ohne diesen Hinweis waere nicht erkennbar,
          // warum Zeilen fehlen.
          <button
            type="button"
            className="note-filter-scope-chip"
            title={`Eingeschränkt auf ${typScope.typs.join(', ')}, weil nach „${scopeCause}“ sortiert oder gefiltert wird – klicken zum Aufheben`}
            onClick={filters.clearTypScope}
          >
            nur {typScope.typs.join(', ')} (wegen {scopeCause}) ×
          </button>
        )}
      </div>

      <p className="note-filter-hint">
        Strg+Enter legt oben eine neue Zeile an. Abgelegte Notizen sind
        bearbeitbar; ✎ markiert noch nicht übermittelte Zeilen.
      </p>
    </div>
  );
}
