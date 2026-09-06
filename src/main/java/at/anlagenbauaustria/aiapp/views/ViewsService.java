package at.anlagenbauaustria.aiapp.views;

import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.pipeline.AivaultEnv;
import at.anlagenbauaustria.aiapp.pipeline.PipelineRunner;
import at.anlagenbauaustria.aiapp.pipeline.PipelineRunner.PipelineResult;
import at.anlagenbauaustria.aiapp.views.model.ViewInfo;
import at.anlagenbauaustria.aiapp.views.model.ViewKind;
import at.anlagenbauaustria.aiapp.views.model.ViewRefreshResult;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Liest die fertigen HTML-Ansichten aus 5_output und erzeugt sie auf Wunsch
 * neu, indem es die bestehenden ai-vault-Skripte aufruft - analog zu
 * AzureBoardsService. Es gibt hier bewusst KEINE eigene Aufbereitungs- oder
 * Renderlogik: die liegt vollstaendig in ai-vault (siehe ai-app/README.md).
 *
 * "Neu erzeugen" umfasst genau zwei Schritte:
 *   1. Reidentifikation des zugehoerigen Projekts (2_ai-ready -> 3_reidentified)
 *   2. Publish der Ansicht (3_reidentified -> 5_output)
 *
 * Bewusst OHNE Export/Ingest aus Azure und ohne Scan/Review: das ist der
 * Azure-Boards-Reiter mit seinem eigenen Ablauf (inkl.
 * Pseudonymisierungs-Dialog). Hier wird nur der bereits in 2_ai-ready
 * liegende, vom Nutzer gepflegte Stand sichtbar gemacht.
 */
@Service
public class ViewsService {

    /** Einzige Zone, aus der dieser Dienst liest. Geschrieben wird sie nur von ai-vault. */
    private static final String OUTPUT_ZONE = "5_output";

    // Dasselbe Skript wie AzureBoardsService.JSON_REIDENTIFY_PATH. Bewusst
    // dupliziert statt in eine gemeinsame Konstantenklasse gezogen: zwei
    // Verwendungen rechtfertigen noch kein generisches Pipeline-Modell
    // (siehe ai-app/README.md "Ausschau" Punkt 2).
    private static final String JSON_REIDENTIFY_PATH =
            "pipelines/azure_boards/json/_common/run_reidentify.sh";

    private static final String FINISHED_PREFIX = "Fertig: ";

    /**
     * Deutlich groesser als der Standardwert des PipelineRunner: die
     * Reidentifikation startet einen Python-Prozess JE Datei (bei main ueber
     * 100 Stueck) auf OneDrive-Speicher, danach folgt noch das Rendern einer
     * rund ein Megabyte grossen Seite.
     */
    private static final Duration REFRESH_TIMEOUT = Duration.ofMinutes(15);

    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final PipelineRunner pipelineRunner;
    private final FsGuard fsGuard;
    private final AivaultEnv aivaultEnv;

    public ViewsService(PipelineRunner pipelineRunner, FsGuard fsGuard, AivaultEnv aivaultEnv) {
        this.pipelineRunner = pipelineRunner;
        this.fsGuard = fsGuard;
        this.aivaultEnv = aivaultEnv;
    }

    public List<ViewInfo> list() {
        List<ViewInfo> infos = new ArrayList<>();
        for (ViewKind kind : ViewKind.values()) {
            Path file = resolve(kind);
            boolean available = Files.isRegularFile(file);
            infos.add(new ViewInfo(kind.id(), kind.label(), available,
                    available ? lastModified(file) : null));
        }
        return infos;
    }

    /**
     * Pfad der HTML-Datei einer Ansicht.
     *
     * @throws IllegalStateException wenn sie noch nie erzeugt wurde - der
     *         Aufrufer soll daraus eine handhabbare Meldung machen, keinen
     *         nackten Dateifehler.
     */
    public Path resolveHtml(ViewKind kind) {
        Path file = resolve(kind);
        if (!Files.isRegularFile(file)) {
            throw new IllegalStateException(
                    "Die Ansicht \"" + kind.label() + "\" wurde noch nicht erzeugt."
                            + " Bitte zuerst \"Neu erzeugen\" ausfuehren.");
        }
        return file;
    }

    public ViewRefreshResult refresh(ViewKind kind) {
        requirePersonRegister();
        StringBuilder log = new StringBuilder();

        PipelineResult reidentify = run(log, JSON_REIDENTIFY_PATH, kind.category().segment());
        if (!reidentify.isSuccess()) {
            return ViewRefreshResult.failure(
                    "Reidentifikation fehlgeschlagen (Exit-Code " + reidentify.exitCode() + ")",
                    log.toString());
        }

        PipelineResult publish = run(log, kind.publishScript());
        if (!publish.isSuccess()) {
            return ViewRefreshResult.failure(
                    "Erzeugen der Ansicht fehlgeschlagen (Exit-Code " + publish.exitCode() + ")",
                    log.toString());
        }
        // Die "Fertig: "-Zeile ist der Beleg, dass das Skript bis zum letzten
        // Schritt (Kopie auf den finalen Pfad) gekommen ist. Der Pfad darin ist
        // Git-Bash-Schreibweise und damit fuer die Oberflaeche unbrauchbar -
        // zurueckgegeben wird der vault-relative Pfad aus dem Enum.
        if (extractPrefixedLine(publish.output(), FINISHED_PREFIX) == null) {
            return ViewRefreshResult.failure(
                    "Das Publish-Skript hat keinen Abschluss gemeldet.", log.toString());
        }

        Path file = resolve(kind);
        if (!Files.isRegularFile(file)) {
            return ViewRefreshResult.failure(
                    "Ausgabedatei nicht gefunden: " + kind.outputPath(), log.toString());
        }
        return ViewRefreshResult.success(kind.outputPath(), lastModified(file), log.toString());
    }

    private Path resolve(ViewKind kind) {
        // Die Pfade stammen aus einem geschlossenen Enum, Traversal ist also
        // ohnehin ausgeschlossen. Die Zonenpruefung ist Absicherung gegen
        // spaetere Aenderungen am Enum und dokumentiert die Absicht: dieser
        // Dienst fasst nur 5_output an.
        return fsGuard.resolveWithinZone(kind.outputPath(), OUTPUT_ZONE);
    }

    private static String lastModified(Path file) {
        try {
            return LocalDateTime.ofInstant(
                    Files.getLastModifiedTime(file).toInstant(), ZoneId.systemDefault())
                    .format(TIMESTAMP);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Aenderungszeit nicht lesen: " + file, e);
        }
    }

    /**
     * run_reidentify.sh bricht ohne Register hart ab (Exit 1). Die Pruefung
     * vorab macht daraus eine verstaendliche Meldung statt eines
     * Bash-Fehlerblocks. AZDO_PAT wird hier NICHT gebraucht - weder
     * Reidentifikation noch Publish sprechen mit Azure.
     */
    private void requirePersonRegister() {
        Path register = aivaultEnv.getPath("AIVAULT_PERSON_REGISTER");
        if (register == null) {
            throw new IllegalStateException(
                    "AIVAULT_PERSON_REGISTER ist nicht gesetzt - siehe ai-vault/.env.");
        }
        if (!Files.isReadable(register)) {
            throw new IllegalStateException(
                    "Personenregister nicht gefunden: " + register
                            + " (AIVAULT_PERSON_REGISTER in ai-vault/.env pruefen).");
        }
    }

    private PipelineResult run(StringBuilder log, String scriptPath, String... args) {
        PipelineResult result = pipelineRunner.runScript(REFRESH_TIMEOUT, scriptPath, args);
        log.append("==> ").append(scriptPath).append('\n')
                .append(result.output()).append('\n');
        return result;
    }

    private static String extractPrefixedLine(String output, String prefix) {
        if (output == null) {
            return null;
        }
        return output.lines()
                .filter(line -> line.startsWith(prefix))
                .reduce((first, second) -> second)
                .map(line -> line.substring(prefix.length()).trim())
                .orElse(null);
    }
}
