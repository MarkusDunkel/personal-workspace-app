package at.anlagenbauaustria.aiapp.views.model;

/**
 * Ein Eintrag der manuellen Stakeholder-Reihenfolge: Work-Item-ID plus Titel
 * (nur als Kommentar in der Config-Datei, siehe ViewSettingsService).
 */
public record StakeholderOrderEntry(String id, String title) {
}
