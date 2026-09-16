package at.anlagenbauaustria.aiapp.notes.archive;

import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.notes.archive.model.ArchiveFileInfo;
import at.anlagenbauaustria.aiapp.notes.archive.model.ArchiveSaveResult;
import at.anlagenbauaustria.aiapp.notes.archive.model.UnmappedName;
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
     *
     * List statt Set: die Reihenfolge landet ueber findUnmappedPersonNames in
     * einer Anzeige, und Set.of iteriert pro JVM-Start in anderer Reihenfolge
     * (randomisierter Hash-Salt). Solange der Fund nur eine Exception war,
     * spielte das keine Rolle. Der einzige andere Zugriff ist contains() in
     * mapCells, das auf einer Dreierliste genauso arbeitet.
     */
    private static final List<String> PERSON_CELLS = List.of("von", "an", "quelle");
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
     * Schreibt zurueck - immer pseudonymisiert.
     *
     * Werte in Personenspalten, die das Register nicht aufloesen kann, werden
     * GEMELDET und nicht abgelehnt. Frueher brach das Schreiben hier ab, mit
     * der Begruendung "lieber eine Fehlermeldung als ein Klarname in
     * 2_ai-ready". Diese Begruendung traegt nicht:
     *
     * 1. Ein nicht aufloesbarer Wert ist kein Klarname, den DIESER Vorgang
     *    hineintraegt - er kam mit read() unveraendert heraus und geht
     *    unveraendert zurueck. Gegen das eigentliche Leck (die von read()
     *    erzeugten Klarnamen) schuetzt mapCells mit toPseudonym, nicht diese
     *    Pruefung.
     * 2. Die Werte stammen aus der Python-Pipeline, die sie beim Absenden
     *    selbst durchgelassen hat - "Zeiterfassung", "GFOS Meeting", "HR"
     *    sind Projekte und Abteilungen. Die Pipeline fuehrt dafuer sogar eine
     *    eigene Liste (ai-vault/config/ignored_values.csv, angebunden ueber
     *    AIVAULT_IGNORED_VALUES), die hier bewusst NICHT gelesen wird - diese
     *    Pruefung war also ein zweites, mit der Pipeline unabgestimmtes
     *    Personenkriterium.
     * 3. Die Ablehnung galt der ganzen DATEI. Eine einzige solche Zelle machte
     *    jede Aenderung an jeder anderen Zeile unmoeglich, auch das Loeschen -
     *    die Oberflaeche schickt immer die komplette Datei.
     *
     * Der Abbruch bei fehlendem Register bleibt: dort kann ueberhaupt nicht
     * uebersetzt werden, das waere ein echtes Leck.
     *
     * Kuenftiger Ausbau: liest man ignored_values.csv hier mit, schrumpft die
     * Meldung auf die tatsaechlich unbekannten Werte - sonst steht sie
     * dauerhaft und wird uebersehen.
     */
    public ArchiveSaveResult write(String fileName, NoteTableData data) {
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
        // Vor dem Schreiben ermittelt, obwohl es nicht mehr blockiert: der
        // Fund bezieht sich auf den bereits pseudonymisierten Stand, und
        // unmittelbar nach mapCells ist das ohne zweites Hinsehen erkennbar.
        List<UnmappedName> unmapped = findUnmappedPersonNames(pseudonymized, mapping);

        try {
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(pseudonymized);
            atomicFileWriter.writeUtf8(file, json);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Archiv-Notiz nicht schreiben: " + file, e);
        }
        return new ArchiveSaveResult(unmapped);
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

    /**
     * Sammelt die Werte in Personenspalten, die nach der Rueckersetzung kein
     * Pseudonym geworden sind - also die, die das Register nicht kennt.
     *
     * Reine Ermittlung ohne Seiteneffekt: was damit geschieht, entscheidet der
     * Aufrufer (siehe write). Geprueft werden nur PERSON_CELLS, nicht der
     * Freitext in "inhalt" - dort kann allein der Python-Scan entscheiden, was
     * ein Name ist.
     */
    private static List<UnmappedName> findUnmappedPersonNames(
            NoteTableData pseudonymized, PseudonymMapper.Mapping mapping) {
        List<UnmappedName> found = new ArrayList<>();
        for (NoteTableRow row : pseudonymized.rows()) {
            for (String cellId : PERSON_CELLS) {
                String value = row.cells().get(cellId);
                for (String name : mapping.unmappedNames(value)) {
                    found.add(new UnmappedName(row.order() + 1, cellId, name));
                }
            }
        }
        return List.copyOf(found);
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
