package at.anlagenbauaustria.aiapp.notes.submit;

import at.anlagenbauaustria.aiapp.notes.submit.model.RegistryEntry;
import com.fasterxml.jackson.dataformat.csv.CsvMapper;
import com.fasterxml.jackson.dataformat.csv.CsvSchema;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * Read-only Zugriff auf person_register.csv (Format siehe
 * ai-vault/pipelines/pseudonymize/core/registry.py). ai-app liest diese
 * Datei nur, um dem Nutzer bekannte Personen anzuzeigen - geschrieben wird
 * sie ausschliesslich von "python -m pipelines.pseudonymize
 * update-register" (siehe ai-vault/CLAUDE.md, "Boundary is the user's").
 */
final class PersonRegisterCsv {

    private static final CsvMapper MAPPER = new CsvMapper();

    private static final CsvSchema SCHEMA = CsvSchema.builder()
            .addColumn("canonical_value")
            .addColumn("pseudonym")
            .addColumn("type")
            .addColumn("aliases")
            .addColumn("notes")
            .setUseHeader(true)
            .build();

    private PersonRegisterCsv() {
    }

    static List<RegistryEntry> read(Path path) {
        if (!Files.exists(path)) {
            return List.of();
        }
        try {
            List<RegistryEntry> entries = new java.util.ArrayList<>();
            var iterator = MAPPER.readerFor(Map.class)
                    .with(SCHEMA)
                    .readValues(path.toFile());
            while (iterator.hasNext()) {
                @SuppressWarnings("unchecked")
                Map<String, String> raw = (Map<String, String>) iterator.next();
                entries.add(new RegistryEntry(
                        raw.getOrDefault("canonical_value", "").strip(),
                        raw.getOrDefault("pseudonym", "").strip(),
                        raw.getOrDefault("type", "").strip()
                ));
            }
            return entries;
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte person_register.csv nicht lesen: " + path, e);
        }
    }
}
