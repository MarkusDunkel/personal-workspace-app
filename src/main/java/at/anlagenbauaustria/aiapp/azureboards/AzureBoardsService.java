package at.anlagenbauaustria.aiapp.azureboards;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;
import at.anlagenbauaustria.aiapp.azureboards.model.DigestApplyResult;
import at.anlagenbauaustria.aiapp.azureboards.model.DigestPlanResponse;
import at.anlagenbauaustria.aiapp.azureboards.model.IngestResult;
import at.anlagenbauaustria.aiapp.azureboards.model.IngestScanResponse;
import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.pipeline.AivaultEnv;
import at.anlagenbauaustria.aiapp.pipeline.PipelineRunner;
import at.anlagenbauaustria.aiapp.pipeline.PipelineRunner.PipelineExecutionException;
import at.anlagenbauaustria.aiapp.pipeline.PipelineRunner.PipelineResult;
import at.anlagenbauaustria.aiapp.pseudonymize.PersonRegisterCsv;
import at.anlagenbauaustria.aiapp.pseudonymize.ReviewCsv;
import at.anlagenbauaustria.aiapp.pseudonymize.model.KnownPerson;
import at.anlagenbauaustria.aiapp.pseudonymize.model.ReviewRow;
import at.anlagenbauaustria.aiapp.pseudonymize.model.SubmitCandidate;
import at.anlagenbauaustria.aiapp.pseudonymize.model.SubmitDecision;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Orchestriert den Azure-Boards-JSON-Roundtrip: ruft ausschliesslich
 * bestehende, unveraenderte ai-vault-Skripte per PipelineRunner auf - die
 * eigentliche Ingest-/Pseudonymisierungs-/Reidentifikations-/Import-Logik
 * bleibt vollstaendig in ai-vault (Python/Bash), analog zu
 * notes.submit.NoteSubmitService. Kein generisches Pipeline-Domaenenmodell
 * (siehe ai-app/README.md "Ausschau" Punkt 2) - bewusst schlank gehalten,
 * bis eine zweite/dritte Pipeline dieses Muster wiederholt.
 */
@Service
public class AzureBoardsService {

    private static final String CSV_EXPORT_PATH_TEMPLATE = "pipelines/azure_boards/csv/%s/export.sh";
    private static final String JSON_INGEST_PATH_TEMPLATE = "pipelines/azure_boards/json/%s/run_ingest.sh";
    private static final String JSON_SCAN_PATH = "pipelines/azure_boards/json/_common/run_scan.sh";
    private static final String JSON_PSEUDONYMIZE_PATH = "pipelines/azure_boards/json/_common/run_pseudonymize.sh";
    private static final String JSON_REIDENTIFY_PATH = "pipelines/azure_boards/json/_common/run_reidentify.sh";
    private static final String JSON_IMPORT_PATH_TEMPLATE = "pipelines/azure_boards/json/%s/run_import.sh";
    private static final String JSON_MERGE_PATH = "pipelines/azure_boards/json/_common/run_merge.sh";

    private static final String PLAN_REPORT_PREFIX = "Plan-Report: ";
    private static final String FINISHED_PREFIX = "Fertig: ";
    private static final String MERGE_CONFLICT_PREFIX = "Merge-Konflikt: ";

    /**
     * run_merge.sh: gemergt, aber Konflikte offen. KEIN Fehler -- das Ergebnis
     * ist geschrieben und die Basis fortgeschrieben, es braucht nur eine
     * Entscheidung des Nutzers in 2_ai-ready. run_import.sh verweigert die
     * Planung, solange ein "_conflicts"-Schluessel stehen bleibt (Exit 8).
     */
    private static final int MERGE_EXIT_CONFLICTS = 5;
    /** run_merge.sh: Erstlauf, Basis angelegt, kein Merge moeglich. */
    private static final int MERGE_EXIT_BASELINE = 6;
    /**
     * run_merge.sh: der frische Azure-Stand ist unplausibel geschrumpft
     * (abgebrochener Ingest, falscher Export). Nichts geschrieben, der lokale
     * Stand liegt unveraendert im Snapshot.
     */
    private static final int MERGE_EXIT_IMPLAUSIBLE = 9;

    private final PipelineRunner pipelineRunner;
    private final AivaultEnv aivaultEnv;
    private final Path aivaultRoot;
    // Haelt fest, fuer welche Kategorie zuletzt ein Digest-Plan erstellt
    // wurde, damit /digest/apply weiss, welchen run_import.sh-Ordner es
    // erneut aufrufen muss - der eigentliche Plan-Inhalt wird NICHT
    // wiederverwendet (run_import.sh --apply holt bewusst einen frischen
    // Live-Stand und erzeugt sein eigenes neues Zeitstempel-Label, siehe
    // Kommentar in run_import.sh: der Azure-Ist-Stand kann sich zwischen
    // Plan und Apply geaendert haben).
    private final Map<String, Category> pendingPlans = new ConcurrentHashMap<>();
    // Haelt pro Ingest-Review-Token sowohl den Pfad der temporaeren review.csv
    // als auch die zugehoerige Kategorie fest (anders als bei Notes, wo es
    // nur eine einzige Quelle gibt, muss hier die Kategorie mitgefuehrt
    // werden, damit /ingest/apply weiss, welchen run_pseudonymize.sh-Aufruf
    // es am Ende ausfuehren muss).
    private final Map<String, PendingIngestReview> pendingIngestReviews = new ConcurrentHashMap<>();

    public AzureBoardsService(PipelineRunner pipelineRunner, AivaultEnv aivaultEnv, AivaultProperties aivaultProperties) {
        this.pipelineRunner = pipelineRunner;
        this.aivaultEnv = aivaultEnv;
        this.aivaultRoot = aivaultProperties.getRoot();
    }

    private record PendingIngestReview(Category category, Path reviewFile) {}

    /**
     * Erster Schritt des Ingest-Roundtrips: export -> run_ingest -> scan.
     * Liefert neue Pseudonymisierungs-Kandidaten zur Nutzerentscheidung,
     * analog zu NoteSubmitService.startReview(). Ohne diesen Schritt wuerde
     * run_pseudonymize.sh (siehe applyIngest) nur bereits registrierte Werte
     * ersetzen und neue Namen unpseudonymisiert durchreichen.
     */
    public IngestScanResponse scanForReview(Category category) {
        requireAzdoPat();
        StringBuilder log = new StringBuilder();

        PipelineResult exportResult = run(log, CSV_EXPORT_PATH_TEMPLATE.formatted(category.segment()));
        if (!exportResult.isSuccess()) {
            throw new PipelineExecutionException(
                    "Export fehlgeschlagen (Exit-Code " + exportResult.exitCode() + ")", log.toString());
        }
        String name = lastNonBlankLine(exportResult.output());
        if (name == null) {
            throw new PipelineExecutionException("Export lieferte keinen Dateinamen zurueck.", log.toString());
        }

        PipelineResult ingestResult = run(
                log, JSON_INGEST_PATH_TEMPLATE.formatted(category.segment()), name);
        if (!ingestResult.isSuccess()) {
            throw new PipelineExecutionException(
                    "Ingest fehlgeschlagen (Exit-Code " + ingestResult.exitCode() + ")", log.toString());
        }

        // Lokalen Stand sichern, BEVOR run_pseudonymize.sh in applyIngest()
        // 2_ai-ready leert und mit dem frischen Azure-Stand ueberschreibt.
        // Ohne diesen Snapshot gibt es im Merge keine "ours"-Seite und die
        // lokalen Edits sind verloren.
        PipelineResult saveLocalResult = run(
                log, JSON_MERGE_PATH, category.segment(), "--save-local");
        if (!saveLocalResult.isSuccess()) {
            throw new PipelineExecutionException(
                    "Sichern des lokalen Stands fehlgeschlagen (Exit-Code "
                            + saveLocalResult.exitCode() + ")", log.toString());
        }

        Path reviewFile = createTempReviewFile();
        PipelineResult scanResult = run(log, JSON_SCAN_PATH, category.segment(), reviewFile.toString());
        if (!scanResult.isSuccess()) {
            deleteQuietly(reviewFile);
            throw new PipelineExecutionException(
                    "Scan fehlgeschlagen (Exit-Code " + scanResult.exitCode() + ")", log.toString());
        }

        List<ReviewRow> rows = ReviewCsv.read(reviewFile);
        List<SubmitCandidate> candidates = rows.stream()
                .filter(row -> "new".equals(row.status()))
                .map(row -> new SubmitCandidate(
                        row.value(), row.type(), row.context(), row.suggestedPseudonym(),
                        row.file(), row.startChar(), row.endChar()))
                .toList();

        List<KnownPerson> knownPersons = PersonRegisterCsv.read(personRegisterPath()).stream()
                .filter(entry -> "person".equals(entry.type()))
                .map(entry -> new KnownPerson(entry.canonicalValue(), entry.pseudonym()))
                .toList();

        if (candidates.isEmpty()) {
            // Nichts zu entscheiden - review.csv enthaelt nur bereits bekannte
            // Werte (die scan schon herausgefiltert hat) oder ist leer.
            deleteQuietly(reviewFile);
            return new IngestScanResponse(null, List.of(), knownPersons, log.toString());
        }

        String token = UUID.randomUUID().toString();
        pendingIngestReviews.put(token, new PendingIngestReview(category, reviewFile));
        return new IngestScanResponse(token, candidates, knownPersons, log.toString());
    }

    /**
     * Zweiter Schritt: Nutzerentscheidungen ins Register uebernehmen
     * (update-register) und danach wie bisher pseudonymisieren
     * (run_pseudonymize.sh). reviewToken ist null, wenn scanForReview()
     * keine Kandidaten fand - dann wird direkt pseudonymisiert.
     */
    public IngestResult applyIngest(String reviewToken, List<SubmitDecision> decisions, Category categoryIfNoToken) {
        PendingIngestReview pending = reviewToken == null ? null : pendingIngestReviews.remove(reviewToken);
        if (reviewToken != null && pending == null) {
            return IngestResult.failure("Unbekannter oder bereits verwendeter reviewToken.", null);
        }

        Category category = pending != null ? pending.category() : categoryIfNoToken;
        Path reviewFile = pending != null ? pending.reviewFile() : null;
        StringBuilder log = new StringBuilder();
        Path sessionAliasesFile = null;
        Path sessionPositionsFile = null;

        try {
            if (reviewFile != null) {
                List<ReviewRow> rows = ReviewCsv.read(reviewFile);
                Map<String, SubmitDecision> byKey = new HashMap<>();
                for (SubmitDecision decision : decisions) {
                    byKey.put(decision.value() + " " + decision.type(), decision);
                }

                List<ReviewRow> updated = new ArrayList<>();
                for (ReviewRow row : rows) {
                    SubmitDecision decision = byKey.get(row.value() + " " + row.type());
                    if (decision == null) {
                        updated.add(row);
                        continue;
                    }
                    updated.add(new ReviewRow(
                            decision.action(),
                            row.value(),
                            row.type(),
                            row.suggestedPseudonym(),
                            isAliasAction(decision.action()) ? decision.aliasTarget() : "",
                            row.file(),
                            row.line(),
                            row.startChar(),
                            row.endChar(),
                            row.context(),
                            "accept".equals(decision.action()) && decision.resolvedValue() != null
                                    ? decision.resolvedValue() : ""
                    ));
                }
                ReviewCsv.write(reviewFile, updated);

                List<String> updateArgs = new ArrayList<>(List.of(
                        "update-register",
                        "--review", reviewFile.toString(),
                        "--registry", personRegisterPath().toString()));
                Path ignoredPath = ignoredValuesPath();
                if (ignoredPath != null) {
                    updateArgs.add("--ignored");
                    updateArgs.add(ignoredPath.toString());
                }
                // Nur anlegen, wenn tatsaechlich eine passende Entscheidung
                // vorkommt - sonst bleibt der bestehende Aufruf unveraendert
                // (kein leeres --session-*-Flag bei jedem Lauf).
                if (decisions.stream().anyMatch(d -> "alias_of_once".equals(d.action()))) {
                    sessionAliasesFile = createTempSessionFile("session-aliases");
                    updateArgs.add("--session-aliases");
                    updateArgs.add(sessionAliasesFile.toString());
                }
                if (decisions.stream().anyMatch(d -> "alias_of_position".equals(d.action()))) {
                    sessionPositionsFile = createTempSessionFile("session-positions");
                    updateArgs.add("--session-positions");
                    updateArgs.add(sessionPositionsFile.toString());
                }
                PipelineResult updateResult = pipelineRunner.runPythonModule(
                        "pipelines.pseudonymize",
                        updateArgs.toArray(String[]::new));
                log.append("==> update-register\n").append(updateResult.output()).append('\n');
                if (!updateResult.isSuccess()) {
                    return IngestResult.failure(
                            "Register-Update fehlgeschlagen (Exit-Code " + updateResult.exitCode() + ")",
                            log.toString());
                }
            }

            List<String> pseudonymizeArgs = new ArrayList<>(List.of(category.segment()));
            if (sessionAliasesFile != null) {
                pseudonymizeArgs.add("--session-aliases");
                pseudonymizeArgs.add(sessionAliasesFile.toString());
            }
            if (sessionPositionsFile != null) {
                pseudonymizeArgs.add("--session-positions");
                pseudonymizeArgs.add(sessionPositionsFile.toString());
            }
            PipelineResult pseudonymizeResult = run(
                    log, JSON_PSEUDONYMIZE_PATH, pseudonymizeArgs.toArray(String[]::new));
            if (!pseudonymizeResult.isSuccess()) {
                return IngestResult.failure(
                        "Pseudonymisierung fehlgeschlagen (Exit-Code " + pseudonymizeResult.exitCode() + ")",
                        log.toString());
            }

            // 3-Wege-Merge: der in scanForReview() gesicherte lokale Stand,
            // die Basis des Vorlaufs und der eben geschriebene Azure-Stand.
            // Exit 5 (Konflikte) und 6 (Erstlauf ohne Basis) sind KEINE
            // Fehler -- das Ergebnis ist in beiden Faellen geschrieben.
            PipelineResult mergeResult = run(log, JSON_MERGE_PATH, category.segment(), "--merge");
            int mergeExit = mergeResult.exitCode();
            if (mergeExit == MERGE_EXIT_CONFLICTS) {
                List<String> conflictFiles = extractPrefixedLines(
                        mergeResult.output(), MERGE_CONFLICT_PREFIX);
                return IngestResult.successWithWarning(
                        log.toString(),
                        conflictFiles.size() + " Datei(en) mit Merge-Konflikten. Die "
                                + "betroffenen Items tragen einen '_conflicts'-Schluessel: "
                                + "bitte in 2_ai-ready entscheiden und den Schluessel "
                                + "entfernen. Der Import bleibt bis dahin blockiert.",
                        conflictFiles);
            }
            if (mergeExit == MERGE_EXIT_IMPLAUSIBLE) {
                return IngestResult.failure(
                        "Der aus Azure geholte Stand ist unplausibel klein - der Merge wurde "
                                + "abgebrochen, es wurde nichts ueberschrieben. Wahrscheinlich "
                                + "ist der Ingest abgebrochen oder der Export leer geblieben. "
                                + "Der lokale Stand liegt unveraendert im Snapshot; pruefe das "
                                + "Log und wiederhole den Ingest.",
                        log.toString());
            }
            if (mergeExit != 0 && mergeExit != MERGE_EXIT_BASELINE) {
                return IngestResult.failure(
                        "Merge fehlgeschlagen (Exit-Code " + mergeExit + ")", log.toString());
            }

            return IngestResult.success(log.toString());
        } finally {
            if (reviewFile != null) {
                deleteQuietly(reviewFile);
            }
            if (sessionAliasesFile != null) {
                deleteQuietly(sessionAliasesFile);
            }
            if (sessionPositionsFile != null) {
                deleteQuietly(sessionPositionsFile);
            }
        }
    }

    private static boolean isAliasAction(String action) {
        return "alias_of".equals(action) || "alias_of_once".equals(action) || "alias_of_position".equals(action);
    }

    public DigestPlanResponse planDigest(Category category) {
        requireAzdoPat();
        StringBuilder log = new StringBuilder();

        PipelineResult reidentifyResult = run(log, JSON_REIDENTIFY_PATH, category.segment());
        if (!reidentifyResult.isSuccess()) {
            throw new PipelineExecutionException(
                    "Reidentifikation fehlgeschlagen (Exit-Code " + reidentifyResult.exitCode() + ")",
                    log.toString());
        }

        PipelineResult planResult = run(log, JSON_IMPORT_PATH_TEMPLATE.formatted(category.segment()));
        // run_import.sh liefert bei einem reinen Dry-Run (ohne --apply) immer
        // Exit-Code 0 - Abweichungen/Fehler werden erst bei --apply relevant
        // (siehe run_import.sh: Exit 3/4 nur im apply-Zweig).
        if (!planResult.isSuccess()) {
            throw new PipelineExecutionException(
                    "Plan-Erstellung fehlgeschlagen (Exit-Code " + planResult.exitCode() + ")", log.toString());
        }

        String reportPath = extractPrefixedLine(planResult.output(), PLAN_REPORT_PREFIX);
        if (reportPath == null) {
            throw new PipelineExecutionException(
                    "Plan-Report-Pfad konnte nicht aus der Skript-Ausgabe gelesen werden.", log.toString());
        }
        String planMarkdown = readReportFile(reportPath);

        String token = UUID.randomUUID().toString();
        pendingPlans.put(token, category);
        return new DigestPlanResponse(token, planMarkdown, log.toString());
    }

    public DigestApplyResult applyDigest(String planToken) {
        Category category = planToken == null ? null : pendingPlans.remove(planToken);
        if (category == null) {
            return DigestApplyResult.failure("Unbekannter oder bereits verwendeter planToken.", null);
        }

        requireAzdoPat();
        StringBuilder log = new StringBuilder();

        PipelineResult applyResult = run(
                log, JSON_IMPORT_PATH_TEMPLATE.formatted(category.segment()), "--apply");
        // apply_changes.py liefert Exit 3 bei gesammelten Item-Fehlern, die
        // Verifikation Exit 4 bei Abweichungen - in beiden Faellen hat
        // run_import.sh trotzdem einen Vergleichsbericht geschrieben (siehe
        // dessen "Fertig: ..."-Zeile), daher hier nicht als harten Fehlschlag
        // werten, sondern den Bericht trotzdem zurueckgeben.
        if (applyResult.exitCode() != 0 && applyResult.exitCode() != 3 && applyResult.exitCode() != 4) {
            return DigestApplyResult.failure(
                    "Anwenden fehlgeschlagen (Exit-Code " + applyResult.exitCode() + ")", log.toString());
        }

        String comparisonPath = extractPrefixedLine(applyResult.output(), FINISHED_PREFIX);
        return DigestApplyResult.success(comparisonPath, log.toString());
    }

    private void requireAzdoPat() {
        String pat = aivaultEnv.get("AZDO_PAT");
        if (pat == null || pat.isBlank()) {
            throw new IllegalStateException(
                    "AZDO_PAT ist nicht gesetzt - siehe ai-vault/.env.");
        }
    }

    private Path personRegisterPath() {
        Path path = aivaultEnv.getPath("AIVAULT_PERSON_REGISTER");
        if (path == null) {
            throw new IllegalStateException(
                    "AIVAULT_PERSON_REGISTER ist nicht gesetzt - siehe ai-vault/.env.");
        }
        return path;
    }

    /**
     * Anders als personRegisterPath() kein Boundary, sondern reine UX
     * (verhindert, dass dauerhaft ignorierte Kandidaten bei jedem Scan
     * erneut gemeldet werden) - daher optional, kein Abbruch wenn ungesetzt.
     */
    private Path ignoredValuesPath() {
        return aivaultEnv.getPath("AIVAULT_IGNORED_VALUES");
    }

    private Path createTempReviewFile() {
        try {
            Path dir = Files.createTempDirectory("ai-app-azureboards-review-");
            return dir.resolve("review.csv");
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte temporaeres Review-Verzeichnis nicht anlegen", e);
        }
    }

    /**
     * Nur der Pfad wird gebraucht - die Datei selbst wird von
     * update-register geschrieben und von apply gelesen, nie direkt von
     * Java. Nicht dauerhaft, wird im finally-Block wieder geloescht.
     */
    private Path createTempSessionFile(String prefix) {
        try {
            Path dir = Files.createTempDirectory("ai-app-azureboards-" + prefix + "-");
            return dir.resolve(prefix + ".csv");
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte temporaeres " + prefix + "-Verzeichnis nicht anlegen", e);
        }
    }

    private void deleteQuietly(Path reviewFile) {
        try {
            Files.deleteIfExists(reviewFile);
            Files.deleteIfExists(reviewFile.getParent());
        } catch (IOException ignored) {
            // Best effort: temp-Verzeichnis, kein funktionaler Schaden bei Fehlschlag.
        }
    }

    private PipelineResult run(StringBuilder log, String scriptPath, String... args) {
        PipelineResult result = pipelineRunner.runScript(scriptPath, args);
        log.append("==> ").append(scriptPath).append('\n')
                .append(result.output()).append('\n');
        return result;
    }

    private static String lastNonBlankLine(String output) {
        if (output == null) {
            return null;
        }
        return output.lines()
                .filter(line -> !line.isBlank())
                .reduce((first, second) -> second)
                .map(String::trim)
                .orElse(null);
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

    /**
     * Wie {@link #extractPrefixedLine}, aber fuer ALLE Treffer -- run_merge.sh
     * schreibt eine "Merge-Konflikt: &lt;datei&gt;"-Zeile je betroffener Datei.
     */
    private static List<String> extractPrefixedLines(String output, String prefix) {
        if (output == null) {
            return List.of();
        }
        return output.lines()
                .filter(line -> line.startsWith(prefix))
                .map(line -> line.substring(prefix.length()).trim())
                .filter(line -> !line.isEmpty())
                .toList();
    }

    private String readReportFile(String reportPath) {
        try {
            String windowsPath = toWindowsPath(reportPath);
            Path path = Path.of(windowsPath);
            if (!path.isAbsolute()) {
                path = aivaultRoot.resolve(windowsPath);
            }
            return Files.readString(path);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Plan-Report nicht lesen: " + reportPath, e);
        }
    }

    /**
     * Uebersetzt einen von einem Bash-Skript gelieferten Git-Bash-Pfad
     * ("/c/Users/...", aus REPO_ROOT="$(pwd)" in run_import.sh) in einen
     * unter Windows-Java aufloesbaren Pfad ("C:\Users\..."). Analog zu
     * AivaultEnv.toWindowsPath() (dort private, hier dupliziert statt
     * public gemacht, um AivaultEnv nicht wegen eines einzelnen weiteren
     * Aufrufers umzubauen). Ohne diese Uebersetzung interpretiert Path.of()
     * "/c/Users/..." fälschlich relativ zur aktuellen Laufwerkswurzel
     * (z.B. "C:\c\Users\..."), Files.readString() findet die Datei dann
     * nicht und wirft eine IOException, die als unbehandelte
     * UncheckedIOException zu einem nackten HTTP 500 ohne Fehlertext
     * fuehrte (Symptom: "Internal Server Error" ohne Meldung beim
     * Digest-Plan fuer "technical" - main "funktionierte", weil dessen
     * Plan-Report zufaellig schon einmal vorher erfolgreich gelesen wurde,
     * bevor dieser Pfad-Bug bemerkt wurde; tatsaechlich betrifft der Fehler
     * beide Kategorien gleichermassen).
     */
    private static String toWindowsPath(String value) {
        if (value.length() >= 3 && value.charAt(0) == '/' && value.charAt(2) == '/'
                && Character.isLetter(value.charAt(1))) {
            return value.charAt(1) + ":" + value.substring(2).replace('/', '\\');
        }
        return value;
    }
}
