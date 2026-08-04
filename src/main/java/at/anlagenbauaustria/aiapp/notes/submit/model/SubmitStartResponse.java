package at.anlagenbauaustria.aiapp.notes.submit.model;

import java.util.List;

public record SubmitStartResponse(
        String reviewToken,
        List<SubmitCandidate> candidates,
        List<KnownPerson> knownPersons
) {}
