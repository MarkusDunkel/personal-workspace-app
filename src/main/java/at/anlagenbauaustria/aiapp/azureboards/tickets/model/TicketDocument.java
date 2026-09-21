package at.anlagenbauaustria.aiapp.azureboards.tickets.model;

import at.anlagenbauaustria.aiapp.azureboards.tickets.DescriptionDialect;

/**
 * Ein Ticket mit seiner Beschreibung im ROHZUSTAND - genau so, wie sie in der
 * Datei steht, ohne jede Umformung.
 *
 * revision ist ein opaker Aenderungsmarker der DATEI (nicht des Tickets), wie
 * in WorkspaceDocument: die App gibt ihn beim Speichern unveraendert zurueck,
 * damit der Dienst erkennt, ob die Datei zwischenzeitlich von aussen
 * geaendert wurde - hier vor allem durch einen Pipeline-Lauf, der das ganze
 * Verzeichnis neu schreibt.
 */
public record TicketDocument(
        String id,
        String title,
        String workItemType,
        String fileName,
        DescriptionDialect dialect,
        boolean hasRoadmapHistory,
        boolean hasConflicts,
        String description,
        String revision) {}
