package at.anlagenbauaustria.aiapp.notes.archive;

import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.notes.archive.model.ArchiveFileInfo;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableRow;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Einmalige Reparatur der abgelegten Notizen in 2_ai-ready/notes. Behebt zwei
 * Altlasten, die erst stoeren, seit alle Notizen in EINER sortierten Liste
 * erscheinen (created absteigend):
 *
 * 1. Fehlendes "created": die aeltesten Archivdateien entstanden, bevor die
 *    Oberflaeche diesen Zeitstempel gesetzt hat. Ohne ihn haetten die Zeilen
 *    keinen Platz in der Zeitsortierung. Nachgetragen wird der Zeitstempel
 *    der DATEI - genauer geht es nicht, und er ist eine korrekte obere
 *    Schranke fuer die Entstehungszeit jeder enthaltenen Zeile.
 *
 * 2. Falsches "tableId": zwei Dateien tragen ihren eigenen Dateinamen statt
 *    "notes". Ursache war die alte ArchiveNoteSection, die den Dateinamen als
 *    tableId an useNoteTableData uebergab, von wo er in den Request-Body und
 *    ueber NoteArchiveController.put() unveraendert in die Datei wanderte
 *    (der Controller validiert die tableId - anders als NoteController -
 *    nicht).
 *
 * Idempotent, aber NICHT ueber eine Markierungsdatei wie NotesMigration
 * (dort ist die Existenz von notes.json selbst die Markierung): diese
 * Migration ist ein Patch pro Zeile, ihre Markierung ist die Abwesenheit des
 * Defekts. Ist created gesetzt und tableId korrekt, wird die Datei nicht
 * angefasst - ein zweiter Lauf schreibt daher nichts und laesst jede Datei
 * byte-identisch.
 */
@Component
public class ArchiveNotesMigration implements ApplicationRunner {

    private static final String TABLE_ID = "notes";

    private final NoteArchiveService archiveService;
    private final AtomicFileWriter atomicFileWriter;
    private final ObjectMapper objectMapper;

    /**
     * Bewusst OHNE PseudonymMapper: diese Migration beruehrt keine
     * Personenzelle, liest und schreibt roh (siehe NoteArchiveService.readRaw)
     * und darf deshalb nicht vom Register abhaengen. Waere der Mapper hier,
     * wuerde ein fehlendes oder leeres person_register.csv den Start
     * blockieren, obwohl fuer diese Aufgabe gar nichts uebersetzt werden muss.
     */
    public ArchiveNotesMigration(
            NoteArchiveService archiveService,
            AtomicFileWriter atomicFileWriter,
            ObjectMapper objectMapper) {
        this.archiveService = archiveService;
        this.atomicFileWriter = atomicFileWriter;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (ArchiveFileInfo info : archiveService.list()) {
            migrateFile(info);
        }
    }

    private void migrateFile(ArchiveFileInfo info) {
        NoteTableData raw = archiveService.readRaw(info.fileName());
        String fileCreated = toIsoInstant(info.timestamp());

        boolean changed = false;
        List<NoteTableRow> rows = new ArrayList<>(raw.rows().size());
        for (NoteTableRow row : raw.rows()) {
            String created = row.cells().get("created");
            if (created != null && !created.isBlank()) {
                rows.add(row);
                continue;
            }
            // LinkedHashMap, nicht HashMap: NoteTableRow.cells() kommt als
            // LinkedHashMap aus Jackson, die Zellreihenfolge in der Datei
            // bleibt damit stabil. Eine HashMap-Kopie wuerde jede migrierte
            // Zeile umsortieren und ein riesiges Scheindiff in einer Datei
            // erzeugen, die der Nutzer sieht und versioniert.
            Map<String, String> cells = new LinkedHashMap<>(row.cells());
            cells.put("created", fileCreated);
            rows.add(new NoteTableRow(row.id(), cells, row.order()));
            changed = true;
        }

        String tableId = raw.tableId();
        if (!TABLE_ID.equals(tableId)) {
            tableId = TABLE_ID;
            changed = true;
        }

        if (!changed) {
            // Fehlerfreie Datei wird gar nicht geschrieben - der Nutzer hat
            // sie moeglicherweise gerade offen.
            return;
        }
        writeRaw(info.fileName(), new NoteTableData(tableId, rows));
    }

    /**
     * "2026-08-05T12-20-07Z" (Dateinamensformat aus run_pseudonymize.sh) ->
     * "2026-08-05T12:20:07Z" (ISO-8601, wie es die created-Zelle traegt).
     * Ersetzt werden nur die beiden Trennzeichen im ZEITTEIL; das Datum
     * benutzt dieselben Bindestriche und muss unberuehrt bleiben.
     *
     * Bewusst rein textuell und ohne DateTimeFormatter: der Zeitstempel ist
     * durchgehend UTC und festbreit, ein Parser waere nur eine zusaetzliche
     * Fehlerquelle (dieselbe Begruendung wie bei
     * NoteArchiveService.list(), das aus demselben Grund lexikografisch
     * sortiert).
     *
     * Die Millisekunden fehlen absichtlich - Werte aus der Oberflaeche haben
     * sie ("2026-08-21T09:53:02.421Z"), aber beide Formen sind gueltiges
     * ISO-8601 und vergleichen sich lexikografisch korrekt gegeneinander. Ein
     * Unterschied entsteht nur bei GLEICHEM Sekundenwert (dann sortiert die
     * kurze Form hinter der langen, weil 'Z' > '.'), und innerhalb derselben
     * Sekunde ist die Reihenfolge ohnehin beliebig. Passt der Zeitstempel
     * nicht zum erwarteten Format, wird er unveraendert uebernommen - genau
     * wie NoteArchiveService.timestampOf() im Zweifel den Dateinamen liefert.
     */
    private static String toIsoInstant(String fileTimestamp) {
        int t = fileTimestamp.indexOf('T');
        if (t < 0) {
            return fileTimestamp;
        }
        return fileTimestamp.substring(0, t + 1)
                + fileTimestamp.substring(t + 1).replace('-', ':');
    }

    /**
     * Schreibt roh zurueck, also OHNE den Pseudonymisierungsschritt aus
     * NoteArchiveService.write(). Zulaessig, weil hier ausschliesslich
     * created und tableId geaendert werden: die Personenzellen gehen
     * unveraendert - und damit weiterhin pseudonymisiert - wieder in die
     * Datei. Ueber write() zu gehen waere sogar schaedlich, da es bei
     * fehlendem Register abbricht.
     *
     * Pretty-Printer und AtomicFileWriter wie in NoteArchiveService.write():
     * dieselbe Formatierung (sonst schreibt der erste normale Speichervorgang
     * die Datei komplett um) und dieselbe Absturzsicherheit.
     */
    private void writeRaw(String fileName, NoteTableData data) {
        Path file = archiveService.resolveExistingFile(fileName);
        try {
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(data);
            atomicFileWriter.writeUtf8(file, json);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Archiv-Notiz nicht migrieren: " + file, e);
        }
    }
}
