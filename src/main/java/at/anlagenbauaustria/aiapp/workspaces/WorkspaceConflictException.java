package at.anlagenbauaustria.aiapp.workspaces;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Die Datei wurde seit dem Laden von aussen geaendert - im Arbeitsablauf
 * praktisch immer durch VS Code, das dieselben Dateien bearbeitet.
 *
 * Bewusst eine Ablehnung statt eines stillen Ueberschreibens: eine fremde
 * Aenderung zu ueberschreiben ist das einzige Ergebnis, das unsichtbar Arbeit
 * vernichtet. Zusammenfuehren waere die Alternative, ist fuer zwei
 * Markdown-Dokumente aber ausserhalb des Umfangs.
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class WorkspaceConflictException extends RuntimeException {

    public WorkspaceConflictException(String message) {
        super(message);
    }
}
