package at.anlagenbauaustria.aiapp.azureboards.tickets;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketDocument;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketSaveResult;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketSummary;
import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
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
import java.util.stream.Stream;

/**
 * Liest und schreibt einzelne Azure-Boards-Tickets in
 * 2_ai-ready/azure_boards/json/&lt;projekt&gt;/.
 *
 * Aufgebaut wie WorkspaceService (Zone, FsGuard, AtomicFileWriter, Revision),
 * mit einem wesentlichen Unterschied: ein Ticket ist keine Datei, sondern ein
 * Element eines JSON-Arrays. Geschrieben wird deshalb immer die ganze Datei -
 * und genau deswegen muss sie byte-genau so herauskommen, wie sie hereinkam
 * (siehe TicketJsonCodec).
 *
 * Geaendert wird ausschliesslich System.Description. Alle uebrigen Felder,
 * auch projektspezifische wie Custom.Kosten oder AcceptanceCriteria und selbst
 * unbekannte, laufen unveraendert durch - sie werden nie deserialisiert,
 * sondern als String-Map durchgereicht.
 *
 * Dieser Dienst ist bewusst KEIN zweiter Weg nach Azure: er schreibt nur in
 * die KI-Zone, von wo der bestehende Weg (run_reidentify.sh, run_import.sh)
 * unveraendert weiterfuehrt. Der feldweise 3-Wege-Merge in ai-vault
 * (merge_boards.py) ist genau darauf ausgelegt, lokale Edits an dieser Stelle
 * zu bewahren.
 */
@Service
public class AzureTicketService {

    private static final String ZONE = "2_ai-ready/azure_boards/json";
    private static final String EXTENSION = ".json";
    /** Schluessel, den der 3-Wege-Merge bei Konflikten setzt. */
    private static final String CONFLICT_FIELD = "_conflicts";
    private static final String TITLE_FIELD = "System.Title";
    private static final String TYPE_FIELD = "System.WorkItemType";
    /** Ueberschrift der Tabellen, die die stakeholder-html-Pipeline auswertet. */
    private static final String ROADMAP_MARKER = "Roadmap-Historie";

    private final FsGuard fsGuard;
    private final AtomicFileWriter atomicFileWriter;
    private final TicketJsonCodec codec;

    public AzureTicketService(FsGuard fsGuard, AtomicFileWriter atomicFileWriter, TicketJsonCodec codec) {
        this.fsGuard = fsGuard;
        this.atomicFileWriter = atomicFileWriter;
        this.codec = codec;
    }

    /** Alle Tickets eines Projekts, nach Id sortiert (numerisch, wo moeglich). */
    public List<TicketSummary> list(Category category) {
        List<TicketSummary> summaries = new ArrayList<>();
        for (Path file : projectFiles(category)) {
            String fileName = file.getFileName().toString();
            for (LinkedHashMap<String, String> row : codec.readRows(read(file))) {
                summaries.add(new TicketSummary(
                        value(row, TicketJsonCodec.ID_FIELD),
                        value(row, TITLE_FIELD),
                        value(row, TYPE_FIELD),
                        fileName,
                        DescriptionDialect.of(row.get(TicketJsonCodec.DESCRIPTION_FIELD)),
                        hasRoadmapHistory(row),
                        row.containsKey(CONFLICT_FIELD)));
            }
        }
        summaries.sort(Comparator.comparing(TicketSummary::id, AzureTicketService::compareIds));
        return summaries;
    }

    public TicketDocument read(Category category, String ticketId) {
        Located located = locate(category, ticketId);
        LinkedHashMap<String, String> row = located.row();
        return new TicketDocument(
                value(row, TicketJsonCodec.ID_FIELD),
                value(row, TITLE_FIELD),
                value(row, TYPE_FIELD),
                located.file().getFileName().toString(),
                DescriptionDialect.of(row.get(TicketJsonCodec.DESCRIPTION_FIELD)),
                hasRoadmapHistory(row),
                row.containsKey(CONFLICT_FIELD),
                value(row, TicketJsonCodec.DESCRIPTION_FIELD),
                revisionOf(located.file()));
    }

    /**
     * Schreibt eine neue Beschreibung - und nur die.
     *
     * Drei Sicherungen, in dieser Reihenfolge:
     *
     * 1. Revision: hat sich die Datei seit dem Laden geaendert, wird
     *    abgelehnt (409) statt fremde Aenderungen zu ueberschreiben.
     * 2. Dialekt: hat das Feld inzwischen das Format gewechselt, ebenfalls
     *    Ablehnung - der Entwurf stammt dann aus einer anderen Welt.
     * 3. Byte-Identitaet: ist der Wert unveraendert, wird die Datei GAR NICHT
     *    angefasst. Oeffnen ohne Bearbeiten darf keine Aenderung erzeugen,
     *    sonst liefe bei jedem Blick ein Schreibvorgang bis nach Azure
     *    (vgl. den Identitaets-Guard in DESCRIPTION-FORMAT.md).
     *
     * Zusaetzlich die Formattreue-Probe: bevor irgendetwas geschrieben wird,
     * muss der UNVERAENDERTE Datenstand byte-identisch reproduzierbar sein.
     * Ist er das nicht, weicht unsere Serialisierung vom Pipeline-Format ab -
     * dann lieber gar nicht schreiben als ein Diff ueber die ganze Datei zu
     * erzeugen und den 3-Wege-Merge zu stoeren.
     */
    public TicketSaveResult writeDescription(
            Category category, String ticketId, String description,
            String expectedRevision, DescriptionDialect expectedDialect) {

        Located located = locate(category, ticketId);
        Path file = located.file();

        String currentRevision = revisionOf(file);
        if (expectedRevision != null && !expectedRevision.equals(currentRevision)) {
            throw new TicketConflictException(
                    "Die Datei " + file.getFileName() + " wurde seit dem Laden geaendert"
                            + " (vermutlich durch einen Pipeline-Lauf oder in VS Code)."
                            + " Bitte neu laden - sonst gingen die fremden Aenderungen verloren.");
        }

        LinkedHashMap<String, String> row = located.row();
        String current = row.get(TicketJsonCodec.DESCRIPTION_FIELD);
        DescriptionDialect currentDialect = DescriptionDialect.of(current);
        if (expectedDialect != null && expectedDialect != currentDialect) {
            throw new TicketConflictException(
                    "Das Beschreibungsfeld von Ticket " + ticketId + " liegt inzwischen als "
                            + currentDialect + " vor, der Entwurf stammt aus " + expectedDialect
                            + ". Bitte neu laden.");
        }

        String next = description == null ? "" : description;
        if (next.equals(current == null ? "" : current)) {
            return new TicketSaveResult(false, currentRevision);
        }
        if (!row.containsKey(TicketJsonCodec.DESCRIPTION_FIELD)) {
            throw new IllegalStateException(
                    "Ticket " + ticketId + " hat kein Feld " + TicketJsonCodec.DESCRIPTION_FIELD
                            + " - ein neues Feld wuerde an falscher Stelle einsortiert.");
        }

        String raw = read(file);
        List<LinkedHashMap<String, String>> rows = codec.readRows(raw);
        if (!codec.writeRows(rows).equals(raw)) {
            throw new IllegalStateException(
                    "Die Datei " + file.getFileName() + " laesst sich nicht unveraendert"
                            + " reproduzieren - Speichern abgelehnt, da es ein Diff ueber die"
                            + " ganze Datei erzeugen und den 3-Wege-Merge stoeren wuerde.");
        }

        // put auf einen vorhandenen Schluessel behaelt dessen Position.
        rows.stream()
                .filter(r -> ticketId.equals(r.get(TicketJsonCodec.ID_FIELD)))
                .findFirst()
                .orElseThrow(() -> new UnknownTicketException(category, ticketId))
                .put(TicketJsonCodec.DESCRIPTION_FIELD, next);

        atomicWrite(file, codec.writeRows(rows));
        return new TicketSaveResult(true, revisionOf(file));
    }

    // ---------------------------------------------------------------------
    // intern
    // ---------------------------------------------------------------------

    private record Located(Path file, LinkedHashMap<String, String> row) {}

    /**
     * Sucht die Datei zu einer Id. Bewusst OHNE Zwischenspeicher: die Pipeline
     * schreibt das Verzeichnis zwischendurch komplett neu, ein Index waere
     * genau dann veraltet, wenn es darauf ankommt.
     */
    private Located locate(Category category, String ticketId) {
        for (Path file : projectFiles(category)) {
            for (LinkedHashMap<String, String> row : codec.readRows(read(file))) {
                if (ticketId.equals(row.get(TicketJsonCodec.ID_FIELD))) {
                    return new Located(file, row);
                }
            }
        }
        throw new UnknownTicketException(category, ticketId);
    }

    private List<Path> projectFiles(Category category) {
        Path dir = fsGuard.resolveWithinZone(ZONE + "/" + category.segment(), ZONE);
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (Stream<Path> entries = Files.list(dir)) {
            return entries
                    .filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith(EXTENSION))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte " + dir + " nicht auflisten.", e);
        }
    }

    /**
     * Liest eine Ticket-Datei und normalisiert dabei CRLF zu LF.
     *
     * Das kanonische Format der Pipeline ist LF - merge_boards.write_rows
     * oeffnet die Datei ausdruecklich mit newline="\n". Das Vault-Repo steht
     * aber auf core.autocrlf=true, und Git wie auch die OneDrive-Synchronisation
     * schreiben deshalb gelegentlich CRLF in die Arbeitskopie.
     *
     * Ohne diese Normalisierung scheiterte die Formattreue-Probe in
     * writeDescription an genau diesen Dateien: der Codec schreibt immer LF,
     * die Datei auf der Platte trug CRLF, und damit konnte der Vergleich nie
     * aufgehen - Speichern war dann dauerhaft abgelehnt, obwohl die
     * Serialisierung fehlerfrei ist. Die Probe soll die Serialisierung pruefen,
     * nicht den Zufallszustand der Arbeitskopie.
     *
     * Der Zeilenumbruch bleibt damit nicht etwa unbeachtet, sondern wird
     * angeglichen: Wird die Datei spaeter geschrieben, steht sie danach in der
     * kanonischen LF-Form, die die Pipeline ohnehin erwartet.
     */
    private static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n");
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Ticket-Datei nicht lesen: " + file, e);
        }
    }

    private void atomicWrite(Path file, String content) {
        try {
            atomicFileWriter.writeUtf8(file, content);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Ticket-Datei nicht schreiben: " + file, e);
        }
    }

    /** Wie WorkspaceService.revisionOf: Aenderungszeit als opaker String. */
    private static String revisionOf(Path file) {
        try {
            return Long.toString(Files.getLastModifiedTime(file).toMillis());
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Aenderungszeit nicht lesen: " + file, e);
        }
    }

    private static boolean hasRoadmapHistory(LinkedHashMap<String, String> row) {
        String description = row.get(TicketJsonCodec.DESCRIPTION_FIELD);
        return description != null && description.contains(ROADMAP_MARKER);
    }

    private static String value(LinkedHashMap<String, String> row, String key) {
        String raw = row.get(key);
        return raw == null ? "" : raw;
    }

    /** Numerisch, wo beide Ids Zahlen sind - sonst lexikografisch. */
    private static int compareIds(String left, String right) {
        try {
            return Long.compare(Long.parseLong(left), Long.parseLong(right));
        } catch (NumberFormatException e) {
            return left.compareTo(right);
        }
    }
}
