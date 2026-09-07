package at.anlagenbauaustria.aiapp.azureboards.model;

import java.util.List;

/**
 * Ergebnis des Ingest-Roundtrips.
 *
 * <p>{@code warning} und {@code conflictFiles} tragen den Fall "erfolgreich,
 * aber es braucht eine Entscheidung": Der 3-Wege-Merge
 * ({@code run_merge.sh --merge}) liefert Exit 5, wenn beide Seiten dasselbe
 * Feld geaendert haben. Das ist kein Fehler -- das Ergebnis ist geschrieben --
 * aber die betroffenen Items tragen einen {@code _conflicts}-Schluessel, und
 * {@code run_import.sh} verweigert die Planung, solange der stehen bleibt.
 * Deshalb muss die Oberflaeche das sichtbar machen statt einfach "fertig" zu
 * melden.
 */
public record IngestResult(
        boolean success,
        String log,
        String error,
        String warning,
        List<String> conflictFiles
) {
    public static IngestResult success(String log) {
        return new IngestResult(true, log, null, null, List.of());
    }

    /** Erfolgreich, aber mit offenen Merge-Konflikten (Exit 5). */
    public static IngestResult successWithWarning(
            String log, String warning, List<String> conflictFiles) {
        return new IngestResult(true, log, null, warning, List.copyOf(conflictFiles));
    }

    public static IngestResult failure(String error, String log) {
        return new IngestResult(false, log, error, null, List.of());
    }
}
