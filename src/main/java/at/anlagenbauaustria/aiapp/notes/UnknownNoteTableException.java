package at.anlagenbauaustria.aiapp.notes;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.NOT_FOUND)
public class UnknownNoteTableException extends RuntimeException {

    public UnknownNoteTableException(String tableId) {
        super("Unbekannte Tabelle: " + tableId);
    }
}
