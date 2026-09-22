package at.anlagenbauaustria.aiapp.azureboards.tickets;

/**
 * Womit der aktuelle Stand eines Ticketfeldes verglichen wird.
 *
 * HEAD beantwortet "was ist seit dem letzten Commit passiert?" und ist die
 * Vorgabe. INDEX beantwortet "was ist noch nicht vorgemerkt?" - beides sind
 * verschiedene Fragen, sobald eine Datei teils vorgemerkt und teils weiter
 * bearbeitet wurde (git-Status "MM"), was im Vault-Repo vorkommt.
 *
 * INDEX ist vorbereitet, wird von der Oberflaeche aber noch nicht angeboten:
 * ein Umschalter dafuer ist reine Oberflaechenarbeit und braucht hier nichts
 * mehr.
 */
public enum BaselineRef {

    /** Der letzte Commit. */
    HEAD("HEAD"),

    /**
     * Der Vormerkbereich (staging area).
     *
     * In der git-Syntax "&lt;ref&gt;:&lt;pfad&gt;" ist der leere Ref genau das -
     * ":datei" liest aus dem Index. Deshalb hier bewusst ein leerer String
     * und nicht etwa "INDEX", das git nicht kennt.
     */
    INDEX("");

    private final String gitRef;

    BaselineRef(String gitRef) {
        this.gitRef = gitRef;
    }

    /** Der Ref-Teil fuer "git show &lt;ref&gt;:&lt;pfad&gt;". */
    public String gitRef() {
        return gitRef;
    }
}
