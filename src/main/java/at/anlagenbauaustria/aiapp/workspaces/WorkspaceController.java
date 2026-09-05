package at.anlagenbauaustria.aiapp.workspaces;

import at.anlagenbauaustria.aiapp.workspaces.model.WorkspaceDocument;
import at.anlagenbauaustria.aiapp.workspaces.model.WorkspaceInfo;
import at.anlagenbauaustria.aiapp.workspaces.model.WorkspaceSaveRequest;
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
 * REST-API fuer die Arbeitsdokumente in 2_ai-ready/workspaces/.
 *
 * Die Pfadvariable traegt den Namen OHNE ".md" - der Dienst haengt die Endung
 * an. Das umgeht Springs Sonderbehandlung von Endungen in der letzten
 * Pfadkomponente und macht die Namenspruefung einfacher (ein Punkt muss gar
 * nicht erlaubt werden).
 *
 * WICHTIG: Unter "/{name}" darf keine Unterressource entstehen. Genau daran
 * ist NoteController/NoteArchiveController auseinandergegangen (siehe Javadoc
 * dort): "/{tableId}" haette "/archive" mit verschluckt. Kommt hier spaeter
 * etwas dazu, gehoert es auf ein eigenes Praefix.
 *
 * Es gibt bewusst KEIN POST und KEIN DELETE: Workspaces entstehen und
 * vergehen ausserhalb der App (per Befehl in VS Code), die App ist nur die
 * Bearbeitungsoberflaeche.
 */
@RestController
@RequestMapping("/api/workspaces")
public class WorkspaceController {

    private final WorkspaceService workspaceService;

    public WorkspaceController(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    @GetMapping
    public List<WorkspaceInfo> list() {
        return workspaceService.list();
    }

    @GetMapping("/{name}")
    public WorkspaceDocument get(@PathVariable String name) {
        return workspaceService.read(name);
    }

    @PutMapping("/{name}")
    public void put(@PathVariable String name, @RequestBody WorkspaceSaveRequest body) {
        workspaceService.write(name, body.markdown(), body.revision());
    }

    /**
     * Wie in NoteArchiveController: Spring Boot blendet
     * exception.getMessage() in der Standard-Fehlerantwort aus
     * (server.error.include-message=never per Default). Diese Meldung sagt
     * dem Nutzer, dass die Datei von aussen geaendert wurde und was zu tun
     * ist - ohne sie waere der Fehler nicht handlungsfaehig.
     */
    @ExceptionHandler(WorkspaceConflictException.class)
    public ResponseEntity<Map<String, String>> handleConflict(WorkspaceConflictException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", e.getMessage()));
    }
}
