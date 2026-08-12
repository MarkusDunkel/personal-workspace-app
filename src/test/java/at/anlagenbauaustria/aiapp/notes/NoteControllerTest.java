package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.lists.ListsService;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableRow;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class NoteControllerTest {

    @TempDir
    Path aivaultRoot;

    private NoteController controller;
    private NoteDataService dataService;

    @BeforeEach
    void setUp() {
        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        FsGuard fsGuard = new FsGuard(properties);
        ObjectMapper objectMapper = new ObjectMapper();
        dataService = new NoteDataService(fsGuard, new AtomicFileWriter(), objectMapper);
        // Testzeilen enthalten bewusst keine projekt/meeting/von/an/quelle-
        // Werte, damit ListsService.addProvisional() nie mit einem
        // nicht-leeren Wert aufgerufen wird - so kann hier ein echtes
        // ListsService mit dem Default-Konstruktor (Pfad "data/") verwendet
        // werden, ohne dass tatsaechlich ein Verzeichnis angelegt wird
        // (LocalDataDir.resolve() legt es erst bei Bedarf an).
        ListsService listsService = new ListsService(new at.anlagenbauaustria.aiapp.lists.LocalDataDir(), new AtomicFileWriter());
        controller = new NoteController(new NoteRegistry(), dataService, listsService);
    }

    @Test
    void putSetsStatusActiveOnNewAufgabeRow() {
        NoteTableRow row = new NoteTableRow("a1", Map.of("typ", "Aufgabe"), 0);
        controller.put("notes", new NoteTableData("notes", List.of(row)));

        NoteTableData stored = dataService.read("notes");
        assertThat(stored.rows()).hasSize(1);
        assertThat(stored.rows().get(0).cells()).containsEntry("status", "aktiv");
    }

    @Test
    void putDoesNotSetStatusOnInfoRow() {
        NoteTableRow row = new NoteTableRow("i1", Map.of("typ", "Info"), 0);
        controller.put("notes", new NoteTableData("notes", List.of(row)));

        NoteTableData stored = dataService.read("notes");
        assertThat(stored.rows().get(0).cells()).doesNotContainKey("status");
    }

    @Test
    void putDoesNotOverwriteExistingStatus() {
        NoteTableRow row = new NoteTableRow("a1", Map.of("typ", "Aufgabe", "status", "erledigt"), 0);
        controller.put("notes", new NoteTableData("notes", List.of(row)));

        NoteTableData stored = dataService.read("notes");
        assertThat(stored.rows().get(0).cells()).containsEntry("status", "erledigt");
    }

    @Test
    void putIsIdempotentAcrossMultipleSaves() {
        NoteTableRow row = new NoteTableRow("a1", Map.of("typ", "Aufgabe"), 0);
        controller.put("notes", new NoteTableData("notes", List.of(row)));
        NoteTableData afterFirstSave = dataService.read("notes");

        controller.put("notes", afterFirstSave);
        NoteTableData afterSecondSave = dataService.read("notes");

        assertThat(afterSecondSave.rows().get(0).cells()).containsEntry("status", "aktiv");
    }
}
