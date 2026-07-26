package at.anlagenbauaustria.aiapp.contacts;

import at.anlagenbauaustria.aiapp.fs.FsGuard;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Liest die flache Kontaktliste aus 0_sources/contacts.yml (Autocomplete
 * fuer Von/An/Quelle in der Tabellen-UI). Bewusst kein YAML-Parser fuer
 * dieses triviale Format (Kopfzeile "contacts:" + "- Name"-Zeilen) - siehe
 * Konzept: keine neue Maven-Abhaengigkeit fuer eine flache Stringliste.
 * Read-only, keine Schreibzone noetig.
 */
@Service
public class ContactsService {

    private static final String FILE = "0_sources/contacts.yml";

    private final FsGuard fsGuard;

    public ContactsService(FsGuard fsGuard) {
        this.fsGuard = fsGuard;
    }

    public List<String> readContacts() {
        Path file = fsGuard.resolve(FILE);
        if (!Files.exists(file)) {
            return List.of();
        }
        try {
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            List<String> contacts = new ArrayList<>();
            for (String line : lines) {
                String trimmed = line.strip();
                if (trimmed.startsWith("- ")) {
                    String name = trimmed.substring(2).strip();
                    name = stripQuotes(name);
                    if (!name.isEmpty()) {
                        contacts.add(name);
                    }
                }
            }
            return contacts;
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte contacts.yml nicht lesen: " + file, e);
        }
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
