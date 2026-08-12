package at.anlagenbauaustria.aiapp.azureboards.model;

/**
 * Die JSON-faehigen Azure-Boards-Kategorien. "costs" existiert bislang nur
 * als CSV-Pipeline in ai-vault (siehe ai-vault/CLAUDE.md: "costs has no
 * json/ counterpart") und wird daher hier bewusst nicht aufgenommen - das
 * Frontend zeigt "Costs" nur als deaktivierte Kachel an, ohne dass es je
 * einen Request an dieses Backend ausloest.
 */
public enum Category {
    MAIN("main"),
    TECHNICAL("technical");

    private final String segment;

    Category(String segment) {
        this.segment = segment;
    }

    /** Der Ordner-/Skriptname in ai-vault (z.B. "main", "technical"). */
    public String segment() {
        return segment;
    }

    public static Category fromSegment(String value) {
        for (Category category : values()) {
            if (category.segment.equals(value)) {
                return category;
            }
        }
        throw new IllegalArgumentException(
                "Unbekannte Kategorie: " + value + " (erlaubt: main, technical)");
    }
}
