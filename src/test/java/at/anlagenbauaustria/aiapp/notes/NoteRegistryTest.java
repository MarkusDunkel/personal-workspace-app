package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.notes.model.ColumnDefinition;
import at.anlagenbauaustria.aiapp.notes.model.ColumnType;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sichert die Zusagen der Spaltendefinition ab, auf denen andere Bauteile
 * stillschweigend aufbauen - die Definition ist die einzige Quelle, und ein
 * Tippfehler hier wirkt sich erst weit entfernt in der Oberflaeche aus.
 */
class NoteRegistryTest {

    private NoteTableDefinition notes;

    @BeforeEach
    void setUp() {
        Optional<NoteTableDefinition> definition = new NoteRegistry().get("notes");
        assertThat(definition).isPresent();
        notes = definition.get();
    }

    private Optional<ColumnDefinition> column(String typ, String columnId) {
        return notes.columnsByTyp().get(typ).stream()
                .filter(c -> c.id().equals(columnId))
                .findFirst();
    }

    /**
     * Die tragende Invariante: dass die Status-Spalte NUR bei "Aufgabe" steht,
     * erledigt gleich drei Dinge von selbst - sie erscheint nur in
     * Aufgaben-Zeilen (DataGrid.columnsForRow), gilt automatisch als
     * typ-exklusiv (noteSort.isTypExclusive) und nur solche Zeilen werden
     * eingefaerbt (DataGrid.statusClassFor). Wandert sie zu "Info", faellt
     * alles drei zugleich um.
     */
    @Test
    void statusColumnExistsOnlyForAufgabe() {
        assertThat(column("Aufgabe", "status")).isPresent();
        assertThat(column("Info", "status")).isEmpty();
    }

    /** Die Reihenfolge ist Vorgabe: so erscheinen die Werte im Auswahlmenue. */
    @Test
    void statusColumnOffersTheThreeStatesInOrder() {
        ColumnDefinition status = column("Aufgabe", "status").orElseThrow();
        assertThat(status.type()).isEqualTo(ColumnType.CHOICE);
        assertThat(status.options()).containsExactly("neu", "aktiv", "erledigt");
    }

    /**
     * Haelt den Vertrag des Kompaktkonstruktors: nur eine CHOICE-Spalte fuehrt
     * eine Werteliste, alle anderen bleiben leer statt null.
     */
    @Test
    void onlyChoiceColumnsCarryOptions() {
        List<ColumnDefinition> all = notes.columnsByTyp().values().stream()
                .flatMap(List::stream)
                .toList();
        assertThat(all).isNotEmpty();
        assertThat(all).allSatisfy(column -> {
            assertThat(column.options()).isNotNull();
            if (column.type() != ColumnType.CHOICE) {
                assertThat(column.options()).isEmpty();
            }
        });
        assertThat(notes.typColumn().options()).isEmpty();
    }

    /**
     * Die Status-Spalte steht am Ende: "inhalt" nimmt als einzige Spalte den
     * Restplatz, alles danach ist rechtsbuendig fixiert. Weiter vorne
     * eingefuegt verschoebe sie die Inhalts-Spalte gegenueber Info-Zeilen.
     */
    @Test
    void statusIsTheLastColumnOfAufgabe() {
        List<ColumnDefinition> aufgabe = notes.columnsByTyp().get("Aufgabe");
        assertThat(aufgabe.get(aufgabe.size() - 1).id()).isEqualTo("status");
    }
}
