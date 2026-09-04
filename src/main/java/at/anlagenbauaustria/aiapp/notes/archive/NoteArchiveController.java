package at.anlagenbauaustria.aiapp.notes.archive;

import at.anlagenbauaustria.aiapp.notes.archive.model.ArchiveFileInfo;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
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
 * REST-API fuer die bereits abgesendeten Notizen aus 2_ai-ready/notes/.
 *
 * Bewusst ein eigener Controller und nicht Teil von NoteController: dort
 * wuerde @GetMapping("/{tableId}") denselben Pfad mit abdecken. Vor allem
 * aber fehlt hier die ListsService-Abhaengigkeit - abgelegte Notizen duerfen
 * KEINE Werte in die Vorschlagslisten aufnehmen, sonst landen Pseudonyme
 * ("Person_007") in der Kontaktliste, aus der die laufende Tabelle
 * autovervollstaendigt. Auch markTasksActive entfaellt: das existiert nur,
 * um Zeichen-Offsets vor der Pseudonymisierung festzuhalten, und ist bei
 * bereits pseudonymisierten Dateien bedeutungslos.
 */
@RestController
@RequestMapping("/api/notes/archive")
public class NoteArchiveController {

    private final NoteArchiveService archiveService;

    public NoteArchiveController(NoteArchiveService archiveService) {
        this.archiveService = archiveService;
    }

    @GetMapping
    public List<ArchiveFileInfo> list() {
        return archiveService.list();
    }

    @GetMapping("/{fileName}")
    public NoteTableData get(@PathVariable String fileName) {
        return archiveService.read(fileName);
    }

    @PutMapping("/{fileName}")
    public void put(@PathVariable String fileName, @RequestBody NoteTableData body) {
        archiveService.write(fileName, body);
    }

    /**
     * Spring Boot blendet exception.getMessage() in der Standard-Fehlerantwort
     * aus (server.error.include-message=never per Default). Diese Meldung
     * nennt aber Zeile und Spalte des Namens, der nicht pseudonymisiert werden
     * konnte - ohne sie waere der Fehler fuer den Nutzer nicht handlungsfaehig.
     * Daher hier explizit als Body, statt die Einstellung global zu lockern.
     */
    @ExceptionHandler(NotPseudonymizableException.class)
    public ResponseEntity<Map<String, String>> handleNotPseudonymizable(NotPseudonymizableException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", e.getMessage()));
    }
}
