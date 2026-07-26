package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Einzige Stelle mit Schreibzugriff auf 0_sources/notes/ (Konzept Kapitel 9
 * / 17 - der Editor darf ausschliesslich hierher schreiben, alles Weitere
 * laeuft ueber den Ingest-Lauf). Persistiert reinen Rohtext, ohne Parsing-
 * Pflicht beim Speichern (Parsing passiert erst im Ingest-Lauf).
 * <p>
 * Dateiformat (Konzept Kapitel 13): YAML-Kopf mit nur "date:", danach der
 * Body zeilenweise exakt so, wie er im Editor steht. Diese Klasse traegt
 * den YAML-Kopf beim Schreiben automatisch nach; der Editor selbst sieht
 * und bearbeitet nur den Body.
 */
@Service
public class NoteFileService {

    private static final String ZONE = "0_sources/notes";
    private static final DateTimeFormatter FILE_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private final FsGuard fsGuard;
    private final AtomicFileWriter atomicFileWriter;

    public NoteFileService(FsGuard fsGuard, AtomicFileWriter atomicFileWriter) {
        this.fsGuard = fsGuard;
        this.atomicFileWriter = atomicFileWriter;
    }

    public String readBody(LocalDate date) {
        Path file = resolveDayFile(date);
        if (!Files.exists(file)) {
            return "";
        }
        try {
            return stripYamlHeader(Files.readString(file, StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Notizdatei nicht lesen: " + file, e);
        }
    }

    public void writeBody(LocalDate date, String body) {
        Path file = resolveDayFile(date);
        String content = "---\ndate: \"" + date.format(FILE_DATE) + "\"\n---\n\n" + body;
        try {
            atomicFileWriter.writeUtf8(file, content);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Notizdatei nicht schreiben: " + file, e);
        }
    }

    private String stripYamlHeader(String content) {
        if (!content.startsWith("---")) {
            return content;
        }
        int end = content.indexOf("\n---", 3);
        if (end < 0) {
            return content;
        }
        int bodyStart = content.indexOf('\n', end + 4);
        if (bodyStart < 0) {
            return "";
        }
        return content.substring(bodyStart + 1).stripLeading();
    }

    private Path resolveDayFile(LocalDate date) {
        String relative = ZONE + "/" + date.format(FILE_DATE) + ".md";
        return fsGuard.resolveWithinZone(relative, ZONE);
    }
}
