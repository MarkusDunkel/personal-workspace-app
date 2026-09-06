package at.anlagenbauaustria.aiapp.views.model;

/**
 * Ergebnis eines "Neu erzeugen"-Laufs (Reidentify + Publish), aufgebaut wie
 * DigestApplyResult im Azure-Boards-Bereich.
 *
 * log traegt die gesammelte Ausgabe BEIDER Skripte - auch im Erfolgsfall, da
 * die Builder Warnungen ausgeben (uebersprungene Aufgaben o.ae.), die der
 * Nutzer sehen koennen muss.
 *
 * outputPath ist der ai-vault-relative Pfad aus ViewKind, nicht der
 * Git-Bash-Pfad ("/c/...") aus der Skriptausgabe - letzterer waere in der
 * Oberflaeche unbrauchbar.
 */
public record ViewRefreshResult(
        boolean success,
        String outputPath,
        String generatedAt,
        String log,
        String error) {

    public static ViewRefreshResult success(String outputPath, String generatedAt, String log) {
        return new ViewRefreshResult(true, outputPath, generatedAt, log, null);
    }

    public static ViewRefreshResult failure(String error, String log) {
        return new ViewRefreshResult(false, null, null, log, error);
    }
}
