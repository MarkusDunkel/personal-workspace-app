package at.anlagenbauaustria.aiapp.azureboards.tickets;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketDocument;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketSaveResult;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketSummary;
import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AzureTicketServiceTest {

    @TempDir
    Path aivaultRoot;

    private AzureTicketService service;
    private Path mainDir;

    /** Zwei Tickets, eines mit HTML- und eines mit Markdown-Beschreibung. */
    private static final String FILE_JSON = """
            [
              {
                "System.Id": "1",
                "System.Title": "Zeiterfassung",
                "System.Description": "## Roadmap-Historie<br>| Version |<br>|---|",
                "System.WorkItemType": "Themenbereich",
                "Custom.TaskSize": "L"
              },
              {
                "System.Id": "2",
                "System.Title": "Arbeitszeiterfassung",
                "System.Description": "<div>Link zum Lastenheft</div>",
                "System.WorkItemType": "Liefergegenstand",
                "Custom.TaskSize": ""
              }
            ]
            """;

    @BeforeEach
    void setUp() throws IOException {
        mainDir = aivaultRoot.resolve("2_ai-ready").resolve("azure_boards").resolve("json").resolve("main");
        Files.createDirectories(mainDir);
        Files.writeString(mainDir.resolve("1_zeiterfassung-tb.json"), FILE_JSON, StandardCharsets.UTF_8);

        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        service = new AzureTicketService(
                new FsGuard(properties),
                new AtomicFileWriter(),
                new TicketJsonCodec(new ObjectMapper()));
    }

    private String fileContent() throws IOException {
        return Files.readString(mainDir.resolve("1_zeiterfassung-tb.json"), StandardCharsets.UTF_8);
    }

    @Test
    void listReportsDialectAndRoadmapFlag() {
        List<TicketSummary> tickets = service.list(Category.MAIN);

        assertThat(tickets).extracting(TicketSummary::id).containsExactly("1", "2");
        TicketSummary first = tickets.get(0);
        assertThat(first.title()).isEqualTo("Zeiterfassung");
        assertThat(first.dialect()).isEqualTo(DescriptionDialect.MARKDOWN);
        assertThat(first.hasRoadmapHistory()).isTrue();
        assertThat(tickets.get(1).dialect()).isEqualTo(DescriptionDialect.HTML);
        assertThat(tickets.get(1).hasRoadmapHistory()).isFalse();
    }

    @Test
    void readReturnsTheRawDescription() {
        TicketDocument doc = service.read(Category.MAIN, "2");

        assertThat(doc.description()).isEqualTo("<div>Link zum Lastenheft</div>");
        assertThat(doc.dialect()).isEqualTo(DescriptionDialect.HTML);
        assertThat(doc.fileName()).isEqualTo("1_zeiterfassung-tb.json");
        assertThat(doc.revision()).isNotBlank();
    }

    @Test
    void unknownTicketIsRejected() {
        assertThatThrownBy(() -> service.read(Category.MAIN, "999"))
                .isInstanceOf(UnknownTicketException.class)
                .hasMessageContaining("999");
    }

    /**
     * Die Kernzusage: nur System.Description aendert sich. Alle uebrigen
     * Felder, auch das projektspezifische Custom.TaskSize, und die
     * Schluesselreihenfolge bleiben unangetastet.
     */
    @Test
    void writeChangesOnlyTheDescriptionOfTheTargetTicket() throws IOException {
        TicketDocument before = service.read(Category.MAIN, "2");

        service.writeDescription(Category.MAIN, "2", "<div>Neuer Text</div>",
                before.revision(), DescriptionDialect.HTML);

        String content = fileContent();
        assertThat(content).contains("<div>Neuer Text</div>");
        assertThat(content).doesNotContain("Link zum Lastenheft");
        // Nachbarticket und Zusatzfelder unveraendert.
        assertThat(content).contains("## Roadmap-Historie<br>| Version |<br>|---|");
        assertThat(content).contains("\"Custom.TaskSize\": \"L\"");
        assertThat(content).contains("\"System.Title\": \"Arbeitszeiterfassung\"");
        // Reihenfolge erhalten: Id steht weiterhin vor Title vor Description.
        assertThat(content.indexOf("\"System.Id\": \"2\""))
                .isLessThan(content.indexOf("\"System.Title\": \"Arbeitszeiterfassung\""));
    }

    /**
     * Oeffnen ohne Bearbeiten darf die Datei nicht beruehren - sonst liefe bei
     * jedem Blick ein Schreibvorgang bis nach Azure.
     */
    @Test
    void writingTheSameValueDoesNotTouchTheFile() throws IOException {
        TicketDocument before = service.read(Category.MAIN, "2");
        String contentBefore = fileContent();

        TicketSaveResult result = service.writeDescription(
                Category.MAIN, "2", before.description(), before.revision(), before.dialect());

        assertThat(result.changed()).isFalse();
        assertThat(result.revision()).isEqualTo(before.revision());
        assertThat(fileContent()).isEqualTo(contentBefore);
    }

    @Test
    void staleRevisionIsRejected() {
        assertThatThrownBy(() -> service.writeDescription(
                Category.MAIN, "2", "<div>x</div>", "0", DescriptionDialect.HTML))
                .isInstanceOf(TicketConflictException.class)
                .hasMessageContaining("neu laden");
    }

    /** Der Entwurf stammt aus einem anderen Format - nicht blind ueberschreiben. */
    @Test
    void changedDialectIsRejected() {
        TicketDocument doc = service.read(Category.MAIN, "2");

        assertThatThrownBy(() -> service.writeDescription(
                Category.MAIN, "2", "neuer Text", doc.revision(), DescriptionDialect.MARKDOWN))
                .isInstanceOf(TicketConflictException.class)
                .hasMessageContaining("Entwurf");
    }

    /**
     * Weicht das Dateiformat von unserer Serialisierung ab, wird NICHT
     * geschrieben - lieber ein abgelehnter Speichervorgang als ein Diff ueber
     * die ganze Datei, das den 3-Wege-Merge stoert.
     */
    @Test
    void refusesToWriteWhenTheFileFormatWouldDrift() throws IOException {
        // Vierfache Einrichtung statt zwei - gueltiges JSON, aber nicht das
        // Format der Pipeline.
        Files.writeString(mainDir.resolve("1_zeiterfassung-tb.json"),
                "[\n    {\n        \"System.Id\": \"1\",\n"
                        + "        \"System.Description\": \"x\"\n    }\n]\n",
                StandardCharsets.UTF_8);
        TicketDocument doc = service.read(Category.MAIN, "1");

        assertThatThrownBy(() -> service.writeDescription(
                Category.MAIN, "1", "y", doc.revision(), doc.dialect()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("nicht unveraendert");
    }

    /**
     * Eine Arbeitskopie mit CRLF darf das Speichern nicht blockieren.
     *
     * Das Vault-Repo steht auf core.autocrlf=true; Git und die
     * OneDrive-Synchronisation schreiben deshalb immer wieder CRLF in die
     * Dateien. Der Codec schreibt dagegen immer LF - ohne Normalisierung beim
     * Lesen konnte die Formattreue-Probe nie aufgehen, und jedes Speichern
     * scheiterte mit "laesst sich nicht unveraendert reproduzieren", obwohl an
     * der Serialisierung nichts falsch war.
     *
     * Nach dem Schreiben steht die Datei in der kanonischen LF-Form, die die
     * Pipeline ohnehin erwartet (merge_boards.write_rows, newline="\n").
     */
    @Test
    void crlfWorkingCopyCanStillBeSaved() throws IOException {
        Path file = mainDir.resolve("1_zeiterfassung-tb.json");
        Files.writeString(file, FILE_JSON.replace("\n", "\r\n"), StandardCharsets.UTF_8);
        TicketDocument doc = service.read(Category.MAIN, "2");

        TicketSaveResult result = service.writeDescription(
                Category.MAIN, "2", "<div>Neuer Text</div>", doc.revision(), doc.dialect());

        assertThat(result.changed()).isTrue();
        String content = fileContent();
        assertThat(content).contains("<div>Neuer Text</div>");
        assertThat(content).doesNotContain("\r\n");
        // Das Nachbarticket bleibt inhaltlich unangetastet.
        assertThat(content).contains("## Roadmap-Historie<br>| Version |<br>|---|");
    }

    @Test
    void emptyProjectDirectoryYieldsEmptyList() {
        assertThat(service.list(Category.COSTS)).isEmpty();
    }
}
