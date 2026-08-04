package at.anlagenbauaustria.aiapp.pipeline;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Liest KEY=VALUE-Paare aus ai-vault/.env, analog zu
 * ai-vault/pipelines/_lib/load_env.sh: Kommentare (#...), Leerzeilen,
 * optionales "export "-Praefix, Anfuehrungszeichen um Werte und
 * CRLF-Zeilenenden werden unterstuetzt. Prozessumgebungsvariablen (falls
 * gesetzt) haben Vorrang vor .env-Werten - gleiche Prioritaet wie beim
 * Bash-Loader.
 */
@Component
public class AivaultEnv {

    private final Path envFile;
    private Map<String, String> cached;

    public AivaultEnv(AivaultProperties properties) {
        this.envFile = properties.getRoot().resolve(".env");
    }

    public String get(String key) {
        String fromProcessEnv = System.getenv(key);
        if (fromProcessEnv != null && !fromProcessEnv.isBlank()) {
            return fromProcessEnv;
        }
        return load().get(key);
    }

    /**
     * Wie {@link #get(String)}, interpretiert den Wert aber als Dateipfad
     * und uebersetzt dabei die in ai-vault/.env uebliche Git-Bash-Notation
     * ("/c/Users/...") in einen unter Windows aufloesbaren Pfad
     * ("C:\Users\..."). Ohne diese Uebersetzung wuerde Path.of() einen
     * Pfad wie "/c/Users/..." faelschlich relativ zur aktuellen
     * Laufwerkswurzel interpretieren (z.B. "C:\c\Users\...").
     */
    public Path getPath(String key) {
        String value = get(key);
        if (value == null || value.isBlank()) {
            return null;
        }
        return Path.of(toWindowsPath(value));
    }

    private static String toWindowsPath(String value) {
        if (value.length() >= 3 && value.charAt(0) == '/' && value.charAt(2) == '/'
                && Character.isLetter(value.charAt(1))) {
            return value.charAt(1) + ":" + value.substring(2).replace('/', '\\');
        }
        return value;
    }

    private synchronized Map<String, String> load() {
        if (cached != null) {
            return cached;
        }
        Map<String, String> values = new LinkedHashMap<>();
        if (!Files.exists(envFile)) {
            cached = values;
            return cached;
        }
        try {
            String content = Files.readString(envFile, StandardCharsets.UTF_8);
            for (String rawLine : content.split("\n", -1)) {
                String line = rawLine.replace("\r", "");
                if (!line.isEmpty() && line.charAt(0) == '﻿') {
                    line = line.substring(1);
                }
                String trimmed = line.strip();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                if (trimmed.startsWith("export ")) {
                    trimmed = trimmed.substring("export ".length());
                }
                int eq = trimmed.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                String key = trimmed.substring(0, eq);
                if (!key.matches("[A-Za-z_][A-Za-z0-9_]*")) {
                    continue;
                }
                String value = trimmed.substring(eq + 1);
                if (value.length() >= 2
                        && ((value.startsWith("\"") && value.endsWith("\""))
                        || (value.startsWith("'") && value.endsWith("'")))) {
                    value = value.substring(1, value.length() - 1);
                }
                values.putIfAbsent(key, value);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte .env nicht lesen: " + envFile, e);
        }
        cached = values;
        return cached;
    }
}
