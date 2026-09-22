package at.anlagenbauaustria.aiapp.azureboards.tickets;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketBaseline;
import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.config.AzureBoardsProperties;
import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.git.GitCommandRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assumptions.assumeThat;

/**
 * Prueft den Vergleichsstand gegen ein echtes, im Test angelegtes
 * git-Repository.
 *
 * Bewusst KEIN Mock von GitCommandRunner: gerade das Zusammenspiel mit git
 * ist hier der Gegenstand - Pfadaufloesung unter Windows, Verhalten bei
 * unversionierten Dateien, Zeichenkodierung. Ein Mock wuerde genau das
 * wegabstrahieren, was schiefgehen kann.
 *
 * Ohne git im PATH werden die Tests uebersprungen statt rot - auf einem
 * Rechner ohne git ist die Aussage dieser Tests schlicht nicht zu treffen.
 */
class TicketBaselineServiceTest {

    @TempDir
    Path aivaultRoot;

    private TicketBaselineService baselines;
    private Path technicalDir;
    private Path ticketFile;

    private static final String COMMITTED_JSON = """
            [
              {
                "System.Id": "577",
                "System.Title": "test ticket",
                "System.Description": "## Ziel\\n\\nErster Stand mit Umlauten: Arbeitszeit, Verguetung.",
                "System.WorkItemType": "User Story",
                "Microsoft.VSTS.Common.AcceptanceCriteria": "* [ ] Erste Bedingung"
              }
            ]
            """;

    @BeforeEach
    void setUp() throws Exception {
        assumeThat(gitAvailable()).as("git im PATH").isTrue();

        Path zone = aivaultRoot.resolve("2_ai-ready");
        technicalDir = zone.resolve("azure_boards").resolve("json").resolve("technical");
        Files.createDirectories(technicalDir);
        ticketFile = technicalDir.resolve("577_test.json");
        Files.writeString(ticketFile, COMMITTED_JSON, StandardCharsets.UTF_8);

        // Das Repo liegt auf der Zone, nicht auf dem Vault-Wurzelverzeichnis -
        // genau wie im Echtbetrieb, wo 2_ai-ready ein eigenes, im ai-vault
        // verschachteltes Repository ist.
        git(zone, "init", "-q");
        git(zone, "config", "user.email", "test@example.com");
        git(zone, "config", "user.name", "Test");
        git(zone, "add", ".");
        git(zone, "commit", "-q", "-m", "erster Stand");

        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        AzureTicketService tickets = new AzureTicketService(
                new FsGuard(properties),
                new AtomicFileWriter(),
                new TicketJsonCodec(new ObjectMapper()),
                new AzureBoardsProperties());
        baselines = new TicketBaselineService(
                tickets, new GitCommandRunner(), new TicketJsonCodec(new ObjectMapper()));
    }

    @Test
    void liefertDenStandDesLetztenCommits() throws IOException {
        // Arbeitskopie aendern - der Vergleichsstand muss den ALTEN Wert zeigen.
        Files.writeString(
                ticketFile,
                COMMITTED_JSON.replace("Erster Stand", "Zweiter Stand"),
                StandardCharsets.UTF_8);

        TicketBaseline baseline = baselines.baseline(Category.TECHNICAL, "577", BaselineRef.HEAD);

        assertThat(baseline.available()).isTrue();
        assertThat(baseline.reason()).isNull();
        assertThat(baseline.fields())
                .extracting(f -> f.field().name())
                .containsExactly("DESCRIPTION", "ACCEPTANCE_CRITERIA");
        assertThat(baseline.fields().get(0).value())
                .contains("Erster Stand")
                .doesNotContain("Zweiter Stand");
    }

    /**
     * Die Umlaute muessen den Weg durch git unbeschadet ueberstehen.
     *
     * Ohne ausdrueckliches UTF-8 beim Lesen der Prozessausgabe kaeme unter
     * Windows cp1252 zum Zug; aus "Verguetung" wuerde ein Ersatzzeichen - und
     * zwar NUR im Vergleichsstand. Die Folge waere keine Fehlermeldung,
     * sondern eine gruene Markierung auf jedem Wort mit Umlaut.
     */
    @Test
    void behaeltUmlauteImVergleichsstand() {
        TicketBaseline baseline = baselines.baseline(Category.TECHNICAL, "577", BaselineRef.HEAD);

        assertThat(baseline.available()).isTrue();
        assertThat(baseline.fields().get(0).value()).contains("Arbeitszeit, Verguetung");
    }

    @Test
    void unveraendertesTicketLiefertDenGleichenWert() throws IOException {
        TicketBaseline baseline = baselines.baseline(Category.TECHNICAL, "577", BaselineRef.HEAD);

        String current = new TicketJsonCodec(new ObjectMapper())
                .readRows(Files.readString(ticketFile, StandardCharsets.UTF_8))
                .get(0)
                .get("System.Description");

        assertThat(baseline.fields().get(0).value()).isEqualTo(current);
    }

    /** Neue, noch nie committete Datei: kein Vergleichsstand, aber kein Fehler. */
    @Test
    void unversionierteDateiMeldetNichtVerfuegbar() throws IOException {
        Files.writeString(
                technicalDir.resolve("900_neu.json"),
                COMMITTED_JSON.replace("\"577\"", "\"900\""),
                StandardCharsets.UTF_8);

        TicketBaseline baseline = baselines.baseline(Category.TECHNICAL, "900", BaselineRef.HEAD);

        assertThat(baseline.available()).isFalse();
        assertThat(baseline.reason()).isEqualTo("Datei ist nicht versioniert.");
        assertThat(baseline.fields()).isEmpty();
    }

    /**
     * Ticket in einer versionierten Datei, das es im letzten Commit noch nicht
     * gab: verfuegbar, aber mit leeren Werten - dann gilt alles als neu.
     */
    @Test
    void neuesTicketInBekannterDateiLiefertLeereWerte() throws IOException {
        String withSecond = COMMITTED_JSON.replace("""
                  }
                ]
                """, """
                  },
                  {
                    "System.Id": "578",
                    "System.Title": "spaeter dazugekommen",
                    "System.Description": "Ganz neu",
                    "System.WorkItemType": "User Story",
                    "Microsoft.VSTS.Common.AcceptanceCriteria": "* [ ] neu"
                  }
                ]
                """);
        Files.writeString(ticketFile, withSecond, StandardCharsets.UTF_8);

        TicketBaseline baseline = baselines.baseline(Category.TECHNICAL, "578", BaselineRef.HEAD);

        assertThat(baseline.available()).isTrue();
        assertThat(baseline.fields()).isNotEmpty();
        assertThat(baseline.fields()).allSatisfy(f -> assertThat(f.value()).isEmpty());
    }

    /** Kein Repository ueberhaupt - haeufigster Fall auf einer frischen Maschine. */
    @Test
    void ohneRepositoryMeldetNichtVerfuegbar(@TempDir Path bare) throws Exception {
        Path zone = bare.resolve("2_ai-ready");
        Path dir = zone.resolve("azure_boards").resolve("json").resolve("technical");
        Files.createDirectories(dir);
        Files.writeString(dir.resolve("577_test.json"), COMMITTED_JSON, StandardCharsets.UTF_8);

        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(bare);
        AzureTicketService tickets = new AzureTicketService(
                new FsGuard(properties),
                new AtomicFileWriter(),
                new TicketJsonCodec(new ObjectMapper()),
                new AzureBoardsProperties());
        TicketBaselineService service = new TicketBaselineService(
                tickets, new GitCommandRunner(), new TicketJsonCodec(new ObjectMapper()));

        TicketBaseline baseline = service.baseline(Category.TECHNICAL, "577", BaselineRef.HEAD);

        // Je nachdem, ob das TempDir zufaellig unterhalb eines Repositorys
        // liegt, meldet git "kein Repository" oder "nicht versioniert" -
        // beides ist hier richtig, entscheidend ist die Degradation ohne
        // Ausnahme.
        assertThat(baseline.available()).isFalse();
        assertThat(baseline.reason()).isNotBlank();
    }

    /** Der Vormerkbereich ist ein eigener Stand und muss abrufbar sein. */
    @Test
    void indexAlsVergleichsstand() throws Exception {
        Path zone = aivaultRoot.resolve("2_ai-ready");
        Files.writeString(
                ticketFile,
                COMMITTED_JSON.replace("Erster Stand", "Vorgemerkter Stand"),
                StandardCharsets.UTF_8);
        git(zone, "add", ".");
        Files.writeString(
                ticketFile,
                COMMITTED_JSON.replace("Erster Stand", "Nur im Arbeitsverzeichnis"),
                StandardCharsets.UTF_8);

        TicketBaseline head = baselines.baseline(Category.TECHNICAL, "577", BaselineRef.HEAD);
        TicketBaseline index = baselines.baseline(Category.TECHNICAL, "577", BaselineRef.INDEX);

        assertThat(head.fields().get(0).value()).contains("Erster Stand");
        assertThat(index.fields().get(0).value()).contains("Vorgemerkter Stand");
    }

    // ---------------------------------------------------------------------

    private static void git(Path dir, String... args) throws Exception {
        String[] command = new String[args.length + 1];
        command[0] = "git";
        System.arraycopy(args, 0, command, 1, args.length);
        Process process = new ProcessBuilder(command)
                .directory(dir.toFile())
                .redirectErrorStream(true)
                .start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        if (!process.waitFor(30, TimeUnit.SECONDS) || process.exitValue() != 0) {
            process.destroyForcibly();
            throw new IllegalStateException(
                    "git " + String.join(" ", args) + " fehlgeschlagen: " + output);
        }
    }

    private static boolean gitAvailable() {
        try {
            Process process = new ProcessBuilder(List.of("git", "--version")).start();
            return process.waitFor(30, TimeUnit.SECONDS) && process.exitValue() == 0;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return false;
        }
    }
}
