package at.anlagenbauaustria.aiapp.notes.archive;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Ein Name in einer Personenspalte (Von/An/Quelle) laesst sich nicht
 * pseudonymisieren, weil er im Register fehlt. Das Schreiben wird abgelehnt,
 * statt einen Klarnamen nach 2_ai-ready zu lassen - dorthin darf nur
 * pseudonymisierter Text.
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class NotPseudonymizableException extends RuntimeException {

    public NotPseudonymizableException(String message) {
        super(message);
    }
}
