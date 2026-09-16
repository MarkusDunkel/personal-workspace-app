package at.anlagenbauaustria.aiapp.notes.archive;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Es kann ueberhaupt nicht pseudonymisiert werden, weil das Register fehlt,
 * unlesbar oder leer ist. Das Schreiben wird abgelehnt, statt Klarnamen nach
 * 2_ai-ready zu lassen - dorthin darf nur pseudonymisierter Text.
 *
 * Nur noch dieser Fall. Ein EINZELNER Wert, den das Register nicht kennt,
 * loest hier nichts mehr aus: er wird gemeldet und unveraendert
 * mitgeschrieben (Begruendung in NoteArchiveService.write).
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class NotPseudonymizableException extends RuntimeException {

    public NotPseudonymizableException(String message) {
        super(message);
    }
}
