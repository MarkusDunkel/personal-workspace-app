import type { ColumnDefinition, RowOrigin, TableDefinition, TableRow } from '../api/noteTypes';

/**
 * Reine Funktionen fuer Herkunft, Sortierung und Typ-Zugehoerigkeit der
 * Notiz-Spalten. Bewusst ohne React: die gesamte Logik, die sich lohnt
 * einzeln zu pruefen, sitzt hier.
 */

// ---------------------------------------------------------------------------
// Herkunft
// ---------------------------------------------------------------------------

/**
 * Stabiler Schluessel je Herkunftsdatei - Grundlage der dirty-Verfolgung und
 * des Save-Fan-outs. Der Doppelpunkt ist als Trenner sicher: 'live' enthaelt
 * keinen, und Archiv-Dateinamen sind auf notes-<YYYY-MM-DDTHH-MM-SSZ>.json
 * beschraenkt (siehe NoteArchiveService.FILE_NAME), also ebenfalls
 * doppelpunktfrei - das Zeitstempelformat benutzt genau deshalb Bindestriche.
 */
export function originKey(origin: RowOrigin): string {
  return origin.kind === 'live' ? `live:${origin.tableId}` : `archive:${origin.fileName}`;
}

export function parseOriginKey(key: string): RowOrigin {
  const separator = key.indexOf(':');
  const kind = key.slice(0, separator);
  const rest = key.slice(separator + 1);
  return kind === 'live' ? { kind: 'live', tableId: rest } : { kind: 'archive', fileName: rest };
}

export function isLive(origin: RowOrigin): boolean {
  return origin.kind === 'live';
}

/** Kurzform fuer Statusmeldungen: der Dateiname bzw. "laufende Notiz". */
export function originLabel(origin: RowOrigin): string {
  return origin.kind === 'live' ? 'laufende Notiz' : origin.fileName;
}

// ---------------------------------------------------------------------------
// Sortierung
// ---------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc';

/**
 * Standardsortierung: neueste zuerst.
 *
 * created ist ISO-8601 in UTC, festbreit und nullgepolstert - der
 * lexikografische Vergleich entspricht daher genau dem chronologischen
 * (dieselbe Begruendung wie bei der Dateinamenssortierung in
 * NoteArchiveService.list()). Ein Date-Parser waere nur eine zusaetzliche
 * Fehlerquelle.
 *
 * Zeilen OHNE created sortieren ans ENDE, nicht an den Anfang: ein fehlender
 * Zeitstempel darf nicht wie "brandneu" wirken. Nach der Migration
 * (ArchiveNotesMigration) sollte das nicht mehr vorkommen, gilt aber weiter
 * fuer Dateien, die von aussen dazukommen.
 *
 * Tiebreak auf order aufsteigend: die von der Migration nachgetragenen Zeilen
 * einer Datei tragen ALLE denselben created-Wert (den Zeitstempel der Datei).
 * Ohne Tiebreak waere ihre Reihenfolge nicht stabil und flackerte zwischen
 * Renders.
 */
export function byCreatedDesc(a: TableRow, b: TableRow): number {
  const ca = a.cells.created;
  const cb = b.cells.created;
  if (ca && cb) {
    const diff = cb.localeCompare(ca);
    if (diff !== 0) return diff;
  } else if (ca !== cb) {
    return ca ? -1 : 1;
  }
  return a.order - b.order;
}

/**
 * Vergleicht die Textwerte einer Spalte. Leere Zellen landen IMMER am Ende -
 * unabhaengig von der Richtung: eine leere Zelle ist kein kleiner Wert,
 * sondern ein fehlender. Waeren sie richtungsabhaengig, wuerde ein Klick auf
 * "aufsteigend" die 24 Zeilen ohne "bis" nach vorne holen und die eigentliche
 * Information verdecken.
 *
 * Gilt gleichermassen fuer Text- und Datumsspalten: "bis" ist YYYY-MM-DD und
 * damit ebenfalls lexikografisch sortierbar. Wichtig ist nur, created (mit
 * Zeitanteil und Millisekunden) und bis (reines Datum) NICHT miteinander zu
 * vergleichen - dafuer gibt es byCreatedDesc separat.
 */
function byColumn(columnId: string, direction: SortDirection) {
  return (a: TableRow, b: TableRow): number => {
    const va = a.cells[columnId];
    const vb = b.cells[columnId];
    const emptyA = va === null || va === undefined || va === '';
    const emptyB = vb === null || vb === undefined || vb === '';
    if (emptyA || emptyB) {
      if (emptyA && emptyB) return byCreatedDesc(a, b);
      return emptyA ? 1 : -1;
    }
    const diff = va.localeCompare(vb, 'de-AT', { sensitivity: 'base', numeric: true });
    if (diff !== 0) return direction === 'asc' ? diff : -diff;
    // Gleicher Wert - stabil nach der Standardsortierung, damit gleiche
    // Termine bzw. gleiche Personen intern nach Aktualitaet stehen.
    return byCreatedDesc(a, b);
  };
}

/**
 * Der Vergleicher fuer den aktuellen Sortierzustand. Ohne aktive Sortierung
 * gilt die Standardsortierung (created absteigend).
 */
export function comparatorFor(
  sort: { columnId: string; direction: SortDirection } | null,
): (a: TableRow, b: TableRow) => number {
  return sort ? byColumn(sort.columnId, sort.direction) : byCreatedDesc;
}

// ---------------------------------------------------------------------------
// Typ-Zugehoerigkeit der Spalten
// ---------------------------------------------------------------------------

/**
 * Spalten-id -> Typen, in deren Spaltensatz sie vorkommt. Vollstaendig aus
 * definition.columnsByTyp abgeleitet und nirgends hartkodiert, damit ein
 * dritter Typ in NoteRegistry.java hier ohne Codeaenderung mitwirkt.
 *
 * Fuer die aktuelle Definition ergibt das:
 *   typ    -> [Aufgabe, Info]   (die Typ-Spalte selbst gilt fuer alle)
 *   inhalt -> [Aufgabe, Info]
 *   von    -> [Aufgabe]
 *   bis    -> [Aufgabe]
 *   an     -> [Aufgabe]
 *   quelle -> [Info]
 */
export function columnOwnerTyps(definition: TableDefinition): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  owners.set(definition.typColumn.id, [...definition.typValues]);
  for (const typ of definition.typValues) {
    for (const column of definition.columnsByTyp[typ] ?? []) {
      const existing = owners.get(column.id);
      if (existing) existing.push(typ);
      else owners.set(column.id, [typ]);
    }
  }
  return owners;
}

/**
 * Eine Spalte ist typ-exklusiv, wenn sie NICHT bei allen Typen vorkommt -
 * "Bis" etwa gibt es nur bei Aufgaben. Sortieren oder Filtern nach so einer
 * Spalte schraenkt daher automatisch auf die zugehoerigen Typen ein (siehe
 * useNoteViewFilters).
 *
 * Verglichen wird gegen typValues.length und nicht gegen "genau ein
 * Besitzer": eine Spalte, die kuenftig zu zwei von drei Typen gehoert,
 * schraenkt damit korrekt auf diese zwei ein.
 */
export function isTypExclusive(definition: TableDefinition, columnId: string): boolean {
  const owners = columnOwnerTyps(definition).get(columnId) ?? [];
  return owners.length > 0 && owners.length < definition.typValues.length;
}

/**
 * Alle Spalten ueber alle Typen, dedupliziert per id: die Grundlage der
 * Bedienelemente in der Filterleiste. Reihenfolge: Typ-Spalte zuerst, dann
 * die uebrigen in der Reihenfolge ihres ersten Auftretens ueber typValues
 * hinweg - fuer die aktuelle Definition also typ, von, inhalt, bis, an,
 * quelle.
 */
export function unionColumns(definition: TableDefinition): ColumnDefinition[] {
  const columns = [definition.typColumn];
  const seen = new Set([definition.typColumn.id]);
  for (const typ of definition.typValues) {
    for (const column of definition.columnsByTyp[typ] ?? []) {
      if (seen.has(column.id)) continue;
      seen.add(column.id);
      columns.push(column);
    }
  }
  return columns;
}
