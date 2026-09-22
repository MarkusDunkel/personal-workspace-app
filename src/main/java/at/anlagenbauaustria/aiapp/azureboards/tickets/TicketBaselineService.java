package at.anlagenbauaustria.aiapp.azureboards.tickets;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketBaseline;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketBaselineField;
import at.anlagenbauaustria.aiapp.git.GitCommandRunner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;

/**
 * Liefert den Stand der Ticketfelder aus der Versionsverwaltung, damit der
 * Editor zeigen kann, was seit dem letzten Commit geaendert wurde.
 *
 * Der Kniff, auf dem das ganze Feature steht: "git show HEAD:&lt;datei&gt;"
 * liefert die GANZE Ticketdatei im Stand des letzten Commits. Parst man sie
 * mit demselben TicketJsonCodec wie die Arbeitskopie und sucht die Zeile mit
 * derselben System.Id, bekommt man den Feldwert von damals als schlichten
 * String.
 *
 * Damit wird aus "ein Zeilendiff ueber eine JSON-Datei muss auf formatierten
 * Text abgebildet werden" ein Textvergleich zweier Zeichenketten je Feld. Die
 * Zeilennummern der Datei spielen nirgends mehr eine Rolle - und genau das
 * macht den Unterschied, denn ein Ticketfeld ist in der Datei EINE Zeile mit
 * maskierten Zeilenumbruechen und waere im git-Diff ohnehin unlesbar.
 *
 * Dieser Dienst ist ausschliesslich LESEND. Er kennt weder AtomicFileWriter
 * noch sonst einen Weg, etwas zu schreiben, und git wird nur mit "show" und
 * "rev-parse" aufgerufen. Das Repository gehoert dem Nutzer; hier wird nichts
 * vorgemerkt und nichts committet.
 *
 * Fehlt der Vergleichsstand, ist das KEIN Fehler, sondern ein normaler
 * Zustand (unversionierte Datei, frisches Repository, git nicht vorhanden).
 * Dann kommt available=false zurueck und die Oberflaeche markiert nichts.
 */
@Service
public class TicketBaselineService {

    private static final Logger log = LoggerFactory.getLogger(TicketBaselineService.class);

    private static final String TYPE_FIELD = "System.WorkItemType";

    private final AzureTicketService tickets;
    private final GitCommandRunner git;
    private final TicketJsonCodec codec;

    public TicketBaselineService(
            AzureTicketService tickets, GitCommandRunner git, TicketJsonCodec codec) {
        this.tickets = tickets;
        this.git = git;
        this.codec = codec;
    }

    public TicketBaseline baseline(Category category, String ticketId, BaselineRef ref) {
        // Wirft UnknownTicketException, wenn es das Ticket in der Arbeitskopie
        // nicht gibt - das ist ein echter Fehler und wird nicht zu
        // "kein Vergleichsstand" verharmlost.
        AzureTicketService.Located located = tickets.locate(category, ticketId);
        Path file = located.file();

        Optional<Path> repoRoot = git.toplevel(file.getParent());
        if (repoRoot.isEmpty()) {
            return TicketBaseline.unavailable(ticketId, ref, "Kein Git-Repository.");
        }

        Optional<String> relativePath = relativize(repoRoot.get(), file);
        if (relativePath.isEmpty()) {
            return TicketBaseline.unavailable(ticketId, ref, "Datei liegt ausserhalb des Repositorys.");
        }

        Optional<String> blob = git.show(repoRoot.get(), ref.gitRef(), relativePath.get());
        if (blob.isEmpty()) {
            return TicketBaseline.unavailable(ticketId, ref, "Datei ist nicht versioniert.");
        }

        List<LinkedHashMap<String, String>> rows;
        try {
            // Dieselbe CRLF-Angleichung wie AzureTicketService.read(): das
            // Repo steht auf core.autocrlf=true. Ohne sie zaehlte jeder
            // Zeilenumbruch als Unterschied und die halbe Beschreibung waere
            // gruen markiert.
            rows = codec.readRows(blob.get().replace("\r\n", "\n"));
        } catch (UncheckedIOException e) {
            // Ein alter Commit mit kaputtem JSON darf den Editor nicht
            // lahmlegen - dann gibt es eben keinen Vergleich.
            log.debug("Vergleichsstand von {} ist nicht lesbar.", relativePath.get(), e);
            return TicketBaseline.unavailable(ticketId, ref, "Vergleichsstand ist nicht lesbar.");
        }

        // Welche Felder ueberhaupt angeboten werden, richtet sich nach der
        // ARBEITSKOPIE - genau wie in AzureTicketService.read(). Sonst koennten
        // Editor und Vergleichsstand verschiedene Feldmengen zeigen.
        List<EditableField> editable = EditableField.forTicket(
                category,
                value(located.row(), TYPE_FIELD),
                located.row()::containsKey);

        Optional<LinkedHashMap<String, String>> baselineRow = rows.stream()
                .filter(r -> ticketId.equals(r.get(TicketJsonCodec.ID_FIELD)))
                .findFirst();

        // Ticket im Vergleichsstand unbekannt: es ist neu. Leere Werte sind
        // hier die richtige Antwort - dann gilt alles als hinzugefuegt.
        List<TicketBaselineField> fields = new ArrayList<>();
        for (EditableField field : editable) {
            String previous = baselineRow
                    .map(r -> r.get(field.jsonKey()))
                    .orElse("");
            fields.add(new TicketBaselineField(field, previous == null ? "" : previous));
        }

        return new TicketBaseline(ticketId, ref, true, null, fields);
    }

    /**
     * Der Pfad der Datei relativ zur Repository-Wurzel, in der Schreibweise,
     * die git in "&lt;ref&gt;:&lt;pfad&gt;" erwartet.
     *
     * Hier steckt die meiste Fummelei des Backends, aus drei Gruenden:
     *
     *  - "git rev-parse --show-toplevel" antwortet mit Vorwaerts-Schraegstrichen
     *    und mitunter anderer Schreibweise des Laufwerksbuchstabens. Ein
     *    Stringvergleich mit dem Pfad aus Java ginge deshalb schief.
     *  - Der Vault liegt unter OneDrive, wo Verzeichnisse Verknuepfungen sein
     *    koennen. toRealPath() loest beides auf - dieselbe Vorsichtsmassnahme
     *    trifft FsGuard.
     *  - git akzeptiert in dieser Syntax KEINE Backslashes, auch unter
     *    Windows nicht.
     */
    private static Optional<String> relativize(Path repoRoot, Path file) {
        try {
            Path root = repoRoot.toRealPath();
            Path target = file.toRealPath();
            if (!target.startsWith(root)) {
                return Optional.empty();
            }
            return Optional.of(root.relativize(target).toString().replace('\\', '/'));
        } catch (IOException e) {
            log.debug("Konnte {} nicht gegen {} aufloesen.", file, repoRoot, e);
            return Optional.empty();
        }
    }

    private static String value(LinkedHashMap<String, String> row, String key) {
        String raw = row.get(key);
        return raw == null ? "" : raw;
    }
}
