package at.anlagenbauaustria.aiapp.azureboards.tickets.model;

import at.anlagenbauaustria.aiapp.azureboards.tickets.DescriptionDialect;

/**
 * Speicherauftrag fuer genau EIN Feld.
 *
 * field benennt es (siehe EditableField). Fehlt die Angabe, gilt
 * "DESCRIPTION" - so bleibt der Auftrag mit dem Stand vereinbar, als es nur
 * dieses eine Feld gab, und ein alter offener Tab schreibt weiterhin dorthin,
 * wohin er immer geschrieben hat.
 *
 * description traegt den neuen Wert (der Name stammt aus der Zeit des einen
 * Feldes und bleibt, damit der bestehende Vertrag unveraendert gilt).
 *
 * dialect ist der Dialekt, in dem der Client DIESES Feld geladen hat. Der
 * Dienst prueft ihn gegen den aktuellen Dateizustand und lehnt ab, wenn er
 * abweicht - sonst koennte ein lange offener Tab ein zwischenzeitlich
 * umgestelltes Feld im falschen Format ueberschreiben.
 */
public record TicketSaveRequest(
        String description, String revision, DescriptionDialect dialect, String field) {}
