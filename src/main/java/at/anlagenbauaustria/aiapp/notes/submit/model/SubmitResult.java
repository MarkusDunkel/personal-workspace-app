package at.anlagenbauaustria.aiapp.notes.submit.model;

public record SubmitResult(
        boolean success,
        String targetPath,
        String log,
        String error
) {
    public static SubmitResult success(String targetPath, String log) {
        return new SubmitResult(true, targetPath, log, null);
    }

    public static SubmitResult failure(String error) {
        return new SubmitResult(false, null, null, error);
    }
}
