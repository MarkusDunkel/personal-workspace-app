package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.notes.model.ColumnDefinition;
import at.anlagenbauaustria.aiapp.notes.model.ColumnType;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableDefinition;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Hardcodierte Definition der einen Notizen-Tabelle. Jede Zeile traegt eine
 * "Typ"-Zelle (Aufgabe/Info), die bestimmt, welcher zusaetzliche Spaltensatz
 * fuer diese Zeile gilt (columnsByTyp). Bewusst nicht konfigurationsdatei-
 * getrieben - ein weiterer Typ oder eine weitere Spalte bedeutet einen
 * weiteren/geaenderten Eintrag hier, sonst nichts.
 */
@Component
public class NoteRegistry {

    private static final List<NoteTableDefinition> DEFINITIONS = List.of(
            new NoteTableDefinition(
                    "notes",
                    "Notizen",
                    new ColumnDefinition("typ", "Typ", ColumnType.TYP),
                    List.of("Aufgabe", "Info"),
                    Map.of(
                            "Aufgabe", List.of(
                                    new ColumnDefinition("von", "Von", ColumnType.PERSON),
                                    new ColumnDefinition("inhalt", "Inhalt", ColumnType.TEXT),
                                    new ColumnDefinition("bis", "Bis", ColumnType.DATE),
                                    new ColumnDefinition("an", "An", ColumnType.PERSON)
                            ),
                            "Info", List.of(
                                    new ColumnDefinition("quelle", "Quelle", ColumnType.PERSON),
                                    new ColumnDefinition("inhalt", "Inhalt", ColumnType.TEXT)
                            )
                    )
            )
    );

    public List<NoteTableDefinition> getAll() {
        return DEFINITIONS;
    }

    public Optional<NoteTableDefinition> get(String tableId) {
        return DEFINITIONS.stream().filter(d -> d.id().equals(tableId)).findFirst();
    }
}
