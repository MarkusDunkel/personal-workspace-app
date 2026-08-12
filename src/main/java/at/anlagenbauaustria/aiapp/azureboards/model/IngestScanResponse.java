package at.anlagenbauaustria.aiapp.azureboards.model;

import at.anlagenbauaustria.aiapp.pseudonymize.model.KnownPerson;
import at.anlagenbauaustria.aiapp.pseudonymize.model.SubmitCandidate;

import java.util.List;

public record IngestScanResponse(
        String reviewToken,
        List<SubmitCandidate> candidates,
        List<KnownPerson> knownPersons,
        String log
) {}
