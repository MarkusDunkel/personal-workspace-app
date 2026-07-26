package at.anlagenbauaustria.aiapp.tables;

import at.anlagenbauaustria.aiapp.tables.model.ColumnDefinition;
import at.anlagenbauaustria.aiapp.tables.model.ColumnType;
import at.anlagenbauaustria.aiapp.tables.model.TableDefinition;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Hardcodierte Liste der verfuegbaren Tabellentypen (Konzept: Aufgabe,
 * Info). Bewusst nicht konfigurationsdatei-getrieben - ein weiterer
 * Tabellentyp bedeutet einen weiteren Eintrag hier, sonst nichts.
 */
@Component
public class TableRegistry {

    private static final List<TableDefinition> DEFINITIONS = List.of(
            new TableDefinition("aufgabe", "Aufgabe", List.of(
                    new ColumnDefinition("von", "Von", ColumnType.PERSON),
                    new ColumnDefinition("inhalt", "Inhalt", ColumnType.TEXT),
                    new ColumnDefinition("bis", "Bis", ColumnType.DATE),
                    new ColumnDefinition("an", "An", ColumnType.PERSON)
            )),
            new TableDefinition("info", "Info", List.of(
                    new ColumnDefinition("quelle", "Quelle", ColumnType.PERSON),
                    new ColumnDefinition("inhalt", "Inhalt", ColumnType.TEXT)
            ))
    );

    public List<TableDefinition> getAll() {
        return DEFINITIONS;
    }

    public Optional<TableDefinition> get(String tableId) {
        return DEFINITIONS.stream().filter(d -> d.id().equals(tableId)).findFirst();
    }
}
