package at.anlagenbauaustria.aiapp.tables;

import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.tables.model.TableData;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Einzige Stelle mit Schreibzugriff auf 0_sources/tables/ - strukturierte
 * JSON-Ablage fuer die Tabellen-UI, analog zu NoteFileService fuer die
 * Praefix-Syntax-Notizen, aber ohne Ingest-Schritt (die JSON-Datei ist
 * bereits die strukturierte Wahrheit, kein Parsing noetig).
 */
@Service
public class TableDataService {

    private static final String ZONE = "0_sources/tables";

    private final FsGuard fsGuard;
    private final AtomicFileWriter atomicFileWriter;
    private final ObjectMapper objectMapper;

    public TableDataService(FsGuard fsGuard, AtomicFileWriter atomicFileWriter, ObjectMapper objectMapper) {
        this.fsGuard = fsGuard;
        this.atomicFileWriter = atomicFileWriter;
        this.objectMapper = objectMapper;
    }

    public TableData read(String tableId) {
        Path file = resolveFile(tableId);
        if (!Files.exists(file)) {
            return new TableData(tableId, List.of());
        }
        try {
            String json = Files.readString(file, StandardCharsets.UTF_8);
            return objectMapper.readValue(json, TableData.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Tabellendatei nicht lesen: " + file, e);
        }
    }

    public void write(String tableId, TableData data) {
        Path file = resolveFile(tableId);
        try {
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(data);
            atomicFileWriter.writeUtf8(file, json);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Tabellendatei nicht schreiben: " + file, e);
        }
    }

    private Path resolveFile(String tableId) {
        String relative = ZONE + "/" + tableId + ".json";
        return fsGuard.resolveWithinZone(relative, ZONE);
    }
}
