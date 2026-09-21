package at.anlagenbauaustria.aiapp.azureboards.tickets.model;

import at.anlagenbauaustria.aiapp.azureboards.tickets.DescriptionDialect;

/**
 * Kopfzeile eines Tickets fuer die Auswahlliste.
 *
 * id ist System.Id und ein STRING, keine Zahl - so steht es in den Dateien.
 *
 * dialect entscheidet, welcher Editor angeboten wird; hasRoadmapHistory und
 * hasConflicts sind Warnhinweise fuer die Oberflaeche: eine
 * Roadmap-Historie-Tabelle wird von der stakeholder-html-Pipeline maschinell
 * ausgewertet, und ein Ticket mit _conflicts blockiert ohnehin den Import
 * (siehe merge_boards.CONFLICT_KEY).
 */
public record TicketSummary(
        String id,
        String title,
        String workItemType,
        String fileName,
        DescriptionDialect dialect,
        boolean hasRoadmapHistory,
        boolean hasConflicts) {}
