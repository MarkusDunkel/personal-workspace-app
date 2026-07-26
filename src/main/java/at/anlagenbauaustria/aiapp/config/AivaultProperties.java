package at.anlagenbauaustria.aiapp.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

/**
 * Pflichtwert, kein Default (analog AIVAULT_PERSON_REGISTER im ai-vault-Repo,
 * siehe CLAUDE.md dort). Fehlt er, darf die App keine Dateizugriffe zulassen -
 * siehe FsGuard.
 */
@ConfigurationProperties(prefix = "aivault")
public class AivaultProperties {

    private Path root;

    public Path getRoot() {
        return root;
    }

    public void setRoot(Path root) {
        this.root = root;
    }
}
