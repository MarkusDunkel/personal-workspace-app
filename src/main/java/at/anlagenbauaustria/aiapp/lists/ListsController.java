package at.anlagenbauaustria.aiapp.lists;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Liefert die drei Vorschlagslisten fuer die Notes-UI-Autocompletes.
 * Schreibzugriff passiert nicht ueber eigene Endpunkte, sondern automatisch
 * beim Speichern der Notizen-Tabelle (siehe NoteController.put) bzw. beim
 * Absenden (siehe NoteSubmitService).
 */
@RestController
public class ListsController {

    private final ListsService listsService;

    public ListsController(ListsService listsService) {
        this.listsService = listsService;
    }

    @GetMapping("/api/contacts")
    public List<String> contacts() {
        return listsService.readMerged(ListsService.CONTACTS_FILE);
    }

    @GetMapping("/api/projekte")
    public List<String> projekte() {
        return listsService.readMerged(ListsService.PROJEKTE_FILE);
    }

    @GetMapping("/api/meetings")
    public List<String> meetings() {
        return listsService.readMerged(ListsService.MEETINGS_FILE);
    }
}
