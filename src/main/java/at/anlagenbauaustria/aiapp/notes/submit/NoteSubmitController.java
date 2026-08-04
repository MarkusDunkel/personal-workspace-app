package at.anlagenbauaustria.aiapp.notes.submit;

import at.anlagenbauaustria.aiapp.pipeline.PipelineRunner.PipelineExecutionException;
import at.anlagenbauaustria.aiapp.notes.submit.model.SubmitDecisionsRequest;
import at.anlagenbauaustria.aiapp.notes.submit.model.SubmitResult;
import at.anlagenbauaustria.aiapp.notes.submit.model.SubmitStartResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST-API fuer den Absenden-Flow (Pseudonymisierung ueber die
 * Weboberflaeche): startet den Scan, nimmt die Nutzerentscheidungen aus
 * dem Review-Dialog entgegen und stoesst danach update-register +
 * run_pseudonymize.sh an.
 */
@RestController
@RequestMapping("/api/notes/submit")
public class NoteSubmitController {

    private final NoteSubmitService service;

    public NoteSubmitController(NoteSubmitService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<?> start() {
        try {
            SubmitStartResponse response = service.startReview();
            return ResponseEntity.ok(response);
        } catch (PipelineExecutionException e) {
            return ResponseEntity.internalServerError().body(SubmitResult.failure(e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(SubmitResult.failure(e.getMessage()));
        }
    }

    @PostMapping("/decisions")
    public ResponseEntity<SubmitResult> decisions(@RequestBody SubmitDecisionsRequest request) {
        try {
            SubmitResult result = service.applyDecisions(request.reviewToken(), request.decisions());
            return result.success() ? ResponseEntity.ok(result) : ResponseEntity.internalServerError().body(result);
        } catch (PipelineExecutionException e) {
            return ResponseEntity.internalServerError().body(SubmitResult.failure(e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(SubmitResult.failure(e.getMessage()));
        }
    }
}
