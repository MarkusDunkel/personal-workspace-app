package at.anlagenbauaustria.aiapp.git;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;

/**
 * Fuehrt LESENDE git-Befehle aus und liefert deren Ausgabe.
 *
 * Aufgebaut wie PipelineRunner (ProcessBuilder, Arbeitsverzeichnis, Zeitlimit),
 * aber bewusst an drei Stellen anders - jede davon war hier ein Fehler:
 *
 *  1. KEIN redirectErrorStream(true). Die Ausgabe von "git show" sind
 *     Nutzdaten, die anschliessend als JSON geparst werden; git-Fehlertext
 *     darin wuerde den Parser auf eine Datei loslassen, die niemand
 *     geschrieben hat.
 *  2. Ausgabe wird EXPLIZIT als UTF-8 gelesen. Die Pipeline schreibt mit
 *     ensure_ascii=False, die Ticket-Texte tragen also echte Umlaute. Die
 *     Standardkodierung waere unter Windows cp1252 und machte aus jedem
 *     "ue" ein Ersatzzeichen - und zwar nur im Vergleichsstand, was als
 *     Aenderung an genau diesen Woertern erschiene.
 *  3. Zeitlimit 5 SEKUNDEN statt Minuten. Ein haengendes git auf einem
 *     OneDrive-Pfad darf keinen HTTP-Thread blockieren; im Zweifel gibt es
 *     lieber keinen Vergleichsstand als eine haengende Oberflaeche.
 *
 * Alle Fehler enden in Optional.empty(). Das ist Absicht und der einzige
 * Trichter: kein Repository, Datei nicht versioniert, Repository ohne
 * Commits, git nicht im PATH - fuer den Aufrufer ist das alles dasselbe,
 * naemlich "kein Vergleichsstand". Eine Ausnahme waere hier falsch, weil
 * das Fehlen eines Vergleichsstands ein normaler Zustand ist.
 *
 * Diese Klasse schreibt NICHT. Es gibt hier bewusst kein add, commit oder
 * checkout - das Repository gehoert dem Nutzer.
 */
@Component
public class GitCommandRunner {

    private static final Logger log = LoggerFactory.getLogger(GitCommandRunner.class);

    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    /**
     * Ob ueberhaupt ein git vorhanden ist. Wird beim ersten Fehlschlag auf
     * false gesetzt, damit nicht bei jedem Aufruf ein Prozessstart versucht
     * und eine Warnung geschrieben wird.
     */
    private volatile boolean gitAvailable = true;

    /**
     * Verzeichnis -&gt; Repository-Wurzel. Siehe toplevel(): spart je Abfrage
     * einen Prozessstart. Nebenlaeufig, weil mehrere Anfragen gleichzeitig
     * hereinkommen koennen; im schlimmsten Fall ermitteln zwei Threads
     * dasselbe Ergebnis doppelt, was nur Zeit kostet und nichts verfaelscht.
     *
     * Die Zahl der Verzeichnisse ist durch die Projektordner begrenzt (drei
     * Kategorien), eine Groessenbegrenzung braucht es deshalb nicht.
     */
    private final ConcurrentMap<Path, Optional<Path>> toplevelCache = new ConcurrentHashMap<>();

    /**
     * Das Wurzelverzeichnis des Repositorys, in dem startDir liegt.
     *
     * Wird gebraucht, weil das fuer die Tickets zustaendige Repository das
     * VERSCHACHTELTE ist (ai-vault/2_ai-ready), nicht ai-vault selbst. Ein
     * fest verdrahteter Pfad braeche still, sobald sich an der
     * Verschachtelung etwas aendert - git weiss es selbst am besten.
     *
     * Das Ergebnis wird je Verzeichnis GEMERKT. Grund ist gemessen: ein
     * git-Prozessstart kostet auf diesem Rechner (Windows, Vault unter
     * OneDrive) rund 230 ms. Ohne diesen Zwischenspeicher braeuchte jeder
     * Vergleichsstand zwei Starts statt einem, und der Editor laedt zwei
     * Felder je Ticket - aus einem knappen halben wuerde eine volle Sekunde
     * bei jedem Ticketwechsel.
     *
     * Das Merken ist ungefaehrlich, weil sich die Zuordnung
     * Verzeichnis -> Repository-Wurzel praktisch nie aendert: dafuer muesste
     * jemand das Repository im laufenden Betrieb verschieben oder neu
     * anlegen. Der INHALT wird nicht gemerkt - jeder Vergleichsstand wird
     * frisch aus git geholt, sonst zeigte der Editor nach einem Commit noch
     * den alten Stand.
     */
    public Optional<Path> toplevel(Path startDir) {
        Path key = startDir.toAbsolutePath().normalize();
        Optional<Path> known = toplevelCache.get(key);
        if (known != null) {
            return known;
        }
        Optional<Path> resolved = run(startDir, List.of("git", "rev-parse", "--show-toplevel"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Path::of);
        toplevelCache.put(key, resolved);
        return resolved;
    }

    /**
     * Der Inhalt einer Datei in einem bestimmten Stand, z.B.
     * show(repo, "HEAD", "azure_boards/json/technical/556_x.json").
     *
     * relativePath MUSS mit Vorwaerts-Schraegstrichen geschrieben sein und
     * relativ zur Repository-Wurzel - git kennt in "&lt;ref&gt;:&lt;pfad&gt;"
     * keine Backslashes, auch unter Windows nicht.
     */
    public Optional<String> show(Path repoRoot, String ref, String relativePath) {
        return run(repoRoot, List.of("git", "--no-pager", "show", ref + ":" + relativePath));
    }

    /**
     * Startet den Befehl und liefert seine Standardausgabe, oder leer, wenn
     * irgendetwas daran nicht geklappt hat.
     *
     * Die Fehlerausgabe wird getrennt eingelesen und nur protokolliert. Sie
     * muss aber ueberhaupt gelesen werden: bliebe sie im Puffer stehen,
     * koennte ein gespraechiger git-Aufruf daran blockieren.
     */
    private Optional<String> run(Path workingDirectory, List<String> command) {
        if (!gitAvailable) {
            return Optional.empty();
        }

        Process process;
        try {
            process = new ProcessBuilder(command)
                    .directory(workingDirectory.toFile())
                    .start();
        } catch (IOException e) {
            // Einmal pro Prozess, nicht pro Anfrage: fehlt git im PATH, waere
            // das sonst bei jedem Ticketwechsel eine neue Zeile im Protokoll.
            gitAvailable = false;
            log.warn("git ist nicht ausfuehrbar - die Aenderungsmarkierung im"
                    + " Ticket-Editor bleibt deshalb aus.", e);
            return Optional.empty();
        }

        String output;
        String errorOutput;
        try {
            output = readAll(process.getInputStream());
            errorOutput = readAll(process.getErrorStream());
        } catch (IOException e) {
            process.destroyForcibly();
            log.debug("Konnte die Ausgabe von {} nicht lesen.", command, e);
            return Optional.empty();
        }

        boolean finished;
        try {
            finished = process.waitFor(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            return Optional.empty();
        }

        if (!finished) {
            process.destroyForcibly();
            log.debug("git hat das Zeitlimit ueberschritten: {}", command);
            return Optional.empty();
        }

        if (process.exitValue() != 0) {
            // Der Normalfall fuer "Datei ist nicht versioniert" - deshalb nur
            // debug, nicht warn.
            log.debug("git endete mit {}: {} - {}", process.exitValue(), command, errorOutput.trim());
            return Optional.empty();
        }

        return Optional.of(output);
    }

    private static String readAll(InputStream stream) throws IOException {
        return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
    }
}
