package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.notes.model.Note;
import at.anlagenbauaustria.aiapp.notes.model.NoteType;
import at.anlagenbauaustria.aiapp.notes.model.ParseResult;
import at.anlagenbauaustria.aiapp.notes.model.Priority;
import at.anlagenbauaustria.aiapp.notes.model.Warning;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reine, seiteneffektfreie Implementierung der Syntaxsprache aus dem
 * Konzeptdokument, Kapitel 10/11. Diese Klasse ist absichtlich die einzige
 * Java-Implementierung der Grammatik (fuer die Live-Validierung im Editor);
 * der echte Ingest-Lauf (pipelines/notes/processing/01_parse) hat eine
 * unabhaengige Python-Implementierung mit denselben Testfaellen als
 * gemeinsamem Kontrakt (offene Entscheidung 22 im Konzept, Variante a).
 * <p>
 * Grammatik in Kuerze:
 * [Quelle:] [Typ-Praefix] Inhalt [| Praefix: Wert]...
 * <p>
 * Fortsetzungszeilen ("  + ...", Kapitel 10.6) werden nicht von dieser
 * Klasse behandelt, sondern vom Aufrufer vor dem Parsen zusammengefuehrt
 * (siehe {@link #joinContinuations(List)}), weil eine Fortsetzung erst im
 * Kontext mehrerer Zeilen erkennbar ist.
 * <p>
 * Quellenerkennung ("Huber: ..."): ohne bekannte Namensliste ist "Wort:" am
 * Zeilenanfang mehrdeutig (z.B. "Vertrauliche Info: ..." ist kein Name).
 * Mit einer bekannten Namensliste (siehe {@link #NoteSyntaxParser(Set)},
 * gespeist aus der in Konzept-Kapitel 22 vorgesehenen contacts.yml) wird nur
 * gegen diese Liste erkannt. Ohne Liste gilt die engere Heuristik "genau ein
 * Wort" (kein Leerzeichen) als Fallback.
 * <p>
 * Als Spring-Bean wird ausschliesslich der No-Arg-Konstruktor verwendet
 * (Autowiring-Kandidat) - die contacts.yml-Anbindung (Konstruktor mit
 * bekannten Namen) ist noch nicht verdrahtet (siehe README, Ausschau).
 */
@Component
public final class NoteSyntaxParser {

    private static final Pattern TYPE_PREFIX = Pattern.compile(
            "^(tm|td|t|d|r|risk|blk|nx):\\s*(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SOURCE_PREFIX = Pattern.compile("^([^:|]{1,60}):\\s*(.*)$");
    private static final Pattern FORCED_SOURCE = Pattern.compile("^q:\\s*(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern DONE_PREFIX = Pattern.compile("^x\\s+(.*)$");
    private static final Set<String> KNOWN_SEGMENT_PREFIXES = Set.of(
            "f", "p", "proj", "@", "->", ">>", "to", "nx", "f-doc", "q");

    private final Set<String> knownSources;

    public NoteSyntaxParser() {
        this(null);
    }

    /**
     * @param knownSources bekannte Namen (z.B. aus contacts.yml) fuer die
     *                     Quellenerkennung; {@code null} aktiviert die
     *                     Einzelwort-Fallback-Heuristik.
     */
    public NoteSyntaxParser(Set<String> knownSources) {
        this.knownSources = knownSources;
    }

    /**
     * Fuehrt Fortsetzungszeilen ("  + ...") mit ihrer vorangehenden Zeile
     * zusammen. Muss vor {@link #parse(String)} auf die vollstaendige
     * Zeilenliste einer Tagesdatei angewendet werden.
     */
    public List<String> joinContinuations(List<String> rawLines) {
        List<String> result = new ArrayList<>();
        for (String line : rawLines) {
            if (isContinuation(line) && !result.isEmpty()) {
                String previous = result.remove(result.size() - 1);
                result.add(previous + " " + line.trim().substring(1).trim());
            } else {
                result.add(line);
            }
        }
        return result;
    }

    private boolean isContinuation(String line) {
        return line.startsWith("  +") || line.startsWith("\t+");
    }

    /**
     * Sammelt das Ergebnis waehrend eine Zeile Segment fuer Segment
     * verarbeitet wird (Kopf und jedes |-Segment gleich, siehe
     * {@link #applySegment(String, ParseState)}). Mutable Hilfsklasse,
     * bewusst paketprivat und nicht Teil des oeffentlichen Modells.
     */
    private static final class ParseState {
        NoteType type = NoteType.INFO;
        String text = "";
        String source;
        boolean sourceForced;
        String due;
        String dueRaw;
        Priority priority;
        String project;
        String assignee;
        String fileRef;
        List<String> tags = new ArrayList<>();
        List<Warning> warnings = new ArrayList<>();
        List<String> extraTexts = new ArrayList<>();
        NoteType secondType;
        String secondText;
    }

    public ParseResult parse(String rawLine) {
        if (rawLine == null || rawLine.trim().isEmpty()) {
            return ParseResult.empty();
        }

        String line = rawLine.trim();
        boolean done = false;

        Matcher doneMatcher = DONE_PREFIX.matcher(line);
        if (doneMatcher.matches()) {
            done = true;
            line = doneMatcher.group(1).trim();
        }

        boolean confidential = false;
        if (line.equals("!") || line.endsWith(" !")) {
            confidential = true;
            line = line.equals("!") ? "" : line.substring(0, line.length() - 1).trim();
            if (line.isEmpty()) {
                return ParseResult.error("Zeile braucht Text nach dem Praefix.");
            }
        }
        // "! Text am Anfang" -> vertraulich, Text bleibt inkl. "!"-Praefix-Entfernung
        if (line.startsWith("! ")) {
            confidential = true;
            line = line.substring(2).trim();
        }

        List<String> segments = splitTopLevel(line, '|');
        String head = segments.isEmpty() ? "" : segments.get(0);
        List<String> tailSegments = segments.size() > 1 ? segments.subList(1, segments.size()) : List.of();

        ParseState state = new ParseState();

        // Kopfsegment: zuerst Quelle, dann Typ-Praefix versuchen (beide
        // sind nur am Zeilenanfang sinnvoll); der Rest des Kopfsegments
        // durchlaeuft danach dieselbe Segment-Logik wie jedes |-Segment
        // (Beispiel 11 braucht z.B. "f-doc:" auch als erstes Segment).
        Matcher forced = FORCED_SOURCE.matcher(head);
        if (forced.matches()) {
            state.source = forced.group(1).trim();
            state.sourceForced = true;
            head = "";
        } else {
            Matcher sourceMatcher = SOURCE_PREFIX.matcher(head);
            if (sourceMatcher.matches() && isKnownSourceLabel(sourceMatcher.group(1))) {
                state.source = sourceMatcher.group(1).trim();
                head = sourceMatcher.group(2).trim();
            }
        }

        // "-> Empfaenger" darf auch direkt im Kopf-Inhalt stehen (Beispiel 3).
        int arrowIdx = head.indexOf("->");
        if (arrowIdx >= 0) {
            state.assignee = head.substring(arrowIdx + 2).trim();
            head = head.substring(0, arrowIdx).trim();
        }

        if (!head.isEmpty()) {
            applySegment(head, state);
        }

        for (String rawSegment : tailSegments) {
            applySegment(rawSegment, state);
        }

        if (!state.extraTexts.isEmpty()) {
            String appendix = String.join(" ", state.extraTexts);
            state.text = state.text.isEmpty() ? appendix : state.text + " " + appendix;
        }

        if (state.text.isEmpty() && !state.sourceForced) {
            return ParseResult.error("Zeile braucht Text nach dem Praefix.");
        }

        if (state.type == NoteType.TASK_DELEGATE && (state.assignee == null || state.assignee.isBlank())) {
            state.warnings.add(new Warning(Warning.MISSING_RECIPIENT,
                    "Delegierte Aufgabe ohne Empfaenger (->)."));
        }

        Note primary = new Note(state.type, state.source, state.sourceForced, state.text, state.due,
                state.dueRaw, state.priority, state.project, state.assignee, List.copyOf(state.tags),
                confidential, done, state.fileRef, List.copyOf(state.warnings), null);

        if (state.secondType != null && state.secondText != null && !state.secondText.isBlank()) {
            Note secondary = new Note(state.secondType, state.source, state.sourceForced, state.secondText,
                    null, null, null, state.project, null, List.of(), confidential, false, null, List.of(), null);
            return ParseResult.of(List.of(primary, secondary));
        }

        return ParseResult.of(List.of(primary));
    }

    /**
     * Interpretiert genau ein Segment (Kopf ODER ein |-Segment - beide
     * werden identisch behandelt). Das erste Typ-Praefix, das auf ein
     * Segment ohne bisherigen Text trifft, bestimmt den Typ der primaeren
     * Einheit; jedes weitere eroeffnet eine verknuepfte Zweiteinheit
     * (Beispiel 19).
     */
    private void applySegment(String rawSegment, ParseState state) {
        String segment = rawSegment.trim();
        if (segment.isEmpty()) {
            return;
        }

        Matcher segType = TYPE_PREFIX.matcher(segment);
        if (segType.matches()) {
            NoteType matchedType = mapType(segType.group(1).toLowerCase());
            String rest = segType.group(2).trim();
            if (!state.text.isEmpty() || state.secondType != null) {
                state.secondType = matchedType;
                state.secondText = rest;
            } else {
                state.type = matchedType;
                state.text = rest;
            }
            return;
        }

        if (segment.startsWith("->") || segment.startsWith(">>")) {
            state.assignee = segment.substring(2).trim();
            return;
        }
        String low = segment.toLowerCase();
        if (low.startsWith("to:")) {
            state.assignee = segment.substring(3).trim();
            return;
        }
        if (low.startsWith("f-doc:")) {
            state.fileRef = segment.substring(6).trim();
            return;
        }
        if (low.startsWith("f:")) {
            String rawDate = segment.substring(2).trim();
            state.dueRaw = rawDate;
            state.due = resolveDate(rawDate);
            if (state.due == null) {
                state.warnings.add(new Warning(Warning.UNRESOLVED_DATE,
                        "Datum '" + rawDate + "' nicht sicher erkannt - bitte pruefen."));
            }
            return;
        }
        if (low.startsWith("p:")) {
            state.priority = Priority.parse(segment.substring(2).trim());
            return;
        }
        if (low.startsWith("proj:")) {
            state.project = segment.substring(5).trim();
            return;
        }
        if (low.startsWith("q:")) {
            state.source = segment.substring(2).trim();
            state.sourceForced = true;
            return;
        }
        if (low.startsWith("nx:")) {
            state.extraTexts.add("nx:" + segment.substring(3).trim());
            return;
        }
        if (segment.startsWith("@")) {
            state.assignee = state.assignee == null ? segment.substring(1).trim() : state.assignee;
            return;
        }
        if (segment.startsWith("#")) {
            for (String tag : segment.split("#")) {
                if (!tag.isBlank()) {
                    state.tags.add(tag.trim());
                }
            }
            return;
        }

        // Unbekanntes Praefix oder Freitext-Segment ohne Praefix (z.B. bei
        // "q: Quelle | Freitext", Beispiel 8): als Freitext uebernehmen.
        int colon = segment.indexOf(':');
        if (colon > 0 && colon < 10 && isLikelyUnknownPrefix(segment.substring(0, colon))) {
            state.warnings.add(new Warning(Warning.UNKNOWN_PREFIX,
                    "Unbekanntes Praefix '" + segment.substring(0, colon + 1)
                            + "' - als Freitext uebernommen."));
            state.extraTexts.add(segment);
        } else if (state.text.isEmpty()) {
            state.text = segment;
        } else {
            state.extraTexts.add(segment);
        }
    }

    private boolean isKnownSourceLabel(String label) {
        String trimmed = label.trim();
        String normalized = trimmed.toLowerCase();
        // Ein Kopf-Label ist nie eine Quelle, wenn es ein bekanntes Typ-/
        // Segment-Praefix ist (sonst wuerde "t: Text" faelschlich als Quelle
        // "t" gelesen).
        if (KNOWN_SEGMENT_PREFIXES.contains(normalized) || normalized.matches("tm|td|t|d|r|risk|blk|nx")) {
            return false;
        }
        if (knownSources != null) {
            return knownSources.contains(trimmed);
        }
        // Fallback ohne Namensliste: nur ein einzelnes Wort gilt als Quelle
        // ("Huber:"), mehrwortige Labels ("Vertrauliche Info:") sind fast
        // immer Freitext mit Doppelpunkt, kein Name.
        return !trimmed.isEmpty() && !trimmed.contains(" ");
    }

    private boolean isLikelyUnknownPrefix(String candidate) {
        String normalized = candidate.trim().toLowerCase();
        // nur als Praefix werten, wenn es wie ein Bezeichner aussieht (keine
        // Ziffern/Leerzeichen) - verhindert Fehlalarme bei Uhrzeiten o.ae.
        return normalized.matches("[a-z][a-z0-9_-]{0,15}");
    }

    private NoteType mapType(String prefix) {
        return switch (prefix) {
            case "tm" -> NoteType.TASK_ME;
            case "td" -> NoteType.TASK_DELEGATE;
            case "t" -> NoteType.TASK;
            case "d" -> NoteType.DECISION;
            case "r" -> NoteType.QUESTION;
            case "risk" -> NoteType.RISK;
            case "blk" -> NoteType.BLOCKER;
            case "nx" -> NoteType.FOLLOWUP;
            default -> NoteType.INFO;
        };
    }

    /**
     * Loest relative Datumsausdruecke auf Basis Europe/Vienna auf (Konzept
     * offene Entscheidung 22). Nur ein kleines, robustes Set - alles
     * Unbekannte bleibt unresolved (fuehrt zu einer Warnung, kein Fehler).
     */
    private String resolveDate(String raw) {
        String v = raw.trim();
        if (v.matches("\\d{4}-\\d{2}-\\d{2}")) {
            return v;
        }
        // Wochentagskuerzel und einfache Relativausdruecke werden bewusst
        // NICHT hier fest verdrahtet (haengen vom aktuellen Datum ab, das der
        // Parser als reine Funktion nicht kennen soll) - der Aufrufer
        // (NoteFileService) reicht das Referenzdatum separat durch, siehe
        // NoteValidator. Fuer die reine Grammatikpruefung gilt jedes
        // nicht-ISO-Datum als unresolved.
        return null;
    }

    /**
     * Splittet auf das gegebene Trennzeichen, respektiert aber "\|"-Escapes
     * (Konzept Kapitel 10.7) - ein escapetes Zeichen zaehlt nicht als
     * Trenner.
     */
    private List<String> splitTopLevel(String input, char separator) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (c == '\\' && i + 1 < input.length() && input.charAt(i + 1) == separator) {
                current.append(separator);
                i++;
            } else if (c == separator) {
                parts.add(current.toString().trim());
                current = new StringBuilder();
            } else {
                current.append(c);
            }
        }
        parts.add(current.toString().trim());
        return parts;
    }
}
