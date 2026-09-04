package at.anlagenbauaustria.aiapp.notes.archive;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.NOT_FOUND)
public class UnknownArchiveFileException extends RuntimeException {

    public UnknownArchiveFileException(String fileName) {
        super("Unbekannte Archiv-Notiz: " + fileName);
    }
}
