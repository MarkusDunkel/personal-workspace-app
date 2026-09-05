package at.anlagenbauaustria.aiapp.workspaces;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Der Name ist ungueltig oder es gibt keine passende Datei in
 * 2_ai-ready/workspaces. Auch der Weg, auf dem ein Schreibversuch auf eine
 * nicht existierende Datei scheitert: Workspaces entstehen ausschliesslich
 * ausserhalb der App (VS Code), die App darf keine anlegen.
 */
@ResponseStatus(HttpStatus.NOT_FOUND)
public class UnknownWorkspaceException extends RuntimeException {

    public UnknownWorkspaceException(String name) {
        super("Unbekannter Workspace: " + name);
    }
}
