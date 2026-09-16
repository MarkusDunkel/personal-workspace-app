package at.anlagenbauaustria.aiapp.notes.archive;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.fs.PathTraversalException;
import at.anlagenbauaustria.aiapp.notes.archive.model.ArchiveSaveResult;
import at.anlagenbauaustria.aiapp.notes.archive.model.UnmappedName;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableRow;
import at.anlagenbauaustria.aiapp.pipeline.AivaultEnv;
import at.anlagenbauaustria.aiapp.pseudonymize.PseudonymMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NoteArchiveServiceTest {

    @TempDir
    Path aivaultRoot;

    private NoteArchiveService service;
    private Path archiveDir;

    @BeforeEach
    void setUp() throws IOException {
        archiveDir = aivaultRoot.resolve("2_ai-ready").resolve("notes");
        Files.createDirectories(archiveDir);

        Path register = aivaultRoot.resolve("person_register.csv");
        Files.writeString(register,
                "canonical_value,pseudonym,type,aliases,notes\n"
                        + "Markus Dunkel,Person_007,person,@Markus Dunkel;Markus Dunkel,\n"
                        + "Helena Nölscher,Person_004,person,Helena;Nölscher,\n",
                StandardCharsets.UTF_8);
        Files.writeString(aivaultRoot.resolve(".env"),
                "AIVAULT_PERSON_REGISTER=" + register.toString().replace('\\', '/') + "\n",
                StandardCharsets.UTF_8);

        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        service = new NoteArchiveService(
                new FsGuard(properties),
                new AtomicFileWriter(),
                new ObjectMapper(),
                new PseudonymMapper(new AivaultEnv(properties)));
    }

    private void writeArchiveFile(String fileName, String json) throws IOException {
        Files.writeString(archiveDir.resolve(fileName), json, StandardCharsets.UTF_8);
    }

    private static String noteJson(String cellsJson) {
        return "{\"tableId\":\"notes\",\"rows\":[{\"id\":\"r1\",\"cells\":" + cellsJson + ",\"order\":0}]}";
    }

    @Test
    void listReturnsNewestFirst() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson("{}"));
        writeArchiveFile("notes-2026-08-21T06-57-51Z.json", noteJson("{}"));
        writeArchiveFile("notes-2026-08-08T12-16-40Z.json", noteJson("{}"));
        // Fremde Dateien im Verzeichnis werden ignoriert.
        writeArchiveFile("notes.json", noteJson("{}"));

        assertThat(service.list()).extracting("fileName").containsExactly(
                "notes-2026-08-21T06-57-51Z.json",
                "notes-2026-08-08T12-16-40Z.json",
                "notes-2026-08-05T12-20-07Z.json");
    }

    @Test
    void listReportsRowCountAndTimestamp() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json",
                "{\"tableId\":\"notes\",\"rows\":["
                        + "{\"id\":\"a\",\"cells\":{},\"order\":0},"
                        + "{\"id\":\"b\",\"cells\":{},\"order\":1}]}");

        assertThat(service.list()).singleElement()
                .satisfies(info -> {
                    assertThat(info.rowCount()).isEqualTo(2);
                    assertThat(info.timestamp()).isEqualTo("2026-08-05T12-20-07Z");
                });
    }

    @Test
    void listOnMissingDirectoryIsEmpty() throws IOException {
        Files.delete(archiveDir);
        assertThat(service.list()).isEmpty();
    }

    @Test
    void readResolvesKnownPseudonymsAndKeepsUnknownOnes() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson(
                "{\"typ\":\"Aufgabe\",\"von\":\"Person_007\","
                        + "\"inhalt\":\"Person_083 traf Person_004\"}"));

        Map<String, String> cells = service.read("notes-2026-08-05T12-20-07Z.json")
                .rows().get(0).cells();

        assertThat(cells).containsEntry("von", "Markus Dunkel");
        assertThat(cells).containsEntry("inhalt", "Person_083 traf Helena Nölscher");
        assertThat(cells).containsEntry("typ", "Aufgabe");
    }

    @Test
    void writeStoresPseudonymsNotRealNames() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson("{\"von\":\"Person_007\"}"));

        Map<String, String> edited = new LinkedHashMap<>();
        edited.put("von", "Markus Dunkel");
        edited.put("inhalt", "Rückfrage an Helena");
        service.write("notes-2026-08-05T12-20-07Z.json",
                new NoteTableData("notes", List.of(new NoteTableRow("r1", edited, 0))));

        String onDisk = Files.readString(
                archiveDir.resolve("notes-2026-08-05T12-20-07Z.json"), StandardCharsets.UTF_8);
        assertThat(onDisk).contains("Person_007").contains("Person_004");
        assertThat(onDisk).doesNotContain("Markus Dunkel").doesNotContain("Helena");
    }

    @Test
    void writePreservesCellsWithoutPersonData() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson("{}"));

        Map<String, String> cells = new LinkedHashMap<>();
        cells.put("typ", "Aufgabe");
        cells.put("bis", "2026-08-21");
        cells.put("status", "aktiv");
        service.write("notes-2026-08-05T12-20-07Z.json",
                new NoteTableData("notes", List.of(new NoteTableRow("r1", cells, 0))));

        assertThat(service.read("notes-2026-08-05T12-20-07Z.json").rows().get(0).cells())
                .containsEntry("typ", "Aufgabe")
                .containsEntry("bis", "2026-08-21")
                .containsEntry("status", "aktiv");
    }

    /**
     * Anzeigen und ohne Bearbeitung wieder speichern darf den Dateiinhalt
     * nicht veraendern - sonst wuerde jedes blosse Aufklappen einer alten
     * Notiz die Pseudonyme verschieben.
     */
    @Test
    void roundTripLeavesFileUnchangedWhenNothingEdited() throws IOException {
        Path file = archiveDir.resolve("notes-2026-08-05T12-20-07Z.json");
        // "quelle" traegt bewusst einen Nicht-Personen-Wert, wie er real in
        // 2_ai-ready steht: Anzeigen und unveraendert Zurueckspeichern darf
        // auch dann nichts aendern - frueher scheiterte genau das.
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson(
                "{\"typ\":\"Aufgabe\",\"von\":\"Person_007\",\"quelle\":\"Zeiterfassung\","
                        + "\"inhalt\":\"Person_083 fragt Person_004\"}"));

        // Erster Durchlauf normalisiert nur die Formatierung (Jackson
        // Pretty-Printer), danach muss der Inhalt stabil bleiben.
        service.write("notes-2026-08-05T12-20-07Z.json",
                service.read("notes-2026-08-05T12-20-07Z.json"));
        String normalized = Files.readString(file, StandardCharsets.UTF_8);

        service.write("notes-2026-08-05T12-20-07Z.json",
                service.read("notes-2026-08-05T12-20-07Z.json"));

        assertThat(Files.readString(file, StandardCharsets.UTF_8)).isEqualTo(normalized);
        assertThat(normalized)
                .contains("Person_007")
                .contains("Person_083")
                .contains("Person_004")
                .doesNotContain("Markus Dunkel")
                .doesNotContain("Nölscher");
    }

    /**
     * Der reale Fall aus 2_ai-ready: "Zeiterfassung" in der Spalte quelle ist
     * ein Projekt, keine Person - die Python-Pipeline laesst solche Werte
     * bewusst durch. Frueher lehnte write() deswegen die GANZE Datei ab,
     * wodurch sie dauerhaft unspeicherbar war (auch das Loeschen einer voellig
     * anderen Zeile schlug fehl). Jetzt wird der Wert gemeldet und
     * mitgeschrieben.
     */
    @Test
    void writeKeepsUnknownNamesAndReportsThem() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson("{}"));

        Map<String, String> cells = new LinkedHashMap<>();
        cells.put("typ", "Info");
        cells.put("quelle", "Zeiterfassung");
        cells.put("von", "Markus Dunkel");
        cells.put("inhalt", "Rückfrage an Helena");
        // order 24 statt 0: so prueft die erwartete 25 die Umrechnung
        // order + 1 wirklich.
        NoteTableData data = new NoteTableData("notes", List.of(new NoteTableRow("r1", cells, 24)));

        ArchiveSaveResult result = service.write("notes-2026-08-05T12-20-07Z.json", data);

        assertThat(result.unmappedNames())
                .containsExactly(new UnmappedName(25, "quelle", "Zeiterfassung"));

        String onDisk = Files.readString(
                archiveDir.resolve("notes-2026-08-05T12-20-07Z.json"), StandardCharsets.UTF_8);
        // Die Datei IST geschrieben, der unbekannte Wert steht unveraendert drin ...
        assertThat(onDisk).contains("Zeiterfassung");
        // ... und die uebrigen Personenzellen sind trotzdem pseudonymisiert.
        assertThat(onDisk).contains("Person_007").contains("Person_004");
        assertThat(onDisk).doesNotContain("Markus Dunkel").doesNotContain("Helena");
    }

    /**
     * Gegenprobe: ohne Fund muss die Liste LEER sein. Die Oberflaeche loescht
     * einen bestehenden Hinweis genau daran - meldete der Server immer etwas,
     * bliebe er fuer immer stehen.
     */
    @Test
    void writeReportsNothingWhenAllNamesAreKnown() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson("{}"));

        Map<String, String> cells = new LinkedHashMap<>();
        cells.put("von", "Markus Dunkel");
        cells.put("an", "Helena Nölscher");
        NoteTableData data = new NoteTableData("notes", List.of(new NoteTableRow("r1", cells, 0)));

        assertThat(service.write("notes-2026-08-05T12-20-07Z.json", data).unmappedNames())
                .isEmpty();
    }

    /**
     * Mehrere Funde: je Zeile und Spalte ein Eintrag, Duplikate bleiben
     * erhalten (sie unterscheiden sich durch die Zeile). Die Spaltenreihenfolge
     * ist von/an/quelle - dafuer ist PERSON_CELLS eine List und kein Set.
     */
    @Test
    void writeReportsEveryUnmappedNameWithRowAndColumn() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson("{}"));

        Map<String, String> first = new LinkedHashMap<>();
        first.put("von", "Hans Gruber");
        first.put("quelle", "Perk");
        Map<String, String> second = new LinkedHashMap<>();
        second.put("quelle", "Perk");
        NoteTableData data = new NoteTableData("notes", List.of(
                new NoteTableRow("r1", first, 0),
                new NoteTableRow("r2", second, 1)));

        assertThat(service.write("notes-2026-08-05T12-20-07Z.json", data).unmappedNames())
                .containsExactly(
                        new UnmappedName(1, "von", "Hans Gruber"),
                        new UnmappedName(1, "quelle", "Perk"),
                        new UnmappedName(2, "quelle", "Perk"));
    }

    /**
     * Freitext wird NICHT gemeldet: was in "inhalt" ein Name ist, kann allein
     * der Python-Scan entscheiden. Ohne diesen Test wuerde eine spaetere
     * "Verbesserung" der Pruefung die Hinweisliste unbrauchbar machen.
     */
    @Test
    void writeDoesNotReportFreeTextContent() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson("{}"));

        NoteTableData data = new NoteTableData("notes", List.of(new NoteTableRow(
                "r1", Map.of("inhalt", "Gespraech mit Hans Gruber"), 0)));

        assertThat(service.write("notes-2026-08-05T12-20-07Z.json", data).unmappedNames())
                .isEmpty();
    }

    @Test
    void writeRefusesWhenRegisterIsEmpty() throws IOException {
        Files.writeString(aivaultRoot.resolve("person_register.csv"),
                "canonical_value,pseudonym,type,aliases,notes\n", StandardCharsets.UTF_8);
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", noteJson("{}"));

        NoteTableData data = new NoteTableData("notes",
                List.of(new NoteTableRow("r1", Map.of("inhalt", "x"), 0)));

        assertThatThrownBy(() -> service.write("notes-2026-08-05T12-20-07Z.json", data))
                .isInstanceOf(NotPseudonymizableException.class);
    }

    @Test
    void writeDoesNotCreateNewFile() {
        NoteTableData data = new NoteTableData("notes", List.of());

        assertThatThrownBy(() -> service.write("notes-2026-01-01T00-00-00Z.json", data))
                .isInstanceOf(UnknownArchiveFileException.class);
        assertThat(archiveDir.resolve("notes-2026-01-01T00-00-00Z.json")).doesNotExist();
    }

    @Test
    void rejectsFileNamesOutsideTheZone() {
        assertThatThrownBy(() -> service.read("../../0_sources/notes/notes.json"))
                .isInstanceOf(UnknownArchiveFileException.class);
        assertThatThrownBy(() -> service.read("notes-x.json"))
                .isInstanceOf(UnknownArchiveFileException.class);
        assertThatThrownBy(() -> service.read("notes.json"))
                .isInstanceOf(UnknownArchiveFileException.class);
        assertThatThrownBy(() -> service.read("C:/Windows/System32/drivers/etc/hosts"))
                .isInstanceOf(UnknownArchiveFileException.class);
        assertThatThrownBy(() -> service.read(null))
                .isInstanceOf(UnknownArchiveFileException.class);
    }

    @Test
    void fsGuardStillBlocksIfNamePatternWereBypassed() {
        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        FsGuard guard = new FsGuard(properties);

        assertThatThrownBy(() -> guard.resolveWithinZone(
                "2_ai-ready/notes/../../0_sources/notes/notes.json", "2_ai-ready/notes"))
                .isInstanceOf(PathTraversalException.class);
    }
}
