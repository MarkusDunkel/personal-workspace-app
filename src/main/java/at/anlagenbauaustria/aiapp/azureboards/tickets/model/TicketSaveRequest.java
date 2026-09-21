package at.anlagenbauaustria.aiapp.azureboards.tickets.model;

import at.anlagenbauaustria.aiapp.azureboards.tickets.DescriptionDialect;

/**
 * Speicherauftrag fuer genau EIN Feld: System.Description.
 *
 * dialect ist der Dialekt, in dem der Client das Ticket geladen hat. Der
 * Dienst prueft ihn gegen den aktuellen Dateizustand und lehnt ab, wenn er
 * abweicht - sonst koennte ein lange offener Tab ein zwischenzeitlich
 * umgestelltes Feld im falschen Format ueberschreiben.
 */
public record TicketSaveRequest(String description, String revision, DescriptionDialect dialect) {}
