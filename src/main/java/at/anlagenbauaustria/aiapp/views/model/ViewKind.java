package at.anlagenbauaustria.aiapp.views.model;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

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
 * Ein Reidentify-Lauf ist teuer (ein Python-Prozess je Datei), deshalb laeuft
 * je Ansicht genau das eine Projekt, aus dem sie liest.
 *
 * publishArgs() sind die Argumente des Skripts. Leer bei den drei
 * Board-Ansichten, die ihren Eingang fest verdrahtet haben; die
 * Fortschritts-Ansichten uebergeben ihre Epic-Id, weil ein Skript alle Epics
 * bedient. Eine Ansicht JE EPIC ist Absicht: die Epic-Liste steht in
 * ai-vault/STORY-REGELWERK.md Abschnitt 1, und wer sie dort erweitert, legt
 * hier eine weitere Konstante an.
 *
 * Die Fortschritts-Ansicht ruft das Skript bewusst OHNE --attach auf: in
 * dieser Betriebsart schreibt es nichts nach Azure, sondern nur nach
 * 5_output. Das Anhaengen ans Epic ist dem Task
 * "Entwicklungsstand in den User Stories aktualisieren" vorbehalten.
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
            "5_output/azure_boards/json/costs/costs-html/costs.html"),

    /** Fortschritt des Epics 556 (Zeiterfassung, Arbeits- & Leistungszeit). */
    FORTSCHRITT_556("fortschritt-556", "Fortschritt Zeiterfassung", Category.TECHNICAL,
            "pipelines/azure_boards/json/technical/run_publish_heatmap.sh",
            "5_output/azure_boards/json/technical/heatmap/Fortschritt_556.html",
            "556");

    private final String id;
    private final String label;
    private final Category category;
    private final String publishScript;
    private final String outputPath;
    private final List<String> publishArgs;

    ViewKind(String id, String label, Category category, String publishScript, String outputPath,
             String... publishArgs) {
        this.id = id;
        this.label = label;
        this.category = category;
        this.publishScript = publishScript;
        this.outputPath = outputPath;
        this.publishArgs = List.of(publishArgs);
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

    /** Argumente des Publish-Skripts; leer, wenn es ohne aufgerufen wird. */
    public List<String> publishArgs() {
        return publishArgs;
    }

    public static ViewKind fromId(String value) {
        for (ViewKind kind : values()) {
            if (kind.id.equals(value)) {
                return kind;
            }
        }
        throw new IllegalArgumentException("Unbekannte Ansicht: " + value + " (erlaubt: "
                + Arrays.stream(values()).map(ViewKind::id).collect(Collectors.joining(", "))
                + ")");
    }
}
