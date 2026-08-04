package at.anlagenbauaustria.aiapp.notes.submit.model;

/**
 * Read-only Sicht auf eine Zeile aus person_register.csv (Format siehe
 * ai-vault/pipelines/pseudonymize/core/registry.py). Wird nur gelesen, um
 * dem Nutzer bekannte Personen fuers "Alias von"-Dropdown anzuzeigen -
 * ai-app schreibt niemals selbst in diese Datei.
 */
public record RegistryEntry(
        String canonicalValue,
        String pseudonym,
        String type
) {}
