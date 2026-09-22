package at.anlagenbauaustria.aiapp.azureboards.tickets;

import at.anlagenbauaustria.aiapp.azureboards.model.Category;

import java.util.ArrayList;
import java.util.List;

/**
 * Welche Ticketfelder dieser Dienst bearbeiten darf.
 *
 * Bis hierher gab es genau eines: System.Description, fuer jedes Projekt und
 * jeden Work-Item-Typ. Ein zweites Feld kommt NICHT pauschal dazu - die
 * Acceptance Criteria fuehrt nur das Projekt "technical" ueberhaupt, und dort
 * nur die User Stories. In main und costs existiert das Feld in keiner einzigen
 * Datei; es dort anzubieten hiesse, einen neuen Schluessel in Dateien zu
 * schreiben, die ihn nie hatten - der feldweise 3-Wege-Merge in ai-vault
 * (merge_boards.py) saehe das als Fremdaenderung.
 *
 * Deshalb die Zuschnitt-Bedingung je Feld statt einer globalen Liste: ein Feld
 * gilt nur dort als bearbeitbar, wo es fachlich hingehoert UND wo der
 * Schluessel im Ticket bereits vorhanden ist. Die zweite Bedingung prueft
 * AzureTicketService beim Schreiben ohnehin noch einmal an den echten Daten -
 * diese Aufzaehlung sagt nur, was die Oberflaeche anbieten darf.
 *
 * Die Reihenfolge der Konstanten ist die Reihenfolge im Editor: Description
 * zuerst, Acceptance Criteria direkt darunter.
 */
public enum EditableField {

    /** Immer bearbeitbar - unabhaengig von Projekt und Work-Item-Typ. */
    DESCRIPTION("System.Description", "Description") {
        @Override
        public boolean appliesTo(Category category, String workItemType) {
            return true;
        }
    },

    /**
     * Nur User Stories in "technical".
     *
     * Gemessen am Bestand: technical fuehrt das Feld in allen 102 Tickets,
     * gefuellt ist es ausschliesslich bei den 83 User Stories (Epics und der
     * eine Task tragen es leer). main und costs kennen den Schluessel nicht.
     */
    ACCEPTANCE_CRITERIA("Microsoft.VSTS.Common.AcceptanceCriteria", "Acceptance Criteria") {
        @Override
        public boolean appliesTo(Category category, String workItemType) {
            return category == Category.TECHNICAL && USER_STORY.equalsIgnoreCase(workItemType);
        }
    };

    private static final String USER_STORY = "User Story";

    private final String jsonKey;
    private final String label;

    EditableField(String jsonKey, String label) {
        this.jsonKey = jsonKey;
        this.label = label;
    }

    /** Der Schluessel in der Ticket-Datei, z.B. "System.Description". */
    public String jsonKey() {
        return jsonKey;
    }

    /** Ueberschrift im Editor. Bewusst englisch - so heisst das Feld in Azure. */
    public String label() {
        return label;
    }

    /** Ob dieses Feld fuer Projekt und Work-Item-Typ ueberhaupt in Frage kommt. */
    public abstract boolean appliesTo(Category category, String workItemType);

    /**
     * Die Felder, die fuer dieses Ticket angeboten werden - in der
     * Reihenfolge dieser Aufzaehlung.
     *
     * present entscheidet, ob der Schluessel im Ticket vorhanden ist. Fehlt er,
     * faellt das Feld weg: AzureTicketService koennte es nicht schreiben, ohne
     * einen neuen Schluessel an unbestimmter Stelle einzusortieren, und lehnt
     * genau das ab.
     */
    public static List<EditableField> forTicket(
            Category category, String workItemType, java.util.function.Predicate<String> present) {
        List<EditableField> fields = new ArrayList<>();
        for (EditableField field : values()) {
            if (field.appliesTo(category, workItemType) && present.test(field.jsonKey)) {
                fields.add(field);
            }
        }
        return fields;
    }

    /** Wandelt den Namen aus einer Anfrage um; unbekannt = Ablehnung. */
    public static EditableField fromName(String value) {
        for (EditableField field : values()) {
            if (field.name().equals(value)) {
                return field;
            }
        }
        throw new IllegalArgumentException(
                "Unbekanntes Feld: " + value + " (erlaubt: DESCRIPTION, ACCEPTANCE_CRITERIA)");
    }
}
