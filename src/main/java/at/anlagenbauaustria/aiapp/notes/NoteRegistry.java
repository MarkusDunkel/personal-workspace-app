package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.notes.model.ColumnDefinition;
import at.anlagenbauaustria.aiapp.notes.model.ColumnType;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableDefinition;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Hardcodierte Liste der verfuegbaren Tabellentypen (Konzept: Aufgabe,
 * Info). Bewusst nicht konfigurationsdatei-getrieben - ein weiterer
 * Tabellentyp bedeutet einen weiteren Eintrag hier, sonst nichts.
 */
@Component
public class NoteRegistry {

    private static final List<NoteTableDefinition> DEFINITIONS = List.of(
            new NoteTableDefinition("aufgabe", "Aufgabe", List.of(
                    new ColumnDefinition("von", "Von", ColumnType.PERSON),
                    new ColumnDefinition("inhalt", "Inhalt", ColumnType.TEXT),
                    new ColumnDefinition("bis", "Bis", ColumnType.DATE),
                    new ColumnDefinition("an", "An", ColumnType.PERSON)
            )),
            new NoteTableDefinition("info", "Info", List.of(
                    new ColumnDefinition("quelle", "Quelle", ColumnType.PERSON),
                    new ColumnDefinition("inhalt", "Inhalt", ColumnType.TEXT)
            ))
    );

    public List<NoteTableDefinition> getAll() {
        return DEFINITIONS;
    }

    public Optional<NoteTableDefinition> get(String tableId) {
        return DEFINITIONS.stream().filter(d -> d.id().equals(tableId)).findFirst();
    }
}
