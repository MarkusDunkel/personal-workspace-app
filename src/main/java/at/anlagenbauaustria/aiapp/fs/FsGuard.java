package at.anlagenbauaustria.aiapp.fs;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Einzige Stelle, die einen relativen Pfad gegen AIVAULT_ROOT aufloest.
 * Jeder Dateizugriff der App MUSS hierueber laufen (Konzept Kapitel 17) -
 * lehnt Traversal (".."), absolute Fremdpfade und symbolische Links, die aus
 * der Root herausfuehren, hart ab.
 */
@Component
public class FsGuard {

    private final Path root;

    public FsGuard(AivaultProperties properties) {
        if (properties.getRoot() == null) {
            throw new IllegalStateException(
                    "aivault.root ist nicht gesetzt - kein Default erlaubt (siehe application.yml).");
        }
        this.root = properties.getRoot().normalize().toAbsolutePath();
    }

    /**
     * Loest einen repo-relativen Pfad (z.B. "0_sources/notes/2026-07-24.md")
     * gegen die konfigurierte AIVAULT_ROOT auf und lehnt jeden Versuch ab,
     * die Root zu verlassen.
     */
    public Path resolve(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            throw new PathTraversalException("Leerer Pfad ist nicht erlaubt.");
        }
        Path candidate = root.resolve(relativePath).normalize();
        if (!candidate.startsWith(root)) {
            throw new PathTraversalException(
                    "Pfad '" + relativePath + "' verlaesst AIVAULT_ROOT.");
        }
        if (Files.exists(candidate)) {
            try {
                Path realCandidate = candidate.toRealPath();
                if (!realCandidate.startsWith(root.toRealPath())) {
                    throw new PathTraversalException(
                            "Pfad '" + relativePath + "' zeigt (via Symlink) aus AIVAULT_ROOT heraus.");
                }
            } catch (IOException e) {
                throw new PathTraversalException(
                        "Pfad '" + relativePath + "' konnte nicht aufgeloest werden: " + e.getMessage());
            }
        }
        return candidate;
    }

    /**
     * Wie {@link #resolve(String)}, verlangt zusaetzlich, dass der aufgeloeste
     * Pfad unterhalb der angegebenen Schreibzone liegt (Whitelist, Kapitel 17 -
     * z.B. der Editor darf nur nach "0_sources/notes" schreiben).
     */
    public Path resolveWithinZone(String relativePath, String allowedZoneRelativePath) {
        Path resolved = resolve(relativePath);
        Path zone = root.resolve(allowedZoneRelativePath).normalize();
        if (!resolved.startsWith(zone)) {
            throw new PathTraversalException(
                    "Pfad '" + relativePath + "' liegt ausserhalb der erlaubten Zone '"
                            + allowedZoneRelativePath + "'.");
        }
        return resolved;
    }

    public Path getRoot() {
        return root;
    }
}
