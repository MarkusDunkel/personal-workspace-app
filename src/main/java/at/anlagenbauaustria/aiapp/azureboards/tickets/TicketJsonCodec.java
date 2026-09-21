package at.anlagenbauaustria.aiapp.azureboards.tickets;

import com.fasterxml.jackson.core.PrettyPrinter;
import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.core.util.Separators;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Liest und schreibt die Boards-as-Code-Split-Dateien
 * (2_ai-ready/azure_boards/json/&lt;projekt&gt;/*.json) BYTE-TREU.
 *
 * Das ist der heikelste Teil dieses Features. Die Dateien werden von der
 * Pipeline geschrieben und vom Nutzer versioniert; sie sind zugleich Eingang
 * des feldweisen 3-Wege-Merges (ai-vault merge_boards.py). Weicht unsere
 * Formatierung auch nur in einem Leerzeichen ab, erzeugt jedes Speichern ein
 * Diff ueber die GANZE Datei und stoert den Merge.
 *
 * Der verbindliche Vertrag steht in merge_boards.write_rows:
 *
 *     json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
 *     encoding="utf-8", newline="\n"
 *
 * Nachgemessen: alle 37 Bestandsdateien werden dadurch byte-identisch
 * reproduziert, und es kommen nur drei Escape-Sequenzen vor (\", \\, \n).
 *
 * Jacksons Voreinstellungen verfehlen diesen Vertrag an drei Stellen, deshalb
 * NICHT writerWithDefaultPrettyPrinter() verwenden (das Muster aus
 * NoteDataService passt hier nicht):
 *
 *   1. Trenner: Jackson schreibt " : ", Python ": ".
 *   2. Arrays: Jackson rueckt Array-Elemente gar nicht ein, Python mit 2.
 *   3. Zeilenende: Jacksons Default-Indenter ist plattformabhaengig (\r\n
 *      unter Windows) - das Vault-Repo hat core.autocrlf=true, ein \r wuerde
 *      die ganze Datei als geaendert erscheinen lassen.
 *
 * Nicht-ASCII bleibt roh (entspricht ensure_ascii=False), und "/" sowie
 * "&lt;", "&gt;", "&amp;" werden von beiden Seiten NICHT escaped - das deckt
 * der Roundtrip-Test ab.
 */
@Component
public class TicketJsonCodec {

    /** Ein Ticket: Feldname -&gt; Wert. LinkedHashMap haelt die Schluesselreihenfolge. */
    public static final TypeReference<List<LinkedHashMap<String, String>>> ROWS =
            new TypeReference<>() {};

    public static final String ID_FIELD = "System.Id";
    public static final String DESCRIPTION_FIELD = "System.Description";

    private final ObjectMapper objectMapper;

    public TicketJsonCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public List<LinkedHashMap<String, String>> readRows(String json) {
        try {
            return objectMapper.readValue(json, ROWS);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Ticket-Datei nicht lesen.", e);
        }
    }

    /**
     * Serialisiert exakt im Format der Pipeline, inklusive abschliessendem
     * Zeilenumbruch.
     */
    public String writeRows(List<LinkedHashMap<String, String>> rows) {
        try {
            return objectMapper.writer(pythonCompatiblePrinter()).writeValueAsString(rows) + "\n";
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Ticket-Datei nicht serialisieren.", e);
        }
    }

    private static PrettyPrinter pythonCompatiblePrinter() {
        // "\n" explizit, nicht DefaultIndenter.SYSTEM_LINEFEED_INSTANCE.
        DefaultIndenter indenter = new DefaultIndenter("  ", "\n");
        DefaultPrettyPrinter printer = new DefaultPrettyPrinter()
                .withObjectIndenter(indenter)
                .withArrayIndenter(indenter);
        // Python trennt Schluessel und Wert mit ": ", Jackson per Default
        // mit " : ".
        return printer.withSeparators(Separators.createDefaultInstance()
                .withObjectFieldValueSpacing(Separators.Spacing.AFTER));
    }
}
