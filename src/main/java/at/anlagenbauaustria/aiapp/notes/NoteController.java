package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.lists.ListsService;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableDefinition;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableRow;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * REST-API fuer die Notes-UI: eine gemeinsame Tabelle, deren Zeilen per
 * "typ"-Zelle (Aufgabe/Info) einen unterschiedlichen zusaetzlichen
 * Spaltensatz haben (siehe NoteRegistry).
 */
@RestController
@RequestMapping("/api/notes")
public class NoteController {

    private static final String STATUS_ACTIVE = "aktiv";

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
        NoteTableData withStatus = markTasksActive(body);
        dataService.write(tableId, withStatus);
        registerNewListValues(withStatus);
    }

    /**
     * Setzt status="aktiv" bereits beim Speichern jeder typ="Aufgabe"-Zeile
     * (idempotent per putIfAbsent), statt erst nachtraeglich beim
     * Pseudonymisierungs-Absenden (siehe NoteSubmitService). Wuerde der
     * Status erst dort gesetzt, wuerde notes.json zwischen Scan und Apply
     * neu geschrieben und dabei die vom Scan gemessenen Zeichen-Positionen
     * verschieben - das ist Voraussetzung fuer die positionsgenaue
     * Pseudonymisierung ("nur diese Stelle"). status hat fuer den
     * Pseudonymisierungsvorgang selbst keine Bedeutung, dient nur einem
     * spaeteren Kanban-Board auf Basis von 2_ai-ready; andere Typen (z.B.
     * "Info") bleiben unangetastet.
     */
    private NoteTableData markTasksActive(NoteTableData data) {
        List<NoteTableRow> updated = new ArrayList<>();
        for (NoteTableRow row : data.rows()) {
            if (!"Aufgabe".equals(row.cells().get("typ"))) {
                updated.add(row);
                continue;
            }
            Map<String, String> cells = new LinkedHashMap<>(row.cells());
            cells.putIfAbsent("status", STATUS_ACTIVE);
            updated.add(new NoteTableRow(row.id(), cells, row.order()));
        }
        return new NoteTableData(data.tableId(), updated);
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
