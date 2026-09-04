package at.anlagenbauaustria.aiapp.pseudonymize.model;

import java.util.List;

/**
 * Read-only Sicht auf eine Zeile aus person_register.csv (Format siehe
 * ai-vault/pipelines/pseudonymize/core/registry.py). Wird nur gelesen, um
 * dem Nutzer bekannte Personen fuers "Alias von"-Dropdown anzuzeigen und um
 * abgelegte Notizen mit Klarnamen darzustellen (siehe PseudonymMapper) -
 * ai-app schreibt niemals selbst in diese Datei.
 */
public record RegistryEntry(
        String canonicalValue,
        String pseudonym,
        String type,
        List<String> aliases
) {
    /**
     * Fuer Aufrufer, die nur die Zuordnung Klarname/Pseudonym brauchen und
     * die Aliase gar nicht auswerten (siehe NoteSubmitService,
     * AzureBoardsService).
     */
    public RegistryEntry(String canonicalValue, String pseudonym, String type) {
        this(canonicalValue, pseudonym, type, List.of());
    }
}
