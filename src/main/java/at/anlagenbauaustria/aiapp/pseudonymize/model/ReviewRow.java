package at.anlagenbauaustria.aiapp.pseudonymize.model;

/**
 * Spiegelt eine Zeile aus review.csv (Format siehe
 * ai-vault/pipelines/pseudonymize/core/review.py). status ist bei scan
 * immer "new"; nach der Nutzerentscheidung ueberschreiben wir es mit
 * "accept" | "alias_of" | "ignore" bevor update-register aufgerufen wird.
 * Generisch fuer jeden Pseudonymisierungs-Flow (notes, azureboards, ...).
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
        String context,
        // Vom Nutzer bereinigter Wert (z.B. Name ohne angehaengtes
        // NER-Rauschen). Leer = keine Korrektur, value wird unveraendert
        // uebernommen. value selbst bleibt der urspruenglich erkannte
        // String und dient weiterhin als stabiler Schluessel.
        String resolvedValue
) {}
