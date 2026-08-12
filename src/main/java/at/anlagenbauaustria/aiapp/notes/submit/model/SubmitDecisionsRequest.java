package at.anlagenbauaustria.aiapp.notes.submit.model;

import at.anlagenbauaustria.aiapp.pseudonymize.model.SubmitDecision;

import java.util.List;

public record SubmitDecisionsRequest(
        String reviewToken,
        List<SubmitDecision> decisions
) {}
