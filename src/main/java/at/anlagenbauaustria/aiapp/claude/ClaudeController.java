package at.anlagenbauaustria.aiapp.claude;

import at.anlagenbauaustria.aiapp.claude.ClaudeCliRunner.ClaudeCliExecutionException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api/claude")
public class ClaudeController {

    private final ClaudeService claudeService;

    public ClaudeController(ClaudeService claudeService) {
        this.claudeService = claudeService;
    }

    @GetMapping("/prompts")
    public List<PromptSummary> prompts() {
        return Arrays.stream(PromptCatalogEntry.values())
                .map(entry -> new PromptSummary(entry.id(), entry.label()))
                .toList();
    }

    @PostMapping("/improve")
    public ResponseEntity<?> improve(@RequestBody ImproveRequest request) {
        try {
            String improved = claudeService.improveText(
                    request.promptId(), request.text(), request.projekt(), request.meeting());
            return ResponseEntity.ok(new ImproveResponse(improved));
        } catch (UnknownPromptException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new ErrorBody(e.getMessage()));
        } catch (ClaudeCliExecutionException e) {
            return ResponseEntity.internalServerError().body(new ErrorBody(e.getMessage()));
        }
    }

    public record ImproveRequest(String promptId, String text, String projekt, String meeting) {}

    public record ImproveResponse(String improvedText) {}

    public record ErrorBody(String message) {}

    public record PromptSummary(String id, String label) {}
}
