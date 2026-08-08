package at.anlagenbauaustria.aiapp.claude;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * Fuehrt einen headless "claude -p"-Aufruf per ProcessBuilder aus und liefert
 * dessen Textausgabe zurueck. Kein Tool-Zugriff (--dangerously-skip-permissions
 * ohne jede Rueckfrage), da nur reiner Text rein/raus geht.
 *
 * Windows-ProcessBuilder loest .cmd/.bat NICHT ueber PATHEXT auf (das macht
 * nur cmd.exe selbst) - npm-Installationen von Claude Code (nvm4w, nvm,
 * globales npm) liegen dort ausschliesslich als claude.cmd im PATH vor.
 * Deshalb auf Windows immer ueber "cmd.exe /c" starten; auf anderen
 * Betriebssystemen existiert dieses Wrapper-Problem nicht.
 *
 * Der Prompt wird ueber stdin uebergeben ("-p" OHNE eigenes Argument), nicht
 * als CLI-Argument: cmd.exe behandelt einen eingebetteten Zeilenumbruch in
 * einem quoted Argument als Befehlsende (verifiziert - jeder "\n" im
 * -p-Argument fuehrte dazu, dass claude nur den Teil vor dem ersten
 * Zeilenumbruch sah und nach dem "fehlenden" restlichen Text fragte). Der
 * Zellentext selbst kann durch die Bullet-Liste beliebige Zeilenumbrueche
 * enthalten, daher ist stdin hier die einzige robuste Uebergabeform.
 */
@Component
public class ClaudeCliRunner {

    private static final long TIMEOUT_SECONDS = 60;

    public String run(String promptText) {
        ProcessBuilder builder = new ProcessBuilder(buildCommand())
                .redirectErrorStream(true);

        Process process;
        try {
            process = builder.start();
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Claude-CLI nicht starten.", e);
        }

        try (OutputStream stdin = process.getOutputStream()) {
            stdin.write(promptText.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Prompt nicht an Claude-CLI übergeben.", e);
        }

        String output;
        try {
            output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Ausgabe der Claude-CLI nicht lesen.", e);
        }

        boolean finished;
        try {
            finished = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ClaudeCliExecutionException("Claude-CLI-Aufruf wurde unterbrochen.", output);
        }

        if (!finished) {
            process.destroyForcibly();
            throw new ClaudeCliExecutionException(
                    "Claude-CLI-Aufruf hat das Zeitlimit von " + TIMEOUT_SECONDS + " Sekunden überschritten.",
                    output);
        }

        if (process.exitValue() != 0) {
            throw new ClaudeCliExecutionException(
                    "Claude-CLI-Aufruf fehlgeschlagen (Exit " + process.exitValue() + ").", output);
        }

        return output.strip();
    }

    private static List<String> buildCommand() {
        List<String> command = new ArrayList<>();
        boolean isWindows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        if (isWindows) {
            command.add("cmd.exe");
            command.add("/c");
        }
        command.add("claude");
        command.add("-p");
        command.add("--dangerously-skip-permissions");
        return command;
    }

    public static class ClaudeCliExecutionException extends RuntimeException {
        public ClaudeCliExecutionException(String message, String output) {
            super(message + (output == null || output.isBlank() ? "" : "\n\n" + output));
        }
    }
}
