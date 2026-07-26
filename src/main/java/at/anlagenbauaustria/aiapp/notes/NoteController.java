package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.notes.model.ParseResult;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Rohtext-API fuer den Notiz-Editor (Konzept Kapitel 9): Speichern ist
 * reines Persistieren, Validierung ist ein separater, seitenlast-freier
 * Aufruf fuer die Live-Anzeige (kein Ingest, keine Datei wird dabei
 * geschrieben).
 */
@RestController
@RequestMapping("/api/notes")
public class NoteController {

    private final NoteFileService noteFileService;
    private final NoteSyntaxParser noteSyntaxParser;

    public NoteController(NoteFileService noteFileService, NoteSyntaxParser noteSyntaxParser) {
        this.noteFileService = noteFileService;
        this.noteSyntaxParser = noteSyntaxParser;
    }

    @GetMapping("/{date}")
    public NoteDayResponse get(@PathVariable("date") String date) {
        LocalDate parsed = LocalDate.parse(date);
        return new NoteDayResponse(date, noteFileService.readBody(parsed));
    }

    @PutMapping("/{date}")
    public void put(@PathVariable("date") String date, @RequestBody NoteDayRequest request) {
        LocalDate parsed = LocalDate.parse(date);
        noteFileService.writeBody(parsed, request.content());
    }

    @PostMapping("/validate")
    public List<LineValidation> validate(@RequestBody ValidateRequest request) {
        String[] lines = request.content().split("\n", -1);
        List<LineValidation> results = new java.util.ArrayList<>();
        for (int i = 0; i < lines.length; i++) {
            ParseResult result = noteSyntaxParser.parse(lines[i]);
            if (result.isBlank()) {
                results.add(new LineValidation(i, true, null, List.of()));
            } else if (result.isError()) {
                results.add(new LineValidation(i, false, result.error(), List.of()));
            } else {
                List<at.anlagenbauaustria.aiapp.notes.model.Warning> warnings = result.notes().stream()
                        .flatMap(n -> n.warnings().stream())
                        .toList();
                results.add(new LineValidation(i, false, null, warnings));
            }
        }
        return results;
    }

    public record NoteDayResponse(String date, String content) {
    }

    public record NoteDayRequest(String content) {
    }

    public record ValidateRequest(String content) {
    }
}
