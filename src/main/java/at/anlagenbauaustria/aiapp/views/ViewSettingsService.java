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
 * Manuelle Reihenfolge der Ansichten "Stakeholder" und "Stakeholder kompakt"
 * in ai-vault/config/stakeholder_order.txt - eine Work-Item-ID pro Zeile,
 * alles ab '#' ist Kommentar (hier: der Titel, damit die Datei auch von Hand
 * lesbar und bearbeitbar bleibt).
 *
 * Beide Ansichten lesen dieselbe Datei: beim Rendern backt ai-vault sie ins
 * HTML ein (render_stakeholder_html.py --order-config), und die Seite im
 * iframe laedt den aktuellen Stand zusaetzlich ueber GET nach. Geschrieben
 * wird sie ueber "Als Standard speichern" in der Ansicht (PUT).
 */
@Service
public class ViewSettingsService {

    static final String ORDER_FILE = "config/stakeholder_order.txt";
    private static final String CONFIG_ZONE = "config";

    private static final Pattern WORK_ITEM_ID = Pattern.compile("\\d{1,10}");

    static final String HEADER = """
            # Manuelle Reihenfolge der Ansichten "Stakeholder" und "Stakeholder kompakt".
            # Eine Work-Item-ID pro Zeile, von oben nach unten; Text nach '#' ist nur Kommentar.
            # Nicht gelistete Eintraege erscheinen am Ende (Roadmap-Projekte zuerst).
            # Aendern: in der Ansicht ueber "Reihenfolge" -> "Als Standard speichern" oder hier von Hand
            # (von Hand geaendert wirkt nach "Neu erzeugen" bzw. beim naechsten Oeffnen in ai-app).
            """;

    private final FsGuard fsGuard;

    public ViewSettingsService(FsGuard fsGuard) {
        this.fsGuard = fsGuard;
    }

    /** IDs in gespeicherter Reihenfolge; leer, wenn die Datei (noch) fehlt. */
    public List<String> readOrder() {
        Path file = orderFile();
        if (!Files.isRegularFile(file)) {
            return List.of();
        }
        List<String> lines;
        try {
            lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Reihenfolge nicht lesen: " + file, e);
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

    /**
     * Schreibt die Reihenfolge (ersetzt die Datei vollstaendig).
     *
     * @throws IllegalArgumentException bei leerer Liste oder einer ID, die
     *         keine Work-Item-ID ist.
     */
    public List<String> writeOrder(List<StakeholderOrderEntry> entries) {
        if (entries == null || entries.isEmpty()) {
            throw new IllegalArgumentException("Die Reihenfolge ist leer.");
        }
        Set<String> seen = new LinkedHashSet<>();
        StringBuilder body = new StringBuilder(HEADER);
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
        writeAtomically(orderFile(), body.toString());
        return new ArrayList<>(seen);
    }

    private Path orderFile() {
        return fsGuard.resolveWithinZone(ORDER_FILE, CONFIG_ZONE);
    }

    /** Titel ist nur Kommentar: einzeilig halten, damit er keine Zeile "erfindet". */
    private static String sanitizeTitle(String title) {
        return title == null ? "" : title.replaceAll("[\\r\\n]+", " ").trim();
    }

    private static void writeAtomically(Path file, String content) {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = Files.createTempFile(file.getParent(), "stakeholder_order", ".tmp");
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
            throw new UncheckedIOException("Konnte Reihenfolge nicht schreiben: " + file, e);
        }
    }
}
