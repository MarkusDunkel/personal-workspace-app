package at.anlagenbauaustria.aiapp.claude;

import org.springframework.stereotype.Service;

@Service
public class ClaudeService {

    private final ClaudeCliRunner runner;

    public ClaudeService(ClaudeCliRunner runner) {
        this.runner = runner;
    }

    public String improveText(String promptId, String cellText, String projekt, String meeting) {
        PromptCatalogEntry entry = PromptCatalogEntry.byId(promptId)
                .orElseThrow(() -> new UnknownPromptException(promptId));
        if (cellText == null || cellText.isBlank()) {
            throw new IllegalArgumentException("Zellentext darf nicht leer sein.");
        }
        String combinedPrompt = entry.promptText() + contextSuffix(projekt, meeting) + "\n\n" + cellText;
        return runner.run(combinedPrompt);
    }

    // Projekt/Meeting sind fuer die jeweilige Zeile optional (siehe
    // NoteRegistry - keine Pflichtfelder) - nur tatsaechlich befuellte
    // Werte fliessen als Kontext in den Prompt ein, damit das Modell bei
    // fehlenden Werten nicht auf eine leere/verwirrende Angabe reagiert.
    private String contextSuffix(String projekt, String meeting) {
        StringBuilder sb = new StringBuilder();
        if (projekt != null && !projekt.isBlank()) {
            sb.append(" Es geht um das Projekt \"").append(projekt).append("\".");
        }
        if (meeting != null && !meeting.isBlank()) {
            sb.append(" Es geht um das Meeting \"").append(meeting).append("\".");
        }
        return sb.toString();
    }
}
