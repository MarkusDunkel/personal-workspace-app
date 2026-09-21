package at.anlagenbauaustria.aiapp.azureboards.tickets.model;

/**
 * Ergebnis eines Speichervorgangs.
 *
 * changed = false heisst: die Beschreibung war identisch, die Datei wurde
 * NICHT angefasst (siehe AzureTicketService.writeDescription). Dann bleibt
 * auch die revision unveraendert.
 */
public record TicketSaveResult(boolean changed, String revision) {}
