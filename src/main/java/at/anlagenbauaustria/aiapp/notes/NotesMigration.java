package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableRow;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Einmalige Migration der alten getrennten Tabellen (aufgabe.json, info.json)
 * in die neue gemeinsame notes.json, mit einer "typ"-Zelle pro Zeile.
 * Idempotent: existiert notes.json bereits, greift dieser Runner nicht mehr -
 * die Existenz der Datei ist selbst die Markierung, dass die Migration schon
 * gelaufen ist. Die alten Dateien werden absichtlich nicht geloescht.
 */
@Component
public class NotesMigration implements ApplicationRunner {

    private static final String ZONE = "0_sources/notes";

    private final FsGuard fsGuard;
    private final NoteDataService dataService;
    private final ObjectMapper objectMapper;

    public NotesMigration(FsGuard fsGuard, NoteDataService dataService, ObjectMapper objectMapper) {
        this.fsGuard = fsGuard;
        this.dataService = dataService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        Path notesFile = fsGuard.resolveWithinZone(ZONE + "/notes.json", ZONE);
        if (Files.exists(notesFile)) {
            return;
        }

        List<NoteTableRow> merged = new ArrayList<>();
        int order = 0;
        order = appendTagged(merged, readLegacy("aufgabe"), "Aufgabe", order);
        appendTagged(merged, readLegacy("info"), "Info", order);

        dataService.write("notes", new NoteTableData("notes", merged));
    }

    private int appendTagged(List<NoteTableRow> target, NoteTableData legacy, String typ, int startOrder) {
        int order = startOrder;
        for (NoteTableRow row : legacy.rows()) {
            Map<String, String> cells = new LinkedHashMap<>();
            cells.put("typ", typ);
            cells.putAll(row.cells());
            target.add(new NoteTableRow(row.id(), cells, order));
            order++;
        }
        return order;
    }

    private NoteTableData readLegacy(String tableId) {
        Path file = fsGuard.resolveWithinZone(ZONE + "/" + tableId + ".json", ZONE);
        if (!Files.exists(file)) {
            return new NoteTableData(tableId, List.of());
        }
        try {
            String json = Files.readString(file, StandardCharsets.UTF_8);
            return objectMapper.readValue(json, NoteTableData.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte alte Tabellendatei nicht lesen: " + file, e);
        }
    }
}
