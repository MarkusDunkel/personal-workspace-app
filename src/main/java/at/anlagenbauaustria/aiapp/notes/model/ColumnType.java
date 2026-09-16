package at.anlagenbauaustria.aiapp.notes.model;

public enum ColumnType {
    TEXT,
    DATE,
    PERSON,
    TYP,
    /**
     * Zelle mit geschlossener Werteliste (siehe ColumnDefinition.options).
     * Bewusst generisch benannt und nicht "STATUS": dieses Enum beschreibt
     * die FORM einer Zelle, nicht ihre Fachlichkeit - eine spaetere Spalte
     * "Prioritaet" braucht damit keinen weiteren Eintrag hier.
     */
    CHOICE
}
