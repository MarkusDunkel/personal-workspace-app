package at.anlagenbauaustria.aiapp.azureboards.model;

public record DigestApplyResult(
        boolean success,
        String comparisonPath,
        String log,
        String error
) {
    public static DigestApplyResult success(String comparisonPath, String log) {
        return new DigestApplyResult(true, comparisonPath, log, null);
    }

    public static DigestApplyResult failure(String error, String log) {
        return new DigestApplyResult(false, null, log, error);
    }
}
