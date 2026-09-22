package at.anlagenbauaustria.aiapp.azureboards.tickets.model;

import at.anlagenbauaustria.aiapp.azureboards.tickets.DescriptionDialect;

import java.util.List;

/**
 * Ein Ticket mit seinen bearbeitbaren Feldern im ROHZUSTAND - genau so, wie
 * sie in der Datei stehen, ohne jede Umformung.
 *
 * revision ist ein opaker Aenderungsmarker der DATEI (nicht des Tickets), wie
 * in WorkspaceDocument: die App gibt ihn beim Speichern unveraendert zurueck,
 * damit der Dienst erkennt, ob die Datei zwischenzeitlich von aussen
 * geaendert wurde - hier vor allem durch einen Pipeline-Lauf, der das ganze
 * Verzeichnis neu schreibt.
 *
 * fields traegt, was dieses Ticket bearbeiten laesst (siehe EditableField):
 * immer die Beschreibung, bei User Stories in "technical" zusaetzlich die
 * Acceptance Criteria. description und dialect bleiben als eigene Felder
 * erhalten, weil die Beschreibung das einzige Feld ist, das es garantiert in
 * jedem Ticket gibt - die Oberflaeche kann sich darauf verlassen.
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
        String revision,
        List<TicketField> fields,
        /**
         * Adresse des Originals in Azure Boards. Der Server baut sie, damit
         * Organisation und Projektname an EINER Stelle stehen (siehe
         * AzureBoardsProperties und Category.azureProject).
         */
        String azureUrl) {}
