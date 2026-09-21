package at.anlagenbauaustria.aiapp.azureboards.tickets;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketDocument;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketSaveRequest;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketSaveResult;
import at.anlagenbauaustria.aiapp.azureboards.tickets.model.TicketSummary;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-API fuer einzelne Azure-Boards-Tickets in 2_ai-ready.
 *
 * Eigener Controller neben AzureBoardsController: dort geht es um das Starten
 * ganzer Pipeline-Laeufe (Ingest/Digest), hier um den Inhalt eines einzelnen
 * Feldes. Beides unter einem Praefix zu fuehren wuerde die Pfade der
 * Pipeline-Endpunkte mit Ticket-Ids vermischen.
 *
 * WICHTIG - Pfadzuschnitt: das Verb steht VOR den Bezeichnern
 * ("/list/{category}", "/item/{category}/{id}"). Ein "/{category}" mit
 * Unterressourcen darunter waere genau die Falle, an der
 * NoteController/NoteArchiveController auseinandergegangen sind (siehe
 * Javadoc in WorkspaceController): die Pfadvariable verschluckt sonst jede
 * spaetere Schwester-Route.
 */
@RestController
@RequestMapping("/api/azure-tickets")
public class AzureTicketController {

    private final AzureTicketService service;

    public AzureTicketController(AzureTicketService service) {
        this.service = service;
    }

    @GetMapping("/list/{category}")
    public List<TicketSummary> list(@PathVariable String category) {
        return service.list(Category.fromSegment(category));
    }

    @GetMapping("/item/{category}/{id}")
    public TicketDocument get(@PathVariable String category, @PathVariable String id) {
        return service.read(Category.fromSegment(category), id);
    }

    @PutMapping("/item/{category}/{id}")
    public TicketSaveResult put(
            @PathVariable String category,
            @PathVariable String id,
            @RequestBody TicketSaveRequest body) {
        return service.writeDescription(
                Category.fromSegment(category), id, body.description(), body.revision(), body.dialect());
    }

    /**
     * Wie in WorkspaceController: Spring Boot blendet exception.getMessage()
     * in der Standard-Fehlerantwort aus. Diese Meldung sagt dem Nutzer, dass
     * die Datei von aussen geaendert wurde und was zu tun ist - ohne sie waere
     * der Fehler nicht handlungsfaehig.
     */
    @ExceptionHandler(TicketConflictException.class)
    public ResponseEntity<Map<String, String>> handleConflict(TicketConflictException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
    }

    @ExceptionHandler(UnknownTicketException.class)
    public ResponseEntity<Map<String, String>> handleUnknown(UnknownTicketException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
    }

    /** Unbekanntes Projekt (Category.fromSegment) oder fehlendes Feld. */
    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    public ResponseEntity<Map<String, String>> handleBadRequest(RuntimeException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }
}
