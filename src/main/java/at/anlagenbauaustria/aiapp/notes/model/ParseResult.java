package at.anlagenbauaustria.aiapp.notes.model;

import java.util.List;

/**
 * Ergebnis von NoteSyntaxParser.parse(). Bei einer leeren Zeile (nur
 * Whitespace) sind sowohl notes als auch error leer/null - die Zeile wird
 * beim Parsen ignoriert (Konzept Beispiel 20). Bei leerem Inhalt nach einem
 * Praefix ist error gesetzt (Konzept Kapitel 10.8: einziger echter Fehler).
 * Sonst enthaelt notes 1 Eintrag, oder 2 bei einer verknuepften Zweiteinheit
 * (Konzept Beispiel 19).
 */
public record ParseResult(List<Note> notes, String error) {

    public static ParseResult empty() {
        return new ParseResult(List.of(), null);
    }

    public static ParseResult error(String message) {
        return new ParseResult(List.of(), message);
    }

    public static ParseResult of(List<Note> notes) {
        return new ParseResult(notes, null);
    }

    public boolean isBlank() {
        return notes.isEmpty() && error == null;
    }

    public boolean isError() {
        return error != null;
    }
}
