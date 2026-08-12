package at.anlagenbauaustria.aiapp.pseudonymize.model;

/**
 * file/startChar/endChar spiegeln die Fundstelle aus review.csv - werden
 * nur fuer action="alias_of_position" gebraucht (positionsgenaue
 * Ersetzung, sicher bei mehrdeutigen Werten wie Vornamen), damit das
 * Frontend sie unveraendert in der SubmitDecision zurueckschicken kann.
 */
public record SubmitCandidate(
        String value,
        String type,
        String context,
        String suggestedPseudonym,
        String file,
        int startChar,
        int endChar
) {}
