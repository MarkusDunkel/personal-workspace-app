import type {
  BaselineRef,
  DescriptionDialect,
  EditableField,
  TicketBaseline,
  TicketDocument,
  TicketSaveResult,
  TicketSummary,
} from './azureTicketTypes';

const BASE = '/api/azure-tickets';

export async function listTickets(category: string): Promise<TicketSummary[]> {
  const res = await fetch(`${BASE}/list/${encodeURIComponent(category)}`);
  if (!res.ok) throw new Error(`GET ${BASE}/list/${category} failed: ${res.status}`);
  return res.json();
}

export async function getTicket(category: string, id: string): Promise<TicketDocument> {
  const res = await fetch(`${BASE}/item/${encodeURIComponent(category)}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`GET ${BASE}/item/${category}/${id} failed: ${res.status}`);
  return res.json();
}

/**
 * Holt den Stand der Felder im letzten Commit.
 *
 * Wirft NIE. Ein fehlender Vergleichsstand ist ein normaler Zustand, und die
 * Aenderungsmarkierung ist Beiwerk - schlaegt sie fehl, muss das Ticket
 * trotzdem ganz normal bearbeitbar bleiben. Deshalb wird jeder Fehler hier zu
 * "nicht verfuegbar" statt zu einer Ausnahme, die die Ladekette abbraeche.
 */
export async function getTicketBaseline(
  category: string,
  id: string,
  ref: BaselineRef = 'HEAD',
): Promise<TicketBaseline> {
  const unavailable: TicketBaseline = {
    id,
    ref,
    available: false,
    reason: 'Vergleichsstand nicht abrufbar.',
    fields: [],
  };
  try {
    const res = await fetch(
      `${BASE}/baseline/${encodeURIComponent(category)}/${encodeURIComponent(id)}?ref=${ref}`,
    );
    if (!res.ok) return unavailable;
    return await res.json();
  } catch {
    return unavailable;
  }
}

/**
 * Schreibt EIN Feld des Tickets.
 *
 * field benennt es; der Wert reist weiterhin als "description" - so heisst das
 * Feld im Auftrag des Servers (TicketSaveRequest), seit es nur dieses eine gab.
 */
export async function putTicketField(
  category: string,
  id: string,
  field: EditableField,
  value: string,
  revision: string | null,
  dialect: DescriptionDialect,
): Promise<TicketSaveResult> {
  const res = await fetch(
    `${BASE}/item/${encodeURIComponent(category)}/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: value, revision, dialect, field }),
    },
  );
  if (res.ok) return res.json();
  // 409 = die Datei wurde seit dem Laden geaendert, in aller Regel durch einen
  // Pipeline-Lauf (run_pseudonymize.sh schreibt das Verzeichnis neu) oder durch
  // eine Bearbeitung in VS Code. Die Servermeldung sagt, was zu tun ist, und
  // muss den Nutzer erreichen - dasselbe Muster wie bei WorkspaceConflictError.
  if (res.status === 409) {
    throw new TicketConflictError(await readProblemMessage(res));
  }
  throw new Error(`PUT ${BASE}/item/${category}/${id} failed: ${res.status}`);
}

export class TicketConflictError extends Error {}

async function readProblemMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.message === 'string' && body.message
      ? body.message
      : 'Speichern abgelehnt.';
  } catch {
    return 'Speichern abgelehnt.';
  }
}
