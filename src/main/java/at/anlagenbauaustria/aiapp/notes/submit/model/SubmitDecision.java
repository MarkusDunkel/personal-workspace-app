package at.anlagenbauaustria.aiapp.notes.submit.model;

/**
 * Eine Nutzerentscheidung fuer einen Kandidaten aus dem Review-Dialog.
 * action ist "accept" | "alias_of" | "ignore"; aliasTarget ist nur bei
 * "alias_of" gesetzt (Pseudonym oder canonical_value der Zielperson).
 */
public record SubmitDecision(
        String value,
        String type,
        String action,
        String aliasTarget
) {}
