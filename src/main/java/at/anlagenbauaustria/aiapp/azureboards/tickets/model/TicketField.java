package at.anlagenbauaustria.aiapp.azureboards.tickets.model;

import at.anlagenbauaustria.aiapp.azureboards.tickets.DescriptionDialect;
import at.anlagenbauaustria.aiapp.azureboards.tickets.EditableField;

/**
 * Ein bearbeitbares Feld eines Tickets mit seinem ROHWERT.
 *
 * Der Dialekt wird je Feld einzeln bestimmt, nicht einmal pro Ticket: eine
 * Beschreibung kann Markdown sein, waehrend die Acceptance Criteria desselben
 * Tickets in HTML vorliegen. Am Bestand ist das der Normalfall - technical
 * fuehrt 76 von 83 Acceptance Criteria als Azure-HTML. Ein gemeinsamer Dialekt
 * wuerde eines der beiden Felder in den falschen Editor schicken.
 */
public record TicketField(
        EditableField field,
        String label,
        String value,
        DescriptionDialect dialect) {}
