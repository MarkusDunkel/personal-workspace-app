package at.anlagenbauaustria.aiapp.views.model;

import java.util.List;

/**
 * Antwort/Anfrage einer ID-Liste der Stakeholder-Ansichten - der manuellen
 * Reihenfolge bzw. der standardmaessig ausgeblendeten Eintraege (siehe
 * ViewSettingsService).
 *
 * @param ids     gespeicherte Work-Item-IDs (Antwort)
 * @param entries zu speichernde Eintraege mit Titel (Anfrage)
 */
public record StakeholderOrder(List<String> ids, List<StakeholderOrderEntry> entries) {

    public static StakeholderOrder of(List<String> ids) {
        return new StakeholderOrder(ids, null);
    }
}
