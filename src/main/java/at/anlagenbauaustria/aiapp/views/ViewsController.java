package at.anlagenbauaustria.aiapp.views;

import at.anlagenbauaustria.aiapp.fs.PathTraversalException;
import at.anlagenbauaustria.aiapp.pipeline.PipelineRunner.PipelineExecutionException;
import at.anlagenbauaustria.aiapp.views.model.ViewInfo;
import at.anlagenbauaustria.aiapp.views.model.ViewKind;
import at.anlagenbauaustria.aiapp.views.model.ViewRefreshResult;
import at.anlagenbauaustria.aiapp.views.model.StakeholderOrder;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * REST-API der Ansichten (Cockpit, Stakeholder, Costs) aus 5_output.
 *
 * WICHTIG - Zuschnitt der Pfade: Das Verb steht VOR der Id
 * ("/html/{id}", "/refresh/{id}"), nicht umgekehrt. Ein "/{id}" mit
 * Unterressourcen darunter waere genau die Falle, an der
 * NoteController/NoteArchiveController auseinandergegangen sind (siehe
 * Javadoc in WorkspaceController): die Pfadvariable verschluckt sonst jede
 * spaetere Schwester-Route. So bleibt {id} ueberall Blatt.
 *
 * Der HTML-Endpunkt ist die einzige Stelle der App, die nicht JSON liefert
 * (sonst durchgehend, siehe WorkspaceDocument-Javadoc). Begruendung: die
 * Oberflaeche bindet die Seite als iframe ein und laesst den Browser sie
 * nativ laden - das ist bei 0,7 bis 1,3 MB grossen, in sich geschlossenen
 * Seiten mit eingebettetem vis.js/Plotly die einzige tragfaehige Variante.
 */
@RestController
@RequestMapping("/api/views")
public class ViewsController {

    private final ViewsService service;
    private final ViewSettingsService settings;

    public ViewsController(ViewsService service, ViewSettingsService settings) {
        this.service = service;
        this.settings = settings;
    }

    @GetMapping
    public List<ViewInfo> list() {
        return service.list();
    }

    @GetMapping("/html/{id}")
    public ResponseEntity<?> html(@PathVariable String id) {
        Path file;
        try {
            file = service.resolveHtml(ViewKind.fromId(id));
        } catch (IllegalArgumentException | PathTraversalException e) {
            return ResponseEntity.badRequest().body(errorBody(e));
        } catch (IllegalStateException e) {
            return ResponseEntity.notFound().build();
        }

        long length;
        try {
            length = Files.size(file);
        } catch (IOException e) {
            throw new UncheckedIOException("Konnte Ansicht nicht lesen: " + file, e);
        }

        Resource body = new FileSystemResource(file);
        return ResponseEntity.ok()
                // Charset explizit: MediaType.TEXT_HTML allein traegt keines,
                // und die erzeugten Seiten sind deutschsprachig (Umlaute).
                .contentType(new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
                // Die URL bleibt gleich, der Inhalt wechselt bei jedem
                // Neuerzeugen - dieselbe Falle wie bei index.html (siehe
                // StaticResourceCacheConfig). noStore statt noCache, weil es
                // hier weder ETag noch Last-Modified-Behandlung gibt.
                .cacheControl(CacheControl.noStore())
                .contentLength(length)
                .body(body);
    }

    @PostMapping("/refresh/{id}")
    public ResponseEntity<ViewRefreshResult> refresh(@PathVariable String id) {
        try {
            ViewRefreshResult result = service.refresh(ViewKind.fromId(id));
            return result.success()
                    ? ResponseEntity.ok(result)
                    : ResponseEntity.internalServerError().body(result);
        } catch (IllegalArgumentException | IllegalStateException | PathTraversalException e) {
            return ResponseEntity.badRequest().body(ViewRefreshResult.failure(e.getMessage(), null));
        } catch (PipelineExecutionException e) {
            return ResponseEntity.internalServerError()
                    .body(ViewRefreshResult.failure(e.getMessage(), null));
        }
    }

    /**
     * Manuelle Reihenfolge der beiden Stakeholder-Ansichten (geteilt). Wird
     * von der Seite im iframe selbst aufgerufen - gleiche Origin wie
     * "/html/{id}", daher ohne CORS.
     */
    @GetMapping("/settings/stakeholder-order")
    public StakeholderOrder stakeholderOrder() {
        return StakeholderOrder.of(settings.readOrder());
    }

    @PutMapping("/settings/stakeholder-order")
    public ResponseEntity<?> saveStakeholderOrder(@RequestBody StakeholderOrder body) {
        try {
            return ResponseEntity.ok(StakeholderOrder.of(
                    settings.writeOrder(body == null ? null : body.entries())));
        } catch (IllegalArgumentException | PathTraversalException e) {
            return ResponseEntity.badRequest().body(errorBody(e));
        }
    }

    /**
     * Standard-Auswahl (ausgeblendete Eintraege) der beiden
     * Stakeholder-Ansichten (geteilt). "ids" = ausgeblendete Work-Item-IDs.
     */
    @GetMapping("/settings/stakeholder-hidden")
    public StakeholderOrder stakeholderHidden() {
        return StakeholderOrder.of(settings.readHidden());
    }

    @PutMapping("/settings/stakeholder-hidden")
    public ResponseEntity<?> saveStakeholderHidden(@RequestBody StakeholderOrder body) {
        try {
            return ResponseEntity.ok(StakeholderOrder.of(
                    settings.writeHidden(body == null ? null : body.entries())));
        } catch (IllegalArgumentException | PathTraversalException e) {
            return ResponseEntity.badRequest().body(errorBody(e));
        }
    }

    /**
     * Spring Boot blendet exception.getMessage() in der Standard-Fehlerantwort
     * aus (server.error.include-message=never per Default) - ohne dieses
     * Ersatzobjekt kaeme beim Nutzer ein nackter 400 ohne Grund an.
     */
    private static ViewRefreshResult errorBody(Exception e) {
        return ViewRefreshResult.failure(e.getMessage(), null);
    }
}
