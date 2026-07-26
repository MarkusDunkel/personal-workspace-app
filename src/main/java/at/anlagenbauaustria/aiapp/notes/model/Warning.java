package at.anlagenbauaustria.aiapp.notes.model;

/**
 * Warnungen blockieren eine Zeile nie (Konzept Kapitel 10.8/12) - nur ein
 * leerer Inhalt fuehrt zu ParseError. Jede Warnung hat einen stabilen Code
 * (fuer die UI/i18n) und einen deutschen Anzeigetext.
 */
public record Warning(String code, String message) {

    public static final String UNKNOWN_PREFIX = "unknown_prefix";
    public static final String MISSING_RECIPIENT = "missing_recipient";
    public static final String UNRESOLVED_DATE = "unresolved_date";
    public static final String POSSIBLE_MISSING_SEPARATOR = "possible_missing_separator";
}
