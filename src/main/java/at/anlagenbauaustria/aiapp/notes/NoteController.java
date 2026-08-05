package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableDefinition;
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

    public NoteController(NoteRegistry registry, NoteDataService dataService) {
        this.registry = registry;
        this.dataService = dataService;
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
    }
}
