package at.anlagenbauaustria.aiapp.views.model;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;

/**
 * Die darstellbaren Ansichten und ihre komplette Zuordnung auf die
 * ai-vault-Welt: Azure-Projekt, Publish-Skript und Ausgabedatei.
 *
 * Das ist die EINZIGE Stelle dieser Zuordnung - analog zu
 * Category.segment(). Wer eine Ansicht hinzufuegt, aendert nur diesen Enum
 * (und die Ansichtenliste im Frontend erbt sie ueber /api/views).
 *
 * Alle drei Ansichten laufen ueber den JSON-Pfad. Cockpit und Costs wurden
 * dafuer nachgezogen (die Publish-Skripte unter ai-vault
 * pipelines/azure_boards/json/, siehe publishScript unten); der CSV-Pfad
 * existiert dort weiterhin, wird von der App aber nicht mehr angesprochen.
 *
 * category() ist das Projekt, das VOR dem Publish reidentifiziert werden muss.
 * Bewusst nur dieses eine und nicht alle drei: technical hat gar keine
 * Ansicht, und ein Reidentify-Lauf ist teuer (ein Python-Prozess je Datei).
 */
public enum ViewKind {

    COCKPIT("cockpit", "Cockpit", Category.MAIN,
            "pipelines/azure_boards/json/main/run_publish_cockpit_html.sh",
            "5_output/azure_boards/json/main/cockpit-html/cockpit.html"),

    STAKEHOLDER("stakeholder", "Stakeholder", Category.MAIN,
            "pipelines/azure_boards/json/main/run_publish_stakeholder_html.sh",
            "5_output/azure_boards/json/main/stakeholder-html/stakeholder.html"),

    COSTS("costs", "Costs", Category.COSTS,
            "pipelines/azure_boards/json/costs/run_publish_costs_html.sh",
            "5_output/azure_boards/json/costs/costs-html/costs.html");

    private final String id;
    private final String label;
    private final Category category;
    private final String publishScript;
    private final String outputPath;

    ViewKind(String id, String label, Category category, String publishScript, String outputPath) {
        this.id = id;
        this.label = label;
        this.category = category;
        this.publishScript = publishScript;
        this.outputPath = outputPath;
    }

    /** Stabiler Bezeichner in der API und im Frontend (z.B. "cockpit"). */
    public String id() {
        return id;
    }

    /** Anzeigename in der Oberflaeche. */
    public String label() {
        return label;
    }

    /** Azure-Projekt, das vor dem Publish reidentifiziert wird. */
    public Category category() {
        return category;
    }

    /** ai-vault-relativer Pfad des Publish-Skripts (ohne Argumente aufzurufen). */
    public String publishScript() {
        return publishScript;
    }

    /** ai-vault-relativer Pfad der erzeugten HTML-Datei, immer unter 5_output/. */
    public String outputPath() {
        return outputPath;
    }

    public static ViewKind fromId(String value) {
        for (ViewKind kind : values()) {
            if (kind.id.equals(value)) {
                return kind;
            }
        }
        throw new IllegalArgumentException(
                "Unbekannte Ansicht: " + value + " (erlaubt: cockpit, stakeholder, costs)");
    }
}
