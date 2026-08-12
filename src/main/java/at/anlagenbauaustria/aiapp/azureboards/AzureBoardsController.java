package at.anlagenbauaustria.aiapp.azureboards;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;
import at.anlagenbauaustria.aiapp.azureboards.model.DigestApplyRequest;
import at.anlagenbauaustria.aiapp.azureboards.model.DigestApplyResult;
import at.anlagenbauaustria.aiapp.azureboards.model.DigestPlanRequest;
import at.anlagenbauaustria.aiapp.azureboards.model.DigestPlanResponse;
import at.anlagenbauaustria.aiapp.azureboards.model.IngestApplyRequest;
import at.anlagenbauaustria.aiapp.azureboards.model.IngestResult;
import at.anlagenbauaustria.aiapp.azureboards.model.IngestScanRequest;
import at.anlagenbauaustria.aiapp.azureboards.model.IngestScanResponse;
import at.anlagenbauaustria.aiapp.pipeline.PipelineRunner.PipelineExecutionException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST-API fuer den Azure-Boards-JSON-Roundtrip (Ingest/Digest), analog zu
 * notes.submit.NoteSubmitController: ruft AzureBoardsService auf, das
 * seinerseits ausschliesslich bestehende ai-vault-Skripte per
 * PipelineRunner ausfuehrt.
 */
@RestController
@RequestMapping("/api/azureboards")
public class AzureBoardsController {

    private final AzureBoardsService service;

    public AzureBoardsController(AzureBoardsService service) {
        this.service = service;
    }

    @PostMapping("/ingest/scan")
    public ResponseEntity<?> scanIngest(@RequestBody IngestScanRequest request) {
        try {
            Category category = Category.fromSegment(request.category());
            IngestScanResponse response = service.scanForReview(category);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(IngestResult.failure(e.getMessage(), null));
        } catch (PipelineExecutionException e) {
            return ResponseEntity.internalServerError().body(IngestResult.failure(e.getMessage(), null));
        }
    }

    @PostMapping("/ingest/apply")
    public ResponseEntity<IngestResult> applyIngest(@RequestBody IngestApplyRequest request) {
        try {
            // category wird nur gebraucht, wenn reviewToken null ist (siehe
            // IngestApplyRequest-Javadoc) - in diesem Fall muss sie im
            // Request mitgeschickt worden sein, sonst kann applyIngest nicht
            // wissen, welchen run_pseudonymize.sh-Aufruf es ausfuehren soll.
            Category category = request.reviewToken() == null
                    ? Category.fromSegment(request.category())
                    : null;
            IngestResult result = service.applyIngest(request.reviewToken(), request.decisions(), category);
            return result.success() ? ResponseEntity.ok(result) : ResponseEntity.internalServerError().body(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(IngestResult.failure(e.getMessage(), null));
        } catch (PipelineExecutionException e) {
            return ResponseEntity.internalServerError().body(IngestResult.failure(e.getMessage(), null));
        }
    }

    @PostMapping("/digest/plan")
    public ResponseEntity<?> planDigest(@RequestBody DigestPlanRequest request) {
        try {
            Category category = Category.fromSegment(request.category());
            DigestPlanResponse response = service.planDigest(category);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(DigestApplyResult.failure(e.getMessage(), null));
        } catch (PipelineExecutionException e) {
            return ResponseEntity.internalServerError().body(DigestApplyResult.failure(e.getMessage(), null));
        } catch (java.io.UncheckedIOException e) {
            // Faengt u.a. Fehler beim Lesen des Plan-Reports ab (z.B. falsch
            // aufgeloester Pfad) - ohne diesen Fang kam beim Nutzer ein
            // nackter HTTP 500 ohne jede Fehlermeldung an, was die Ursache
            // unnoetig schwer auffindbar machte.
            return ResponseEntity.internalServerError()
                    .body(DigestApplyResult.failure(e.getMessage(), null));
        }
    }

    @PostMapping("/digest/apply")
    public ResponseEntity<DigestApplyResult> applyDigest(@RequestBody DigestApplyRequest request) {
        try {
            DigestApplyResult result = service.applyDigest(request.planToken());
            return result.success() ? ResponseEntity.ok(result) : ResponseEntity.internalServerError().body(result);
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(DigestApplyResult.failure(e.getMessage(), null));
        } catch (PipelineExecutionException e) {
            return ResponseEntity.internalServerError().body(DigestApplyResult.failure(e.getMessage(), null));
        }
    }
}
