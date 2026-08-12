package at.anlagenbauaustria.aiapp.azureboards.model;

public record IngestResult(
        boolean success,
        String log,
        String error
) {
    public static IngestResult success(String log) {
        return new IngestResult(true, log, null);
    }

    public static IngestResult failure(String error, String log) {
        return new IngestResult(false, log, error);
    }
}
