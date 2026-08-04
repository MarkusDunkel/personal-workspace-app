package at.anlagenbauaustria.aiapp.notes.submit.model;

import java.util.List;

public record SubmitDecisionsRequest(
        String reviewToken,
        List<SubmitDecision> decisions
) {}
