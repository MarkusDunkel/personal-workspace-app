package at.anlagenbauaustria.aiapp.pseudonymize.model;

/**
 * Eine Nutzerentscheidung fuer einen Kandidaten aus dem Review-Dialog.
 * action ist "accept" | "alias_of" | "alias_of_once" | "alias_of_position" |
 * "ignore". aliasTarget ist bei allen drei Alias-Varianten gesetzt
 * (Pseudonym oder canonical_value der Zielperson):
 *   - "alias_of": dauerhaft im Register gespeichert (jedes Vorkommen des
 *     Werts wird kuenftig ersetzt).
 *   - "alias_of_once": wie alias_of, aber nur fuer den aktuellen Lauf
 *     wirksam, nicht dauerhaft gespeichert.
 *   - "alias_of_position": ersetzt NUR die konkrete Fundstelle dieses
 *     Kandidaten, nicht jedes Vorkommen des Werts - sicher bei mehrdeutigen
 *     Werten (z.B. Vornamen wie "Thomas", wenn mehrere Personen so heissen).
 *     Ebenfalls nicht dauerhaft gespeichert.
 * resolvedValue ist die vom Nutzer bereinigte Fassung von value (z.B. Name
 * ohne angehaengtes NER-Rauschen wie "Arne Nowak:\nWir" -> "Arne Nowak"),
 * leer wenn keine Korrektur noetig war. Nur bei action="accept" relevant.
 */
public record SubmitDecision(
        String value,
        String type,
        String action,
        String aliasTarget,
        String resolvedValue
) {}
