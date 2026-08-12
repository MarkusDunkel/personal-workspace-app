package at.anlagenbauaustria.aiapp.azureboards.model;

public record DigestPlanResponse(
        String planToken,
        String planMarkdown,
        String log
) {}
