package at.anlagenbauaustria.aiapp.azureboards.tickets.model;

import at.anlagenbauaustria.aiapp.azureboards.tickets.EditableField;

/**
 * Ein Feld im Vergleichsstand: sein Wert, wie er im letzten Commit steht.
 *
 * value ist nie null, sondern leer - ein Ticket, das es im Vergleichsstand
 * noch gar nicht gab, hat ueberall den leeren Wert, und das ist fachlich
 * richtig: dann ist alles daran neu hinzugekommen.
 */
public record TicketBaselineField(EditableField field, String value) {}
