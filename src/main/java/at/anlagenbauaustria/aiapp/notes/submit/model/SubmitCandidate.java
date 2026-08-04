package at.anlagenbauaustria.aiapp.notes.submit.model;

public record SubmitCandidate(
        String value,
        String type,
        String context,
        String suggestedPseudonym
) {}
