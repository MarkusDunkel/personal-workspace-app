package at.anlagenbauaustria.aiapp.azureboards.tickets;

import java.util.regex.Pattern;

/**
 * In welchem Format eine Ticket-Beschreibung vorliegt.
 *
 * Azure fuehrt pro Feld EINEN Dialekt, und der Wechsel geht nur ueber einen
 * einmaligen manuellen Klick "Convert to Markdown" im Browser - per REST ist
 * er nicht ausloesbar (siehe ai-vault/DESCRIPTION-FORMAT.md). Die Pipeline
 * schreibt den Rohwert deshalb unveraendert durch: "Write whatever dialect the
 * field is already in ... neither format 'wins'".
 *
 * Diese Erkennung LIEST nur. Sie entscheidet, welcher Editor angeboten wird,
 * und niemals, wie gespeichert wird - umgeschrieben wird ein Wert nie.
 *
 * Gemessen am Bestand (445 Tickets): 194 HTML, 179 PLAIN, 46 MARKDOWN,
 * 6 MIXED, 20 EMPTY.
 */
public enum DescriptionDialect {

    /** Kein Inhalt - eine neue Beschreibung darf frei in Markdown entstehen. */
    EMPTY,
    /** Weder HTML-Tags noch Markdown-Konstrukte: schlichter Text. */
    PLAIN,
    /** Markdown (Ueberschriften, Listen, Pipe-Tabellen, Fettschrift). */
    MARKDOWN,
    /** Azure-HTML (div/p/li/span/b, oft mit style- und href-Attributen). */
    HTML,
    /** Beides zugleich - der heikelste Fall, nur im Quelltext bearbeitbar. */
    MIXED;

    /**
     * Block- und Inline-Tags, wie sie Azure selbst schreibt. Bewusst eine feste
     * Liste und kein generisches "&lt;irgendwas&gt;": in Markdown-Texten stehen
     * Vergleiche wie "a &lt; b" oder Platzhalter in spitzen Klammern, die kein
     * HTML sind.
     *
     * Zwei Tags stehen ABSICHTLICH nicht in dieser Liste, weil sie in diesem
     * Bestand auch in reinem Markdown vorkommen und es dort nicht zu HTML
     * machen:
     *
     * &lt;br&gt; ist kein Formatierungs-, sondern ein Zeilentrennzeichen: 205
     * Tickets kodieren damit ihre Umbrueche, auch rein markdownsprachige.
     * Behandelt wird es wie ein "\n" - siehe of().
     *
     * &lt;mark&gt; ist die uebliche Schreibweise fuer eine Hervorhebung, fuer
     * die Markdown selbst keine Syntax hat ("&lt;mark&gt;noch offen&lt;/mark&gt;"
     * mitten in einem Fliesstext). Es tritt im Bestand ausschliesslich in sonst
     * reinen Markdown-Dokumenten auf (Tickets 564 und 569, dort als EINZIGER
     * Tag ueberhaupt) und ueberlebt den Markdown-Roundtrip vollstaendig -
     * nachgemessen: alle 21 bzw. 4 Vorkommen bleiben erhalten. Waere es hier
     * aufgefuehrt, landeten genau die beiden groessten, am staerksten
     * strukturierten Fachdokumente im Quelltext-Editor.
     */
    private static final Pattern HTML_TAG = Pattern.compile(
            "<(?:/?)(?:div|p|b|i|u|ul|ol|li|span|a|table|thead|tbody|tr|td|th"
                    + "|h[1-6]|strong|em|img|pre|blockquote)\\b[^>]*>",
            Pattern.CASE_INSENSITIVE);

    /** Zeilentrenner in Azure-Texten, in beiden Dialekten moeglich. */
    private static final Pattern LINE_BREAK_TAG = Pattern.compile("(?i)<br\\s*/?>");

    /**
     * Markdown-Konstrukte am Zeilenanfang plus Fettschrift. MULTILINE, weil die
     * Marker je Zeile gelten; zusaetzlich wird "&lt;br&gt;" als Zeilentrenner
     * behandelt - 205 Tickets kodieren ihre Umbrueche so, und eine
     * Markdown-Tabelle hinter einem &lt;br&gt; bliebe sonst unerkannt.
     */
    private static final Pattern MARKDOWN_MARKER = Pattern.compile(
            "(?m)^\\s*(?:#{1,6}\\s|[*-]\\s|\\d+\\.\\s|\\|)|\\*\\*\\S");

    /** Erkennt den Dialekt eines Rohwerts. Veraendert nichts. */
    public static DescriptionDialect of(String rawDescription) {
        if (rawDescription == null || rawDescription.isBlank()) {
            return EMPTY;
        }
        // <br> zuerst zu "\n" machen - fuer BEIDE Suchen. Nur so faellt
        // "## Roadmap-Historie<br>| Version |" als reines Markdown durch und
        // nicht als Mischform (das betrifft 205 Tickets).
        String normalized = LINE_BREAK_TAG.matcher(rawDescription).replaceAll("\n");
        boolean html = HTML_TAG.matcher(normalized).find();
        boolean markdown = MARKDOWN_MARKER.matcher(normalized).find();

        if (html && markdown) {
            return MIXED;
        }
        if (html) {
            return HTML;
        }
        if (markdown) {
            return MARKDOWN;
        }
        // Schmuckloser Text, der seine Umbrueche aber als <br> traegt (13
        // Tickets): als HTML fuehren. Im Markdown-Editor gingen genau diese
        // Umbrueche verloren - das Feld enthaelt kein einziges
        // Markdown-Konstrukt, an dem sich ein Serializer orientieren koennte.
        return LINE_BREAK_TAG.matcher(rawDescription).find() ? HTML : PLAIN;
    }

    /**
     * Ob ein visueller Markdown-Editor fuer diesen Dialekt zulaessig ist.
     *
     * HTML und MIXED bleiben aussen vor: Milkdown haelt rohes HTML zwar als
     * Knoten, gibt dessen Inhalt aber als reinen TEXT aus, und einen
     * HTML-Serializer gibt es nicht. Ein solches Ticket durch den
     * Markdown-Editor zu schicken wuerde style-Attribute, &amp;nbsp; und
     * &lt;mark&gt; verlieren - also genau die Formatierung, die
     * DESCRIPTION-FORMAT.md byte-genau erhalten wissen will.
     */
    public boolean allowsVisualEditor() {
        return this == MARKDOWN || this == PLAIN || this == EMPTY;
    }
}
