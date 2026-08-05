package at.anlagenbauaustria.aiapp.lists;

import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Liest/schreibt die drei Vorschlagslisten (Contacts, Projekte, Meetings)
 * als einfache Zwei-Block-Dateien im data/-Ordner (siehe LocalDataDir):
 *
 * confirmed:
 *   - Wert
 * provisional:
 *   - AndererWert
 *
 * Bewusst kein YAML-Parser fuer dieses triviale Format (wie schon bei der
 * alten contacts.yml) - nur zwei Kopfzeilen-Marker statt einem.
 */
@Service
public class ListsService {

    public static final String CONTACTS_FILE = "contacts.yml";
    public static final String PROJEKTE_FILE = "projekte.yml";
    public static final String MEETINGS_FILE = "meetings.yml";

    private final LocalDataDir dataDir;
    private final AtomicFileWriter atomicFileWriter;

    public ListsService(LocalDataDir dataDir, AtomicFileWriter atomicFileWriter) {
        this.dataDir = dataDir;
        this.atomicFileWriter = atomicFileWriter;
    }

    public NamedValueList read(String fileName) {
        Path file = dataDir.resolve(fileName);
        if (!Files.exists(file)) {
            return new NamedValueList(List.of(), List.of());
        }
        try {
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            List<String> confirmed = new ArrayList<>();
            List<String> provisional = new ArrayList<>();
            List<String> current = null;
            for (String line : lines) {
                String trimmed = line.strip();
                if (trimmed.equals("confirmed:")) {
                    current = confirmed;
                } else if (trimmed.equals("provisional:")) {
                    current = provisional;
                } else if (trimmed.startsWith("- ") && current != null) {
                    String value = stripQuotes(trimmed.substring(2).strip());
                    if (!value.isEmpty()) {
                        current.add(value);
                    }
                }
            }
            return new NamedValueList(confirmed, provisional);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Liste nicht lesen: " + file, e);
        }
    }

    /** Liefert confirmed+provisional zusammengefuehrt, dedupliziert, fuer die Frontend-Vorschlagsliste. */
    public List<String> readMerged(String fileName) {
        NamedValueList data = read(fileName);
        Set<String> merged = new LinkedHashSet<>(data.confirmed());
        merged.addAll(data.provisional());
        return List.copyOf(merged);
    }

    public void write(String fileName, NamedValueList data) {
        Path file = dataDir.resolve(fileName);
        StringBuilder sb = new StringBuilder();
        sb.append("confirmed:\n");
        for (String value : data.confirmed()) {
            sb.append("  - ").append(value).append('\n');
        }
        sb.append("provisional:\n");
        for (String value : data.provisional()) {
            sb.append("  - ").append(value).append('\n');
        }
        try {
            atomicFileWriter.writeUtf8(file, sb.toString());
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Liste nicht schreiben: " + file, e);
        }
    }

    /** Fuegt value zu provisional hinzu, falls es weder dort noch in confirmed (case-insensitiv) vorkommt. */
    public void addProvisional(String fileName, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        NamedValueList data = read(fileName);
        if (containsIgnoreCase(data.confirmed(), value) || containsIgnoreCase(data.provisional(), value)) {
            return;
        }
        List<String> nextProvisional = new ArrayList<>(data.provisional());
        nextProvisional.add(value);
        write(fileName, new NamedValueList(data.confirmed(), nextProvisional));
    }

    /**
     * Kernstueck des Lebenszyklus, aufgerufen bei jedem erfolgreichen
     * Absenden: provisional-Werte, die tatsaechlich verwendet wurden,
     * wandern dauerhaft nach confirmed; provisional-Werte, die NICHT
     * verwendet wurden, werden komplett entfernt. confirmed-Werte werden
     * nie entfernt, unabhaengig von usedValues.
     */
    public void reconcile(String fileName, Set<String> usedValues) {
        NamedValueList data = read(fileName);
        if (data.provisional().isEmpty()) {
            return;
        }
        List<String> nextConfirmed = new ArrayList<>(data.confirmed());
        for (String value : data.provisional()) {
            // Verwendete vorlaeufige Werte werden dauerhaft bestaetigt; alle
            // anderen werden schlicht NICHT in die naechste Version
            // uebernommen - sie verschwinden komplett aus der Liste.
            if (containsIgnoreCase(usedValues, value)) {
                nextConfirmed.add(value);
            }
        }
        write(fileName, new NamedValueList(nextConfirmed, List.of()));
    }

    private boolean containsIgnoreCase(Iterable<String> values, String target) {
        for (String value : values) {
            if (value.equalsIgnoreCase(target)) {
                return true;
            }
        }
        return false;
    }

    private String stripQuotes(String value) {
        if (value.length() >= 2
                && ((value.startsWith("\"") && value.endsWith("\""))
                || (value.startsWith("'") && value.endsWith("'")))) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }
}
