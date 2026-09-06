package at.anlagenbauaustria.aiapp.pipeline;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Fuehrt ein ai-vault-Skript (Bash-Wrapper oder "python -m ...") per
 * ProcessBuilder aus, mit dem ai-vault-Root als Arbeitsverzeichnis.
 * Pipeline-Logik bleibt dabei vollstaendig in ai-vault (Python/Bash) -
 * diese Klasse startet nur Prozesse und reicht deren Ausgabe/Exit-Code
 * durch, sie reimplementiert nichts.
 */
@Component
public class PipelineRunner {

    /**
     * Voreinstellung fuer alle Laeufe, die kein eigenes Limit mitgeben.
     * Bewusst knapp: ein haengender Ingest-/Import-Lauf soll frueh auffallen.
     * Laeufe, die von Natur aus laenger dauern (z.B. das Neuerzeugen einer
     * Ansicht: ein Python-Prozess je Datei plus Rendern), geben ihr Limit
     * ueber die Ueberladung selbst vor, statt diesen Wert fuer alle anzuheben.
     */
    private static final Duration DEFAULT_TIMEOUT = Duration.ofMinutes(5);

    // Windows hat oft mehrere "bash"-Kandidaten im PATH (WSL, App-Execution-
    // Alias, Git Bash), auf unterschiedlichen Installationspfaden je nach
    // Maschine/Installationsart (System- vs. User-Install). "bash" ohne Pfad
    // kann auf ein kaputtes WSL treffen (System32\bash.exe) statt auf Git
    // Bash - das auch die ai-vault-Skripte selbst voraussetzen (siehe
    // ai-vault/README.md). Deshalb wird der PATH nach dem ersten
    // "*\Git\...\bash.exe"-Treffer durchsucht statt ein Verzeichnis
    // hart zu verdrahten.
    private static final List<String> KNOWN_NON_GIT_BASH_PATHS = List.of(
            "system32\\bash.exe", "windowsapps\\bash.exe");

    private final Path aivaultRoot;
    private final String bashExecutable;

    public PipelineRunner(AivaultProperties properties) {
        this.aivaultRoot = properties.getRoot();
        this.bashExecutable = resolveBashExecutable();
    }

    private static String resolveBashExecutable() {
        String pathEnv = System.getenv("PATH");
        if (pathEnv == null) {
            return "bash";
        }
        for (String dir : pathEnv.split(java.io.File.pathSeparator)) {
            Path candidate = Path.of(dir, "bash.exe");
            if (!Files.isExecutable(candidate)) {
                continue;
            }
            String lower = candidate.toString().toLowerCase();
            if (KNOWN_NON_GIT_BASH_PATHS.stream().anyMatch(lower::endsWith)) {
                continue;
            }
            return candidate.toString();
        }
        return "bash";
    }

    /**
     * Fuehrt ein Bash-Skript (z.B. "pipelines/notes/run_scan.sh") relativ
     * zum ai-vault-Root aus, mit optionalen zusaetzlichen Argumenten.
     */
    public PipelineResult runScript(String relativeScriptPath, String... args) {
        return runScript(DEFAULT_TIMEOUT, relativeScriptPath, args);
    }

    /**
     * Wie {@link #runScript(String, String...)}, aber mit eigenem Zeitlimit -
     * fuer Laeufe, die bekanntermaassen laenger brauchen als der Standardwert.
     */
    public PipelineResult runScript(Duration timeout, String relativeScriptPath, String... args) {
        List<String> command = new ArrayList<>();
        command.add(bashExecutable);
        command.add(relativeScriptPath);
        command.addAll(List.of(args));
        return run(timeout, command);
    }

    /**
     * Fuehrt "python -m <module> <args...>" im ai-vault-Root aus.
     */
    public PipelineResult runPythonModule(String module, String... args) {
        List<String> command = new ArrayList<>();
        command.add("python");
        command.add("-m");
        command.add(module);
        command.addAll(List.of(args));
        return run(DEFAULT_TIMEOUT, command);
    }

    private PipelineResult run(Duration timeout, List<String> command) {
        ProcessBuilder builder = new ProcessBuilder(command)
                .directory(aivaultRoot.toFile())
                .redirectErrorStream(true);

        Process process;
        try {
            process = builder.start();
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Pipeline-Skript nicht starten: " + command, e);
        }

        String output;
        try {
            output = new String(process.getInputStream().readAllBytes());
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Ausgabe des Pipeline-Skripts nicht lesen: " + command, e);
        }

        boolean finished;
        try {
            finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new PipelineExecutionException("Pipeline-Lauf wurde unterbrochen: " + command, output);
        }

        if (!finished) {
            process.destroyForcibly();
            throw new PipelineExecutionException(
                    "Pipeline-Lauf hat das Zeitlimit von " + timeout.toMinutes() + " Minuten ueberschritten: " + command,
                    output);
        }

        int exitCode = process.exitValue();
        return new PipelineResult(exitCode, output);
    }

    public record PipelineResult(int exitCode, String output) {
        public boolean isSuccess() {
            return exitCode == 0;
        }
    }

    public static class PipelineExecutionException extends RuntimeException {
        public PipelineExecutionException(String message, String output) {
            super(message + (output == null || output.isBlank() ? "" : "\n\n" + output));
        }
    }
}
