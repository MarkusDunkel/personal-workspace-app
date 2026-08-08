package at.anlagenbauaustria.aiapp.claude;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.BAD_REQUEST)
public class UnknownPromptException extends RuntimeException {

    public UnknownPromptException(String promptId) {
        super("Unbekannte promptId: " + promptId);
    }
}
