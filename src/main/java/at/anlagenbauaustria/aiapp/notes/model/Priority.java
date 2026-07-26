package at.anlagenbauaustria.aiapp.notes.model;

public enum Priority {
    HOCH,
    NORMAL,
    NIEDRIG;

    /**
     * Nimmt sowohl Wortformen ("hoch") als auch die 1-4-Skala aus der
     * Syntax entgegen (Konzept Kapitel 10.5): 1 = hoch, 2 = hoch,
     * 3 = normal, 4 = niedrig.
     */
    public static Priority parse(String raw) {
        String v = raw.trim().toLowerCase();
        return switch (v) {
            case "hoch", "1", "2" -> HOCH;
            case "niedrig", "4" -> NIEDRIG;
            case "mittel", "normal", "3" -> NORMAL;
            default -> null;
        };
    }
}
