package at.anlagenbauaustria.aiapp.azureboards.tickets;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Der wichtigste Test dieses Features: Lesen und unveraendertes
 * Zurueckschreiben JEDER echten Ticket-Datei muss byte-identisch sein.
 *
 * Warum das zaehlt: 2_ai-ready ist ein vom Nutzer versioniertes Git-Repo und
 * zugleich Eingang des feldweisen 3-Wege-Merges (ai-vault merge_boards.py).
 * Weicht unsere Serialisierung auch nur in einem Leerzeichen ab, erzeugt jedes
 * Speichern ein Diff ueber die ganze Datei und stoert den Merge.
 *
 * Laeuft gegen das ECHTE Vault, weil nur dort die Bandbreite der Wirklichkeit
 * steht (Umlaute, &lt;/&gt;/&amp;, eingebettete Anfuehrungszeichen,
 * Zeilenumbrueche in Werten). Fehlt das Vault, ueberspringt sich der Test
 * selbst, statt rot zu werden.
 */
class TicketJsonCodecRoundtripTest {

    private static final Path VAULT_JSON_DIR = Path.of(
            System.getProperty("user.home"),
            "OneDrive - Anlagenbau Austria GmbH", "ai-vault",
            "2_ai-ready", "azure_boards", "json");

    private final TicketJsonCodec codec = new TicketJsonCodec(new ObjectMapper());

    private static List<Path> ticketFiles() throws IOException {
        Assumptions.assumeTrue(Files.isDirectory(VAULT_JSON_DIR),
                "ai-vault nicht vorhanden - Roundtrip-Test uebersprungen");
        try (Stream<Path> paths = Files.walk(VAULT_JSON_DIR)) {
            return paths.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .sorted()
                    .toList();
        }
    }

    @Test
    void everyRealFileRoundTripsByteIdentical() throws IOException {
        List<Path> files = ticketFiles();
        assertThat(files).as("Ticket-Dateien im Vault").isNotEmpty();

        List<String> differing = new ArrayList<>();
        for (Path file : files) {
            // CRLF vor dem Vergleich zu LF normalisieren: das Vault-Repo hat
            // core.autocrlf=true, und Git bzw. die OneDrive-Synchronisation
            // schreiben gelegentlich CRLF in die Arbeitskopie. Das ist eine
            // Eigenheit der Arbeitsumgebung, kein Fehler des Codecs - der
            // schreibt selbst immer "\n" (siehe merge_boards.write_rows, das
            // ausdruecklich newline="\n" verlangt). Ohne diese Normalisierung
            // schlaegt der Test je nach Zustand der Arbeitskopie fehl und sagt
            // nichts mehr ueber die Serialisierung aus.
            String raw = Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n");
            if (!codec.writeRows(codec.readRows(raw)).equals(raw)) {
                differing.add(file.getFileName().toString());
            }
        }

        assertThat(differing)
                .as("Dateien, die NICHT byte-identisch zurueckgeschrieben werden "
                        + "(geprueft: %d)", files.size())
                .isEmpty();
    }

    /**
     * Die eigentliche Schreiboperation im Kleinen: ein Feld aendern, alles
     * andere muss Zeichen fuer Zeichen stehen bleiben. Geprueft ueber den
     * Zeilen-Diff - erlaubt ist genau eine geaenderte Zeile.
     */
    @Test
    void changingOneDescriptionChangesExactlyOneLine() throws IOException {
        List<Path> files = ticketFiles();
        Path file = files.stream()
                .filter(TicketJsonCodecRoundtripTest::hasSingleLineDescription)
                .findFirst()
                .orElseThrow(() -> new AssertionError("keine geeignete Testdatei gefunden"));

        String raw = Files.readString(file, StandardCharsets.UTF_8);
        List<LinkedHashMap<String, String>> rows = codec.readRows(raw);
        LinkedHashMap<String, String> target = rows.stream()
                .filter(r -> {
                    String d = r.get(TicketJsonCodec.DESCRIPTION_FIELD);
                    return d != null && !d.isBlank() && !d.contains("\n");
                })
                .findFirst()
                .orElseThrow();
        target.put(TicketJsonCodec.DESCRIPTION_FIELD, "Neuer Text ohne Sonderzeichen");

        String[] before = raw.split("\n", -1);
        String[] after = codec.writeRows(rows).split("\n", -1);

        assertThat(after.length).as("Zeilenanzahl bleibt gleich").isEqualTo(before.length);
        int changed = 0;
        for (int i = 0; i < before.length; i++) {
            if (!before[i].equals(after[i])) {
                changed++;
            }
        }
        assertThat(changed).as("genau eine geaenderte Zeile").isEqualTo(1);
    }

    private static boolean hasSingleLineDescription(Path file) {
        try {
            String raw = Files.readString(file, StandardCharsets.UTF_8);
            return raw.contains("\"System.Description\"")
                    && new TicketJsonCodec(new ObjectMapper()).readRows(raw).stream()
                    .anyMatch(r -> {
                        String d = r.get(TicketJsonCodec.DESCRIPTION_FIELD);
                        return d != null && !d.isBlank() && !d.contains("\n");
                    });
        } catch (IOException e) {
            return false;
        }
    }
}
