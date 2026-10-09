package at.anlagenbauaustria.aiapp.views;

import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.views.model.StakeholderOrderEntry;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Gemeinsame Einstellungen der Ansichten "Stakeholder" und "Stakeholder
 * kompakt" in ai-vault/config - je eine Datei mit einer Work-Item-ID pro
 * Zeile, alles ab '#' ist Kommentar (hier: der Titel, damit die Dateien auch
 * von Hand lesbar und bearbeitbar bleiben):
 * <ul>
 *   <li>stakeholder_order.txt  - manuelle Reihenfolge</li>
 *   <li>stakeholder_hidden.txt - standardmaessig ausgeblendete Eintraege</li>
 * </ul>
 *
 * Beide Ansichten lesen dieselben Dateien: beim Rendern backt ai-vault sie
 * ins HTML ein (render_stakeholder_html.py --order-config/--hidden-config),
 * und die Seite im iframe laedt den aktuellen Stand zusaetzlich ueber GET
 * nach. Geschrieben werden sie ueber die Speichern-Buttons der Ansicht (PUT).
 */
@Service
public class ViewSettingsService {

    static final String ORDER_FILE = "config/stakeholder_order.txt";
    static final String HIDDEN_FILE = "config/stakeholder_hidden.txt";
    private static final String CONFIG_ZONE = "config";

    private static final Pattern WORK_ITEM_ID = Pattern.compile("\\d{1,10}");

    static final String ORDER_HEADER = """
            # Manuelle Reihenfolge der Ansichten "Stakeholder" und "Stakeholder kompakt".
            # Eine Work-Item-ID pro Zeile, von oben nach unten; Text nach '#' ist nur Kommentar.
            # Nicht gelistete Eintraege erscheinen am Ende (Roadmap-Projekte zuerst).
            # Aendern: in der Ansicht ueber "Reihenfolge" -> "Als Standard speichern" oder hier von Hand
            # (von Hand geaendert wirkt nach "Neu erzeugen" bzw. beim naechsten Oeffnen in ai-app).
            """;

    static final String HIDDEN_HEADER = """
            # Standard-Auswahl der Ansichten "Stakeholder" und "Stakeholder kompakt":
            # diese Eintraege sind beim Oeffnen AUSGEBLENDET, alle anderen sichtbar.
            # Eine Work-Item-ID pro Zeile; Text nach '#' ist nur Kommentar. Leer = alles sichtbar.
            # (Bewusst die ausgeblendeten: neue Projekte erscheinen so automatisch.)
            # Aendern: in der Ansicht ueber "Themenbereiche" -> "Als Standard speichern" oder hier von Hand.
            """;

    private final FsGuard fsGuard;

    public ViewSettingsService(FsGuard fsGuard) {
        this.fsGuard = fsGuard;
    }

    /** IDs in gespeicherter Reihenfolge; leer, wenn die Datei (noch) fehlt. */
    public List<String> readOrder() {
        return readIds(ORDER_FILE);
    }

    /**
     * Schreibt die Reihenfolge (ersetzt die Datei vollstaendig).
     *
     * @throws IllegalArgumentException bei leerer Liste oder ungueltiger ID.
     */
    public List<String> writeOrder(List<StakeholderOrderEntry> entries) {
        if (entries == null || entries.isEmpty()) {
            throw new IllegalArgumentException("Die Reihenfolge ist leer.");
        }
        return writeIds(ORDER_FILE, ORDER_HEADER, entries);
    }

    /** Standardmaessig ausgeblendete IDs; leer = alles sichtbar (auch ohne Datei). */
    public List<String> readHidden() {
        return readIds(HIDDEN_FILE);
    }

    /**
     * Schreibt die Standard-Auswahl. Eine leere Liste ist gueltig und heisst
     * "alles sichtbar".
     *
     * @throws IllegalArgumentException bei ungueltiger ID.
     */
    public List<String> writeHidden(List<StakeholderOrderEntry> entries) {
        return writeIds(HIDDEN_FILE, HIDDEN_HEADER, entries == null ? List.of() : entries);
    }

    private List<String> readIds(String relativePath) {
        Path file = configFile(relativePath);
        if (!Files.isRegularFile(file)) {
            return List.of();
        }
        List<String> lines;
        try {
            lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Einstellung nicht lesen: " + file, e);
        }
        Set<String> ids = new LinkedHashSet<>();
        for (String line : lines) {
            int hash = line.indexOf('#');
            String token = (hash >= 0 ? line.substring(0, hash) : line).trim();
            // Wie der Renderer: alles, was keine reine ID ist, wird uebergangen.
            if (WORK_ITEM_ID.matcher(token).matches()) {
                ids.add(token);
            }
        }
        return List.copyOf(ids);
    }

    private List<String> writeIds(String relativePath, String header,
                                  List<StakeholderOrderEntry> entries) {
        Set<String> seen = new LinkedHashSet<>();
        StringBuilder body = new StringBuilder(header);
        for (StakeholderOrderEntry entry : entries) {
            String id = entry == null || entry.id() == null ? "" : entry.id().trim();
            if (!WORK_ITEM_ID.matcher(id).matches()) {
                throw new IllegalArgumentException("Ungueltige Work-Item-ID: '" + id + "'");
            }
            if (!seen.add(id)) {
                continue;
            }
            body.append(id);
            String title = sanitizeTitle(entry.title());
            if (!title.isEmpty()) {
                body.append("  # ").append(title);
            }
            body.append('\n');
        }
        writeAtomically(configFile(relativePath), body.toString());
        return new ArrayList<>(seen);
    }

    private Path configFile(String relativePath) {
        return fsGuard.resolveWithinZone(relativePath, CONFIG_ZONE);
    }

    /** Titel ist nur Kommentar: einzeilig halten, damit er keine Zeile "erfindet". */
    private static String sanitizeTitle(String title) {
        return title == null ? "" : title.replaceAll("[\\r\\n]+", " ").trim();
    }

    private static void writeAtomically(Path file, String content) {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = Files.createTempFile(file.getParent(), "stakeholder_setting", ".tmp");
            try {
                Files.writeString(tmp, content, StandardCharsets.UTF_8);
                try {
                    Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING,
                            StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(tmp);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Einstellung nicht schreiben: " + file, e);
        }
    }
}
