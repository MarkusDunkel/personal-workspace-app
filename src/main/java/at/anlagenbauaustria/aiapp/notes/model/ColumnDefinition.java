package at.anlagenbauaustria.aiapp.notes.model;

import java.util.List;

/**
 * Eine Spalte der Notizen-Tabelle.
 *
 * options traegt die erlaubten Werte einer CHOICE-Spalte und ist fuer alle
 * anderen Typen leer. Die Liste haengt bewusst an der SPALTE und nicht wie
 * typValues an der Tabelle: typValues gehoert zur einen Diskriminator-Spalte,
 * die bestimmt, welcher Spaltensatz fuer eine Zeile gilt (siehe
 * NoteTableDefinition), und ist zugleich die Schluesselmenge von
 * columnsByTyp. Eine zweite Werteliste daneben ("statusValues") haette keine
 * solche strukturelle Rolle und muesste bei jeder weiteren Auswahlspalte um
 * ein Feld wachsen, das fuer alle uebrigen Spalten bedeutungslos ist.
 */
public record ColumnDefinition(
        String id,
        String label,
        ColumnType type,
        List<String> options
) {

    /**
     * Kurzform fuer Spalten ohne Werteliste (TEXT/DATE/PERSON/TYP) - haelt
     * die bestehenden Eintraege in NoteRegistry unveraendert lesbar.
     */
    public ColumnDefinition(String id, String label, ColumnType type) {
        this(id, label, type, List.of());
    }
}
