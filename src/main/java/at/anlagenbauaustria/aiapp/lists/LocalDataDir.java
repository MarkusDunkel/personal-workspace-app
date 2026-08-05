package at.anlagenbauaustria.aiapp.lists;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Loest den "data/"-Ordner im ai-app-Projekt-Root auf (Geschwister von
 * src/, frontend/, target/) - bewusst KEIN FsGuard-Bezug, da dieser
 * ausschliesslich AIVAULT_ROOT schuetzt. Die hier abgelegten Listen
 * (Contacts/Projekte/Meetings) sind lokale App-Konfiguration, kein
 * Nutzer-Input-Pfad, daher reicht ein fest verdrahteter relativer Pfad
 * gegen das Arbeitsverzeichnis (die App wird stets aus dem Projekt-Root
 * gestartet, siehe application.yml/mvnw-Konventionen). Nicht versioniert
 * (siehe .gitignore) - sich haeufig aendernde Laufzeitdaten.
 */
@Component
public class LocalDataDir {

    private final Path root;

    public LocalDataDir() {
        this(Path.of("data"));
    }

    /** Fuer Tests: erlaubt ein beliebiges Root-Verzeichnis statt "data/". */
    LocalDataDir(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    public Path resolve(String fileName) {
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte data/-Ordner nicht anlegen: " + root, e);
        }
        return root.resolve(fileName);
    }
}
