package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.lists.ListsService;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableDefinition;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableRow;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST-API fuer die Notes-UI: eine gemeinsame Tabelle, deren Zeilen per
 * "typ"-Zelle (Aufgabe/Info) einen unterschiedlichen zusaetzlichen
 * Spaltensatz haben (siehe NoteRegistry).
 */
@RestController
@RequestMapping("/api/notes")
public class NoteController {

    private final NoteRegistry registry;
    private final NoteDataService dataService;
    private final ListsService listsService;

    public NoteController(NoteRegistry registry, NoteDataService dataService, ListsService listsService) {
        this.registry = registry;
        this.dataService = dataService;
        this.listsService = listsService;
    }

    @GetMapping
    public List<NoteTableDefinition> listDefinitions() {
        return registry.getAll();
    }

    @GetMapping("/{tableId}")
    public NoteTableData get(@PathVariable String tableId) {
        registry.get(tableId).orElseThrow(() -> new UnknownNoteTableException(tableId));
        return dataService.read(tableId);
    }

    @PutMapping("/{tableId}")
    public void put(@PathVariable String tableId, @RequestBody NoteTableData body) {
        registry.get(tableId).orElseThrow(() -> new UnknownNoteTableException(tableId));
        dataService.write(tableId, body);
        registerNewListValues(body);
    }

    /**
     * Neue, noch unbekannte Projekt-/Meeting-/Personen-Werte werden beim
     * Speichern automatisch vorlaeufig in die jeweilige Vorschlagsliste
     * aufgenommen - egal ob sie ueber das Kopf-Eingabefeld oder das
     * Fokus-Dropdown gesetzt wurden. Endgueltig bestaetigt oder wieder
     * entfernt werden sie erst beim Absenden (siehe NoteSubmitService).
     */
    private void registerNewListValues(NoteTableData data) {
        for (NoteTableRow row : data.rows()) {
            addIfPresent(ListsService.PROJEKTE_FILE, row.cells().get("projekt"));
            addIfPresent(ListsService.MEETINGS_FILE, row.cells().get("meeting"));
            addIfPresent(ListsService.CONTACTS_FILE, row.cells().get("von"));
            addIfPresent(ListsService.CONTACTS_FILE, row.cells().get("an"));
            addIfPresent(ListsService.CONTACTS_FILE, row.cells().get("quelle"));
        }
    }

    private void addIfPresent(String fileName, String value) {
        if (value != null && !value.isBlank()) {
            listsService.addProvisional(fileName, value);
        }
    }
}
