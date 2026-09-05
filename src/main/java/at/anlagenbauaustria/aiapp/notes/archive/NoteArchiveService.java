package at.anlagenbauaustria.aiapp.notes.archive;

import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.notes.archive.model.ArchiveFileInfo;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableRow;
import at.anlagenbauaustria.aiapp.pseudonymize.PseudonymMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Zugriff auf die bereits abgesendeten, pseudonymisierten Notizen in
 * 2_ai-ready/notes/ - eigene Zone, getrennt von NoteDataService, das
 * ausschliesslich 0_sources/notes/ schreibt.
 *
 * Gelesen wird mit aufgeloesten Klarnamen (siehe PseudonymMapper),
 * geschrieben ausschliesslich pseudonymisiert: die Rueckersetzung sitzt hier
 * zwischen Request-Body und Dateisystem, sodass dieser Pfad ueberhaupt
 * keinen Klarnamen in die KI-Zone ausgeben kann.
 *
 * Neue Dateien entstehen hier nie - die legt allein die Pipeline beim
 * Absenden an (run_pseudonymize.sh). write() verlangt daher eine bereits
 * existierende Datei.
 */
@Service
public class NoteArchiveService {

    private static final String ZONE = "2_ai-ready/notes";

    /**
     * Format aus ai-vault/pipelines/notes/run_pseudonymize.sh:
     * notes-<YYYY-MM-DDTHH-MM-SSZ>.json. Die Vollpruefung laeuft VOR jeder
     * Pfadoperation und schliesst ".", "/", "\" und ".." bereits aus;
     * FsGuard ist die zweite Absicherung.
     */
    private static final Pattern FILE_NAME =
            Pattern.compile("notes-(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z)\\.json");

    /**
     * Nur diese Zellen werden uebersetzt. Die uebrigen (typ, status, bis,
     * created, lastChanged, projekt, meeting) enthalten keine Personennamen
     * und bleiben unangetastet.
     */
    private static final Set<String> PERSON_CELLS = Set.of("von", "an", "quelle");
    private static final String TEXT_CELL = "inhalt";

    private final FsGuard fsGuard;
    private final AtomicFileWriter atomicFileWriter;
    private final ObjectMapper objectMapper;
    private final PseudonymMapper pseudonymMapper;

    public NoteArchiveService(
            FsGuard fsGuard,
            AtomicFileWriter atomicFileWriter,
            ObjectMapper objectMapper,
            PseudonymMapper pseudonymMapper) {
        this.fsGuard = fsGuard;
        this.atomicFileWriter = atomicFileWriter;
        this.objectMapper = objectMapper;
        this.pseudonymMapper = pseudonymMapper;
    }

    /**
     * Neueste zuerst. Sortiert wird lexikografisch absteigend ueber den
     * Dateinamen - das Zeitstempelformat ist festbreit, nullgepolstert und
     * durchgehend UTC, daher entspricht die lexikografische Ordnung genau der
     * chronologischen. Ein DateTimeFormatter waere nur eine zusaetzliche
     * Fehlerquelle.
     */
    public List<ArchiveFileInfo> list() {
        Path dir = fsGuard.resolve(ZONE);
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (Stream<Path> files = Files.list(dir)) {
            return files
                    .map(path -> path.getFileName().toString())
                    .filter(name -> FILE_NAME.matcher(name).matches())
                    .sorted(Comparator.reverseOrder())
                    .map(name -> new ArchiveFileInfo(name, timestampOf(name), countRows(name)))
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte " + ZONE + " nicht auflisten: " + dir, e);
        }
    }

    /** Liefert die Notiz mit aufgeloesten Klarnamen. */
    public NoteTableData read(String fileName) {
        NoteTableData raw = readRaw(fileName);
        PseudonymMapper.Mapping mapping = pseudonymMapper.load();
        return mapCells(raw, mapping::toDisplay);
    }

    /**
     * Schreibt zurueck - immer pseudonymisiert. Bricht ab, wenn eine
     * Personenspalte einen Namen enthaelt, den das Register nicht kennt:
     * lieber eine sichtbare Fehlermeldung als ein Klarname in 2_ai-ready.
     */
    public void write(String fileName, NoteTableData data) {
        Path file = resolveExistingFile(fileName);

        PseudonymMapper.Mapping mapping = pseudonymMapper.load();
        if (mapping.isEmpty()) {
            // Ohne Register kann nicht pseudonymisiert werden. Vorwaerts waere
            // das ein harmloser No-Op, hier waere es ein Leck.
            throw new NotPseudonymizableException(
                    "person_register.csv ist nicht lesbar oder leer - Bearbeiten abgelehnt, "
                            + "da Namen nicht pseudonymisiert werden koennen.");
        }

        NoteTableData pseudonymized = mapCells(data, mapping::toPseudonym);
        rejectUnmappedPersonNames(pseudonymized, mapping);

        try {
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(pseudonymized);
            atomicFileWriter.writeUtf8(file, json);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Archiv-Notiz nicht schreiben: " + file, e);
        }
    }

    /**
     * Liest die Datei OHNE Pseudonym-Aufloesung, also genau so, wie sie auf
     * der Platte liegt.
     *
     * Package-private und nicht public: der einzige legitime Aufrufer
     * ausserhalb dieser Klasse ist ArchiveNotesMigration, die ausschliesslich
     * created und tableId nachtraegt. Rohzugriff ist dort richtig und noetig -
     * der Weg ueber read()/write() wuerde die Personenzellen unnoetig durch
     * das Register schleifen und beim Schreiben mit
     * NotPseudonymizableException abbrechen, sobald das Register beim Start
     * nicht lesbar ist. Ein Leck entsteht dabei nicht: die Migration
     * schreibt die Personenzellen unveraendert (also pseudonymisiert)
     * zurueck.
     */
    NoteTableData readRaw(String fileName) {
        Path file = resolveExistingFile(fileName);
        try {
            String json = Files.readString(file, StandardCharsets.UTF_8);
            return objectMapper.readValue(json, NoteTableData.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Archiv-Notiz nicht lesen: " + file, e);
        }
    }

    /**
     * Wendet die Uebersetzung auf die Personen- und Inhaltszellen an und
     * iteriert dabei ueber die TATSAECHLICH vorhandenen Zellen: aeltere
     * Dateien kennen weniger Spalten (kein created/status/projekt/meeting),
     * fehlende Zellen werden nicht ergaenzt.
     */
    private NoteTableData mapCells(NoteTableData data, java.util.function.UnaryOperator<String> translate) {
        List<NoteTableRow> rows = new ArrayList<>();
        for (NoteTableRow row : data.rows()) {
            Map<String, String> cells = new LinkedHashMap<>();
            for (Map.Entry<String, String> cell : row.cells().entrySet()) {
                String value = cell.getValue();
                boolean translatable = PERSON_CELLS.contains(cell.getKey())
                        || TEXT_CELL.equals(cell.getKey());
                cells.put(cell.getKey(), translatable && value != null ? translate.apply(value) : value);
            }
            rows.add(new NoteTableRow(row.id(), cells, row.order()));
        }
        return new NoteTableData(data.tableId(), rows);
    }

    private void rejectUnmappedPersonNames(NoteTableData pseudonymized, PseudonymMapper.Mapping mapping) {
        List<String> problems = new ArrayList<>();
        for (NoteTableRow row : pseudonymized.rows()) {
            for (String cellId : PERSON_CELLS) {
                String value = row.cells().get(cellId);
                for (String name : mapping.unmappedNames(value)) {
                    problems.add("\"" + name + "\" (Zeile " + (row.order() + 1)
                            + ", Spalte \"" + cellId + "\")");
                }
            }
        }
        if (!problems.isEmpty()) {
            throw new NotPseudonymizableException(
                    "Nicht pseudonymisierbar: " + String.join(", ", problems)
                            + ". Bitte zuerst ueber das Absenden ins Register aufnehmen.");
        }
    }

    private int countRows(String fileName) {
        return readRaw(fileName).rows().size();
    }

    private static String timestampOf(String fileName) {
        var matcher = FILE_NAME.matcher(fileName);
        return matcher.matches() ? matcher.group(1) : fileName;
    }

    /** Package-private aus demselben Grund wie {@link #readRaw(String)}. */
    Path resolveExistingFile(String fileName) {
        Path file = resolveFile(fileName);
        if (!Files.isRegularFile(file)) {
            throw new UnknownArchiveFileException(fileName);
        }
        return file;
    }

    private Path resolveFile(String fileName) {
        if (fileName == null || !FILE_NAME.matcher(fileName).matches()) {
            throw new UnknownArchiveFileException(String.valueOf(fileName));
        }
        return fsGuard.resolveWithinZone(ZONE + "/" + fileName, ZONE);
    }
}
