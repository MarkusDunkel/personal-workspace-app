package at.anlagenbauaustria.aiapp.azureboards.tickets;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketDocument;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketField;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketSaveResult;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketSummary;
import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.config.AzureBoardsProperties;
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
    private Path technicalDir;

    /**
     * Zwei technical-Tickets: eine User Story (mit Acceptance Criteria, wie im
     * Bestand als HTML) und ein Epic, das den Schluessel zwar traegt, ihn aber
     * leer laesst - dort darf das Feld nicht angeboten werden.
     */
    private static final String TECHNICAL_JSON = """
            [
              {
                "System.Id": "350",
                "System.Title": "Keycloak-Konzept",
                "System.Description": "Als Entwickler moechte ich ...",
                "System.WorkItemType": "User Story",
                "Microsoft.VSTS.Common.AcceptanceCriteria": "<div><ul><li>Konzept liegt vor</li></ul></div>"
              },
              {
                "System.Id": "349",
                "System.Title": "Authentication",
                "System.Description": "## Ueberblick",
                "System.WorkItemType": "Epic",
                "Microsoft.VSTS.Common.AcceptanceCriteria": ""
              }
            ]
            """;

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
        Path json = aivaultRoot.resolve("2_ai-ready").resolve("azure_boards").resolve("json");
        mainDir = json.resolve("main");
        Files.createDirectories(mainDir);
        Files.writeString(mainDir.resolve("1_zeiterfassung-tb.json"), FILE_JSON, StandardCharsets.UTF_8);
        technicalDir = json.resolve("technical");
        Files.createDirectories(technicalDir);
        Files.writeString(technicalDir.resolve("349_authentication.json"), TECHNICAL_JSON, StandardCharsets.UTF_8);

        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        service = new AzureTicketService(
                new FsGuard(properties),
                new AtomicFileWriter(),
                new TicketJsonCodec(new ObjectMapper()),
                new AzureBoardsProperties());
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

    // ---------------------------------------------------------------------
    // Verlinkung ins Original
    // ---------------------------------------------------------------------

    /**
     * Der Projektname traegt ein Leerzeichen und muss als "%20" erscheinen -
     * NICHT als "+". URLEncoder.encode kodiert fuer Formulardaten und lieferte
     * hier "Digital+Transformation"; im Pfad ist "+" ein gewoehnliches Zeichen,
     * und der Link zeigte auf ein Projekt, das es nicht gibt.
     */
    @Test
    void azureUrlEncodesTheProjectNameForAPath() {
        TicketDocument doc = service.read(Category.MAIN, "2");

        assertThat(doc.azureUrl()).isEqualTo(
                "https://dev.azure.com/anlagenbau-austria/Digital%20Transformation"
                        + "/_workitems/edit/2");
        assertThat(doc.azureUrl()).doesNotContain("+");
    }

    /** Jede Kategorie zeigt auf ihr eigenes Azure-Projekt. */
    @Test
    void azureUrlUsesTheProjectOfTheCategory() {
        assertThat(service.read(Category.TECHNICAL, "350").azureUrl())
                .isEqualTo("https://dev.azure.com/anlagenbau-austria/Technische%20Entwicklung"
                        + "/_workitems/edit/350");
    }

    // ---------------------------------------------------------------------
    // Zuschnitt der bearbeitbaren Felder (EditableField)
    // ---------------------------------------------------------------------

    /**
     * Ausserhalb von technical gibt es nur die Beschreibung. Die Acceptance
     * Criteria existiert in main gar nicht als Schluessel - sie anzubieten
     * hiesse, einen neuen in die Datei zu schreiben.
     */
    @Test
    void mainOffersOnlyTheDescription() {
        TicketDocument doc = service.read(Category.MAIN, "2");

        assertThat(doc.fields()).extracting(TicketField::field)
                .containsExactly(EditableField.DESCRIPTION);
    }

    /**
     * Der Kern der Erweiterung: User Story in technical bekommt beide Felder,
     * in dieser Reihenfolge - Beschreibung zuerst, Acceptance Criteria darunter.
     */
    @Test
    void technicalUserStoryOffersDescriptionAndAcceptanceCriteria() {
        TicketDocument doc = service.read(Category.TECHNICAL, "350");

        assertThat(doc.fields()).extracting(TicketField::field)
                .containsExactly(EditableField.DESCRIPTION, EditableField.ACCEPTANCE_CRITERIA);
        assertThat(doc.fields().get(1).value())
                .isEqualTo("<div><ul><li>Konzept liegt vor</li></ul></div>");
    }

    /**
     * Der Dialekt gilt JE FELD. Hier ist die Beschreibung Text und die
     * Acceptance Criteria HTML - am Bestand von technical der Normalfall.
     * Ein gemeinsamer Dialekt schickte eines der beiden in den falschen Editor.
     */
    @Test
    void dialectIsDeterminedPerField() {
        TicketDocument doc = service.read(Category.TECHNICAL, "350");

        assertThat(doc.fields().get(0).dialect()).isEqualTo(DescriptionDialect.PLAIN);
        assertThat(doc.fields().get(1).dialect()).isEqualTo(DescriptionDialect.HTML);
    }

    /** Ein Epic ist keine User Story - auch mit vorhandenem Schluessel. */
    @Test
    void technicalEpicOffersOnlyTheDescription() {
        TicketDocument doc = service.read(Category.TECHNICAL, "349");

        assertThat(doc.fields()).extracting(TicketField::field)
                .containsExactly(EditableField.DESCRIPTION);
    }

    /**
     * Dieselbe Zusage wie fuer die Beschreibung: geschrieben wird genau EIN
     * Feld, der Rest der Datei bleibt unangetastet.
     */
    @Test
    void writesAcceptanceCriteriaWithoutTouchingTheDescription() throws IOException {
        TicketDocument before = service.read(Category.TECHNICAL, "350");

        TicketSaveResult result = service.writeField(
                Category.TECHNICAL, "350", EditableField.ACCEPTANCE_CRITERIA,
                "<div><ul><li>Neu abgenommen</li></ul></div>",
                before.revision(), DescriptionDialect.HTML);

        assertThat(result.changed()).isTrue();
        String content = Files.readString(
                technicalDir.resolve("349_authentication.json"), StandardCharsets.UTF_8);
        assertThat(content).contains("<div><ul><li>Neu abgenommen</li></ul></div>");
        assertThat(content).doesNotContain("Konzept liegt vor");
        // Beschreibung und Nachbarticket unveraendert.
        assertThat(content).contains("Als Entwickler moechte ich ...");
        assertThat(content).contains("\"System.Title\": \"Authentication\"");
    }

    /**
     * Der Zuschnitt haelt auch am Dienst, nicht nur in der Oberflaeche: ein
     * vorhandener, aber nicht freigegebener Schluessel wird nicht geschrieben.
     */
    @Test
    void acceptanceCriteriaOfAnEpicIsRejected() {
        TicketDocument doc = service.read(Category.TECHNICAL, "349");

        assertThatThrownBy(() -> service.writeField(
                Category.TECHNICAL, "349", EditableField.ACCEPTANCE_CRITERIA, "<div>x</div>",
                doc.revision(), DescriptionDialect.EMPTY))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("nicht zur Bearbeitung");
    }

    /** In main ist das Feld ueberhaupt nicht vorgesehen. */
    @Test
    void acceptanceCriteriaInMainIsRejected() {
        TicketDocument doc = service.read(Category.MAIN, "2");

        assertThatThrownBy(() -> service.writeField(
                Category.MAIN, "2", EditableField.ACCEPTANCE_CRITERIA, "x",
                doc.revision(), DescriptionDialect.EMPTY))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("nicht zur Bearbeitung");
    }
}
