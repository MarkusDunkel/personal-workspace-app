package at.anlagenbauaustria.aiapp.workspaces;

import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.workspaces.model.WorkspaceDocument;
import at.anlagenbauaustria.aiapp.workspaces.model.WorkspaceInfo;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Zugriff auf die Arbeitsdokumente in 2_ai-ready/workspaces/ - kurzlebige
 * Markdown-Dateien, die vor einem Meeting per KI-Auftrag in VS Code entstehen
 * und danach in den knowledge-hub zurueckgefuehrt werden.
 *
 * Die App ist ausschliesslich die Bearbeitungsoberflaeche: Anlegen und
 * Aufloesen passiert in VS Code. Deshalb verlangt write() eine bereits
 * existierende Datei - dieselbe Entscheidung wie in NoteArchiveService, aus
 * demselben Grund.
 *
 * KEINE Pseudonymisierung, anders als in NoteArchiveService - obwohl beide in
 * dieselbe KI-Zone (2_ai-ready) schreiben. Ein spaeterer Leser wird das
 * hinterfragen, daher die Begruendung:
 *
 * 1. Eine Pruefung waere hier konstruktionsbedingt falsch. NoteArchiveService
 *    kann sicher ablehnen, weil sein Inhalt STRUKTURIERT ist: es weiss, dass
 *    von/an/quelle Personenspalten sind (PERSON_CELLS) und prueft genau die.
 *    Hier ist der Inhalt freier Prosatext. Eine Namenssuche ueber das ganze
 *    Dokument wuerde auch Namen treffen, die die KI selbst eingesetzt hat, und
 *    damit Speichervorgaenge blockieren, die mit der Bearbeitung nichts zu tun
 *    haben.
 * 2. Mitten in einem Meeting zu blockieren ist der schlechteste Fehlerfall.
 *    Bei einer Tabellenzelle ist "ungespeichert bleiben und meckern"
 *    verkraftbar; bei einem live kommentierten Dokument bedeutet es verlorene
 *    Anmerkungen.
 * 3. Das Zeitfenster ist kurz und der Ausgang kontrolliert: die Dokumente
 *    leben Stunden bis Tage und werden in VS Code zusammengefuehrt - dort
 *    sitzt der Pseudonymisierungs-Schritt bereits.
 *
 * Die Oberflaeche weist beim Kommentieren auf erkannte Klarnamen hin,
 * blockiert aber nicht.
 */
@Service
public class WorkspaceService {

    private static final String ZONE = "2_ai-ready/workspaces";
    private static final String EXTENSION = ".md";

    /** Nur der Dateianfang wird fuer den Titel gelesen - siehe titleOf. */
    private static final int TITLE_PROBE_BYTES = 4096;

    private static final int MAX_NAME_LENGTH = 120;

    /**
     * Zeichen, die in einem Dateinamen NICHT vorkommen duerfen.
     *
     * Bewusst eine Negativliste: echte Dateinamen im Vault enthalten
     * Leerzeichen, Umlaute, Klammern und "-" (U+2013, En-Dash). Eine
     * Positivliste wie [A-Za-z0-9_-]+ wuerde vorhandene Dateien AUSBLENDEN -
     * und "unsichtbar" ist bei einer Auswahlliste ein schlimmerer Fehler als
     * "streng". Verboten ist daher gezielt das Gefaehrliche: Pfadtrenner,
     * Doppelpunkt (Windows-Alternate-Data-Streams "datei.md:zone"),
     * Steuerzeichen und Wildcards.
     *
     * Weil "/" und "\" hier ausgeschlossen sind, ist ein akzeptierter Name
     * garantiert EIN Pfadsegment. Diese Vollpruefung laeuft VOR jeder
     * Pfadoperation, FsGuard ist die zweite Absicherung - dieselbe Doktrin
     * wie in NoteArchiveService.
     */
    private static final Pattern FORBIDDEN_CHARS = Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]");

    private final FsGuard fsGuard;
    private final AtomicFileWriter atomicFileWriter;

    public WorkspaceService(FsGuard fsGuard, AtomicFileWriter atomicFileWriter) {
        this.fsGuard = fsGuard;
        this.atomicFileWriter = atomicFileWriter;
    }

    /**
     * Alle Workspace-Dokumente, alphabetisch nach Titel.
     *
     * Bewusst FLACH (Files.list, nicht Files.walk): Workspaces liegen
     * unmittelbar in dem Ordner. Lagen dort spaeter Unterordner, erschienen
     * sie hier einfach nicht - eine sichtbare, aber harmlose Grenze, die
     * keine vorsorgliche Rekursion rechtfertigt.
     */
    public List<WorkspaceInfo> list() {
        Path dir = fsGuard.resolve(ZONE);
        // Der Ordner ist leer und ohne .gitkeep, also nicht in git - in einem
        // frischen Clone existiert er gar nicht. Kein Fehler, nur leer.
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (Stream<Path> files = Files.list(dir)) {
            List<WorkspaceInfo> infos = new ArrayList<>();
            for (Path file : files.toList()) {
                if (!Files.isRegularFile(file)) continue;
                String fileName = file.getFileName().toString();
                if (!fileName.endsWith(EXTENSION)) continue;
                String name = fileName.substring(0, fileName.length() - EXTENSION.length());
                if (!isValidName(name)) continue;
                infos.add(new WorkspaceInfo(name, titleOf(file, name), lastModifiedOf(file)));
            }
            infos.sort(Comparator.comparing(WorkspaceInfo::title, String.CASE_INSENSITIVE_ORDER));
            return infos;
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte " + ZONE + " nicht auflisten: " + dir, e);
        }
    }

    public WorkspaceDocument read(String name) {
        Path file = resolveExistingFile(name);
        try {
            String markdown = Files.readString(file, StandardCharsets.UTF_8);
            return new WorkspaceDocument(name, markdown, revisionOf(file));
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Workspace nicht lesen: " + file, e);
        }
    }

    /**
     * Schreibt den Inhalt zurueck - nur, wenn die Datei bereits existiert und
     * sich seit dem Laden nicht von aussen geaendert hat.
     *
     * resolveExistingFile ist hier die Zeile, die garantiert, dass die App
     * NIEMALS eine Workspace-Datei anlegt: AtomicFileWriter.writeUtf8 wuerde
     * Verzeichnisse und Datei sonst bereitwillig erzeugen. Zusammen mit der
     * NFC-Pruefung in isValidName verhindert das auch eine "Geisterdatei",
     * wenn ein Name in abweichender Unicode-Normalisierung zurueckkaeme
     * (Windows/OneDrive liefert Umlaute je nach Weg als U+00E4 oder als
     * a + U+0308).
     */
    public void write(String name, String markdown, String expectedRevision) {
        Path file = resolveExistingFile(name);
        String current = revisionOf(file);
        if (expectedRevision != null && !expectedRevision.equals(current)) {
            throw new WorkspaceConflictException(
                    "Die Datei wurde ausserhalb der App geaendert (in der Regel durch VS Code). "
                            + "Zum Weiterarbeiten neu laden - die lokalen Aenderungen gehen dabei verloren.");
        }
        try {
            atomicFileWriter.writeUtf8(file, markdown);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Workspace nicht schreiben: " + file, e);
        }
    }

    /**
     * Der Titel fuer die Auswahlliste: die erste ATX-Ueberschrift ("# ..."),
     * sonst der Dateiname.
     *
     * Liest bewusst nur den Dateianfang. NoteArchiveService.countRows() liest
     * beim Auflisten jede Datei komplett - ein N+1, das hier nicht wiederholt
     * wird: eine Ueberschrift steht am Anfang oder gar nicht.
     */
    private static String titleOf(Path file, String fallback) {
        try (var reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            char[] buffer = new char[TITLE_PROBE_BYTES];
            int read = reader.read(buffer);
            if (read <= 0) return fallback;
            for (String line : new String(buffer, 0, read).split("\n")) {
                String trimmed = line.strip();
                if (trimmed.startsWith("# ")) {
                    String title = trimmed.substring(2).strip();
                    if (!title.isEmpty()) return title;
                }
            }
            return fallback;
        } catch (IOException e) {
            // Ein unlesbarer Titel darf die ganze Liste nicht kippen.
            return fallback;
        }
    }

    /**
     * Der Aenderungsmarker. Aktuell der Zeitstempel der Datei in
     * Millisekunden, als String.
     *
     * Der Rueckgabetyp ist absichtlich opak: sollten sich auf Windows mit
     * OneDrive Fehlalarme zeigen (der Sync kann die mtime beruehren, ohne dass
     * sich der Inhalt aendert), kann hier auf einen Inhalts-Hash umgestellt
     * werden, ohne die API oder die Oberflaeche anzufassen. Es ist ein Hinweis
     * auf einen Konflikt, keine Sicherheitsgrenze.
     */
    private static String revisionOf(Path file) {
        try {
            return Long.toString(Files.getLastModifiedTime(file).toMillis());
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Aenderungszeit nicht lesen: " + file, e);
        }
    }

    private static String lastModifiedOf(Path file) {
        try {
            return Files.getLastModifiedTime(file).toInstant().toString();
        } catch (IOException e) {
            return "";
        }
    }

    private Path resolveExistingFile(String name) {
        Path file = resolveFile(name);
        if (!Files.isRegularFile(file)) {
            throw new UnknownWorkspaceException(name);
        }
        return file;
    }

    private Path resolveFile(String name) {
        if (!isValidName(name)) {
            throw new UnknownWorkspaceException(String.valueOf(name));
        }
        return fsGuard.resolveWithinZone(ZONE + "/" + name + EXTENSION, ZONE);
    }

    /**
     * Vollpruefung des Namens vor jeder Pfadoperation (siehe
     * FORBIDDEN_CHARS).
     *
     * Die NFC-Pruefung ist auf diesem Rechner (Windows + OneDrive) wesentlich
     * und leicht zu uebersehen: "ae" kann als ein Zeichen (U+00E4, NFC) oder
     * als "a" plus Trema (U+0308, NFD) ankommen. Beides sieht identisch aus,
     * bezeichnet aber unterschiedliche Pfade. Kaeme eine andere Form zurueck
     * als list() geliefert hat, zeigte resolve auf eine andere, nicht
     * existierende Datei. Legitime Anfragen schicken zurueck, was list()
     * geliefert hat, und passieren daher.
     */
    private static boolean isValidName(String name) {
        return name != null
                && !name.isBlank()
                && name.length() <= MAX_NAME_LENGTH
                && !FORBIDDEN_CHARS.matcher(name).find()
                && !name.equals(".")
                && !name.equals("..")
                // Versteckte Namen (".obsidian") gehoeren nicht in die Liste.
                && !name.startsWith(".")
                // Windows schneidet beides beim Anlegen ab - "name." und
                // "name " bezeichnen dieselbe Datei wie "name".
                && !name.endsWith(".")
                && !name.endsWith(" ")
                && Normalizer.isNormalized(name, Normalizer.Form.NFC);
    }
}
