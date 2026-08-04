package at.anlagenbauaustria.aiapp.notes.submit.model;

/**
 * Spiegelt eine Zeile aus review.csv (Format siehe
 * ai-vault/pipelines/pseudonymize/core/review.py). status ist bei scan
 * immer "new"; nach der Nutzerentscheidung ueberschreiben wir es mit
 * "accept" | "alias_of" | "ignore" bevor update-register aufgerufen wird.
 */
public record ReviewRow(
        String status,
        String value,
        String type,
        String suggestedPseudonym,
        String pseudonymOrAliasOf,
        String file,
        int line,
        int startChar,
        int endChar,
        String context
) {}
