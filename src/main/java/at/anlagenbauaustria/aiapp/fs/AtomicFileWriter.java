package at.anlagenbauaustria.aiapp.fs;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Schreibt nie direkt in die Zieldatei. Erst nach "<datei>.tmp", dann
 * atomarer Move - verhindert einen Zustand, in dem eine Datei halb
 * geschrieben liegen bleibt, auch bei einem Absturz waehrend des Schreibens
 * (Konzept Kapitel 17).
 */
@Component
public class AtomicFileWriter {

    public void writeUtf8(Path target, String content) throws IOException {
        Files.createDirectories(target.getParent());
        Path tmp = target.resolveSibling(target.getFileName().toString() + ".tmp");
        Files.writeString(tmp, content, StandardCharsets.UTF_8);
        Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }
}
