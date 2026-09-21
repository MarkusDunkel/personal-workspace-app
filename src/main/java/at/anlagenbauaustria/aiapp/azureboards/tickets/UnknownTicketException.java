package at.anlagenbauaustria.aiapp.azureboards.tickets;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Kein Ticket mit dieser Id im angefragten Projekt. Tritt im Alltag vor allem
 * auf, wenn ein Ticket in Azure geloescht wurde und der naechste Ingest es aus
 * 2_ai-ready entfernt hat, waehrend es in der Oberflaeche noch offen war.
 */
@ResponseStatus(HttpStatus.NOT_FOUND)
public class UnknownTicketException extends RuntimeException {

    public UnknownTicketException(Category category, String ticketId) {
        super("Kein Ticket mit der Id " + ticketId + " im Projekt " + category.segment() + ".");
    }
}
