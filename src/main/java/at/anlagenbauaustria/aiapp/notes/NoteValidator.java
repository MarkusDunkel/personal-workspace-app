package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.notes.model.Note;
import at.anlagenbauaustria.aiapp.notes.model.NoteType;
import at.anlagenbauaustria.aiapp.notes.model.ParseResult;
import at.anlagenbauaustria.aiapp.notes.model.Warning;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Trennt Parsing (reine Grammatik, {@link NoteSyntaxParser}) von Validierung
 * (Vollstaendigkeit/Plausibilitaet, Konzept Kapitel 10.8/12) - beide sind
 * unabhaengig erweiterbar. Diese Klasse loest zusaetzlich relative
 * Datumsausdruecke auf ein festes Referenzdatum auf (Europe/Vienna,
 * Konzept offene Entscheidung 22), was der reine Parser bewusst nicht tut.
 */
@Component
public class NoteValidator {

    private static final ZoneId ZONE = ZoneId.of("Europe/Vienna");
    private static final Map<String, DayOfWeek> WEEKDAY_ABBREVIATIONS = Map.of(
            "mo", DayOfWeek.MONDAY,
            "di", DayOfWeek.TUESDAY,
            "mi", DayOfWeek.WEDNESDAY,
            "do", DayOfWeek.THURSDAY,
            "fr", DayOfWeek.FRIDAY,
            "sa", DayOfWeek.SATURDAY,
            "so", DayOfWeek.SUNDAY
    );

    /**
     * Reichert notes aus einem ParseResult mit dem tatsaechlichen Datum fuer
     * noch ungeloeste relative Ausdruecke an (z.B. "Fr" -> naechster
     * Freitag). Der reine Parser laesst diese Faelle bewusst offen, weil er
     * das aktuelle Datum nicht kennen soll (Referenztransparenz).
     */
    public List<Note> resolveRelativeDates(ParseResult result, LocalDate referenceDate) {
        List<Note> resolved = new ArrayList<>();
        for (Note note : result.notes()) {
            resolved.add(resolveRelativeDate(note, referenceDate));
        }
        return resolved;
    }

    private Note resolveRelativeDate(Note note, LocalDate referenceDate) {
        if (note.due() != null || note.dueRaw() == null) {
            return note;
        }
        LocalDate resolved = resolveExpression(note.dueRaw(), referenceDate);
        if (resolved == null) {
            return note;
        }
        List<Warning> warningsWithoutUnresolved = note.warnings().stream()
                .filter(w -> !Warning.UNRESOLVED_DATE.equals(w.code()))
                .toList();
        return new Note(note.type(), note.source(), note.sourceForced(), note.text(),
                resolved.toString(), note.dueRaw(), note.priority(), note.project(),
                note.assignee(), note.tags(), note.confidential(), note.done(), note.fileRef(),
                warningsWithoutUnresolved, note.linkedFollowUp());
    }

    private LocalDate resolveExpression(String raw, LocalDate referenceDate) {
        String v = raw.trim().toLowerCase();
        if (v.equals("heute")) {
            return referenceDate;
        }
        if (v.equals("morgen")) {
            return referenceDate.plusDays(1);
        }
        if (v.equals("übermorgen") || v.equals("uebermorgen")) {
            return referenceDate.plusDays(2);
        }
        DayOfWeek weekday = WEEKDAY_ABBREVIATIONS.get(v);
        if (weekday != null) {
            return nextOrSameWeekday(referenceDate, weekday);
        }
        if (v.matches("\\+\\d+d")) {
            int days = Integer.parseInt(v.substring(1, v.length() - 1));
            return referenceDate.plusDays(days);
        }
        return null;
    }

    private LocalDate nextOrSameWeekday(LocalDate from, DayOfWeek target) {
        LocalDate candidate = from;
        do {
            candidate = candidate.plusDays(1);
        } while (candidate.getDayOfWeek() != target);
        return candidate;
    }

    /**
     * Zusaetzliche, ueber die reine Grammatik hinausgehende Plausibilitaets-
     * warnungen (Konzept Kapitel 10.8) - aktuell nur ein Platzhalter fuer
     * Regeln, die den vollen Note-Kontext brauchen (z.B. Dubletten werden
     * erst im Ingest-Lauf/02_classify_dedupe geprueft, nicht hier).
     */
    public List<Warning> additionalWarnings(Note note) {
        List<Warning> warnings = new ArrayList<>();
        if (note.type() == NoteType.TASK_DELEGATE
                && (note.assignee() == null || note.assignee().isBlank())
                && note.warnings().stream().noneMatch(w -> Warning.MISSING_RECIPIENT.equals(w.code()))) {
            warnings.add(new Warning(Warning.MISSING_RECIPIENT,
                    "Delegierte Aufgabe ohne Empfaenger (->)."));
        }
        return warnings;
    }
}
