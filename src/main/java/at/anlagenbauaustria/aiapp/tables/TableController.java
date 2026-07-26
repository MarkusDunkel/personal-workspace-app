package at.anlagenbauaustria.aiapp.tables;

import at.anlagenbauaustria.aiapp.tables.model.TableData;
import at.anlagenbauaustria.aiapp.tables.model.TableDefinition;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST-API fuer die Tabellen-UI (Aufgabe/Info): strukturierte, tages-
 * uebergreifende Zeilenlisten, im Unterschied zu /api/notes (Rohtext,
 * pro Tag).
 */
@RestController
@RequestMapping("/api/tables")
public class TableController {

    private final TableRegistry registry;
    private final TableDataService dataService;

    public TableController(TableRegistry registry, TableDataService dataService) {
        this.registry = registry;
        this.dataService = dataService;
    }

    @GetMapping
    public List<TableDefinition> listDefinitions() {
        return registry.getAll();
    }

    @GetMapping("/{tableId}")
    public TableData get(@PathVariable String tableId) {
        registry.get(tableId).orElseThrow(() -> new UnknownTableException(tableId));
        return dataService.read(tableId);
    }

    @PutMapping("/{tableId}")
    public void put(@PathVariable String tableId, @RequestBody TableData body) {
        registry.get(tableId).orElseThrow(() -> new UnknownTableException(tableId));
        dataService.write(tableId, body);
    }
}
