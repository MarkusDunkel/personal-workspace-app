package at.anlagenbauaustria.aiapp.azureboards.tickets;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Die Ticket-Datei hat sich seit dem Laden geaendert - typischerweise durch
 * einen Pipeline-Lauf, der das ganze Verzeichnis neu schreibt
 * (run_pseudonymize.sh leert es vorher), oder durch eine Bearbeitung in
 * VS Code.
 *
 * Zwilling zu WorkspaceConflictException. Wird auch geworfen, wenn sich der
 * DIALEKT des Feldes zwischenzeitlich geaendert hat: dann stammt der Entwurf
 * aus einem anderen Format und darf nicht blind daruebergeschrieben werden.
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class TicketConflictException extends RuntimeException {

    public TicketConflictException(String message) {
        super(message);
    }
}
