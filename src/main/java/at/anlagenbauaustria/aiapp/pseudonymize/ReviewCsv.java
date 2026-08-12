package at.anlagenbauaustria.aiapp.pseudonymize;

import at.anlagenbauaustria.aiapp.pseudonymize.model.ReviewRow;
import com.fasterxml.jackson.dataformat.csv.CsvMapper;
import com.fasterxml.jackson.dataformat.csv.CsvSchema;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * Liest/schreibt review.csv im Format von
 * ai-vault/pipelines/pseudonymize/core/review.py (Header:
 * status,value,resolved_value,type,suggested_pseudonym,
 * pseudonym_or_alias_of,file,line,start_char,end_char,context). Bewusst
 * nur eine duenne Uebersetzungsschicht - die Datei selbst wird
 * ausschliesslich vom Python-Modul interpretiert. Gemeinsam genutzt von
 * jedem Pseudonymisierungs-Flow (notes, azureboards, ...), da das
 * Dateiformat identisch ist.
 */
public final class ReviewCsv {

    private static final CsvMapper MAPPER = new CsvMapper();

    private static final CsvSchema SCHEMA = CsvSchema.builder()
            .addColumn("status")
            .addColumn("value")
            .addColumn("resolved_value")
            .addColumn("type")
            .addColumn("suggested_pseudonym")
            .addColumn("pseudonym_or_alias_of")
            .addColumn("file")
            .addColumn("line")
            .addColumn("start_char")
            .addColumn("end_char")
            .addColumn("context")
            .setUseHeader(true)
            .setLineSeparator("\n")
            .build();

    private ReviewCsv() {
    }

    public static List<ReviewRow> read(Path path) {
        try {
            List<ReviewRow> rows = new java.util.ArrayList<>();
            var iterator = MAPPER.readerFor(Map.class)
                    .with(SCHEMA)
                    .readValues(path.toFile());
            while (iterator.hasNext()) {
                @SuppressWarnings("unchecked")
                Map<String, String> raw = (Map<String, String>) iterator.next();
                rows.add(new ReviewRow(
                        orEmpty(raw.get("status")),
                        orEmpty(raw.get("value")),
                        orEmpty(raw.get("type")),
                        orEmpty(raw.get("suggested_pseudonym")),
                        orEmpty(raw.get("pseudonym_or_alias_of")),
                        orEmpty(raw.get("file")),
                        parseIntOrZero(raw.get("line")),
                        parseIntOrZero(raw.get("start_char")),
                        parseIntOrZero(raw.get("end_char")),
                        orEmpty(raw.get("context")),
                        orEmpty(raw.get("resolved_value"))
                ));
            }
            return rows;
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte review.csv nicht lesen: " + path, e);
        }
    }

    public static void write(Path path, List<ReviewRow> rows) {
        try {
            List<Map<String, String>> raw = rows.stream().map(row -> {
                Map<String, String> fields = new java.util.HashMap<>();
                fields.put("status", row.status());
                fields.put("value", row.value());
                fields.put("resolved_value", row.resolvedValue());
                fields.put("type", row.type());
                fields.put("suggested_pseudonym", row.suggestedPseudonym());
                fields.put("pseudonym_or_alias_of", row.pseudonymOrAliasOf());
                fields.put("file", row.file());
                fields.put("line", String.valueOf(row.line()));
                fields.put("start_char", String.valueOf(row.startChar()));
                fields.put("end_char", String.valueOf(row.endChar()));
                fields.put("context", row.context());
                return fields;
            }).toList();
            MAPPER.writerFor(List.class).with(SCHEMA).writeValue(path.toFile(), raw);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte review.csv nicht schreiben: " + path, e);
        }
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }

    private static int parseIntOrZero(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
