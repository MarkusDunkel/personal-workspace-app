package at.anlagenbauaustria.aiapp.azureboards.model;

/**
 * Die JSON-faehigen Azure-Boards-Kategorien. "costs" hat (anders als
 * frueher) eine eigene JSON-Pipeline (siehe ai-vault
 * pipelines/azure_boards/json/costs/), allerdings OHNE Root-Parent-Split:
 * die System.Parent-Hierarchie bricht bei costs nach der Ebene Kombination
 * ab (Loesung/Kostenpunkt/Kostenfaktor haengen nur ueber das ungerichtete
 * System.Related an einer Kombination, teils an mehreren gleichzeitig) --
 * ein eindeutiger Split waere nicht moeglich. costs.json bleibt daher eine
 * einzelne Datei statt einer je Themenbereich; run_import.sh (JSON-Pfad)
 * erkennt implizite Loeschungen ueber einen globalen statt einen
 * root-bezogenen Ids-Vergleich (siehe plan_changes.missing_ids_global).
 */
public enum Category {
    MAIN("main", "Digital Transformation"),
    TECHNICAL("technical", "Technische Entwicklung"),
    COSTS("costs", "Kosten und Ressourcen");

    private final String segment;
    private final String azureProject;

    Category(String segment, String azureProject) {
        this.segment = segment;
        this.azureProject = azureProject;
    }

    /** Der Ordner-/Skriptname in ai-vault (z.B. "main", "technical"). */
    public String segment() {
        return segment;
    }

    /**
     * Der Name des Azure-DevOps-Projekts. Muss zu PROJECT in der jeweiligen
     * pipelines/azure_boards/json/&lt;kategorie&gt;/config.py passen - daher
     * kommen die Tickets, und nur unter diesem Namen sind sie im Browser
     * erreichbar.
     */
    public String azureProject() {
        return azureProject;
    }

    public static Category fromSegment(String value) {
        for (Category category : values()) {
            if (category.segment.equals(value)) {
                return category;
            }
        }
        throw new IllegalArgumentException(
                "Unbekannte Kategorie: " + value + " (erlaubt: main, technical, costs)");
    }
}
