package at.anlagenbauaustria.aiapp.azureboards.tickets.model;

import at.anlagenbauaustria.aiapp.azureboards.tickets.BaselineRef;

import java.util.List;

/**
 * Der Vergleichsstand eines Tickets aus der Versionsverwaltung - die Werte
 * seiner bearbeitbaren Felder, wie sie im letzten Commit stehen.
 *
 * available=false ist ein NORMALER Zustand, kein Fehler: die Datei kann
 * unversioniert sein, das Repository kann fehlen, oder es hat noch keinen
 * Commit. Die Oberflaeche zeigt dann einfach keine Markierungen. Deshalb
 * kommt dieser Fall auch mit HTTP 200 zurueck und nicht als 404 - ein
 * Fehlerstatus liesse einen erwarteten Zustand in der Browser-Konsole wie
 * eine Stoerung aussehen.
 *
 * reason ist nur gesetzt, wenn available=false ist, und erklaert dem Nutzer
 * kurz, warum nichts markiert wird.
 */
public record TicketBaseline(
        String id,
        BaselineRef ref,
        boolean available,
        String reason,
        List<TicketBaselineField> fields) {

    /** Kein Vergleichsstand - mit Begruendung fuer die Oberflaeche. */
    public static TicketBaseline unavailable(String id, BaselineRef ref, String reason) {
        return new TicketBaseline(id, ref, false, reason, List.of());
    }
}
