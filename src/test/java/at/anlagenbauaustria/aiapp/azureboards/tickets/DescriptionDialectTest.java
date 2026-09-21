package at.anlagenbauaustria.aiapp.azureboards.tickets;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Die Beispiele sind echte Auszuege aus 2_ai-ready - die Erkennung muss an den
 * tatsaechlichen Daten stimmen, nicht an konstruierten.
 */
class DescriptionDialectTest {

    @Test
    void emptyAndBlankAreEmpty() {
        assertThat(DescriptionDialect.of(null)).isEqualTo(DescriptionDialect.EMPTY);
        assertThat(DescriptionDialect.of("")).isEqualTo(DescriptionDialect.EMPTY);
        assertThat(DescriptionDialect.of("   \n ")).isEqualTo(DescriptionDialect.EMPTY);
    }

    @Test
    void azureHtmlIsDetected() {
        assertThat(DescriptionDialect.of(
                "<div>Abstimmung mit Person_075. Termin: 17.07.<br> </div>"))
                .isEqualTo(DescriptionDialect.HTML);
        assertThat(DescriptionDialect.of("<p>Sammel-Epic</p><p><b>Hintergrund</b></p>"))
                .isEqualTo(DescriptionDialect.HTML);
    }

    @Test
    void plainTextIsPlain() {
        assertThat(DescriptionDialect.of("Kurze Notiz ohne jede Auszeichnung."))
                .isEqualTo(DescriptionDialect.PLAIN);
    }

    @Test
    void markdownHeadingsListsAndTablesAreMarkdown() {
        assertThat(DescriptionDialect.of("## Ziel\n\nAls Mitarbeiter moechte ich..."))
                .isEqualTo(DescriptionDialect.MARKDOWN);
        assertThat(DescriptionDialect.of("Punkte:\n\n* Erster\n* Zweiter"))
                .isEqualTo(DescriptionDialect.MARKDOWN);
        assertThat(DescriptionDialect.of("| Version | Gueltig ab |\n|---|---|\n| V1 | 01.01.2026 |"))
                .isEqualTo(DescriptionDialect.MARKDOWN);
    }

    /**
     * Der haeufigste reale Markdown-Fall: 205 Tickets kodieren ihre
     * Zeilenumbrueche als &lt;br&gt;. Ohne die Normalisierung in of() waere
     * das faelschlich HTML - und die Roadmap-Tabellen landeten im
     * Quelltext-Editor statt im visuellen.
     */
    @Test
    void markdownWithBrLineBreaksIsMarkdownNotHtml() {
        String real = "## Roadmap-Historie<br>Hinweis: Die aktuelle Version ist abgelegt."
                + "<br>| Version | Gueltig ab |<br>|---|---|<br>| V1 | 01.01.2026 |";
        assertThat(DescriptionDialect.of(real)).isEqualTo(DescriptionDialect.MARKDOWN);
    }

    /**
     * &lt;mark&gt; ist die uebliche Schreibweise fuer eine Hervorhebung, fuer die
     * Markdown keine eigene Syntax hat - es macht ein Dokument NICHT zu HTML.
     * Genau daran scheiterten sonst die Tickets 564 und 569 (technical): grosse,
     * reine Markdown-Fachdokumente mit 261 echten Zeilenumbruechen, in denen
     * &lt;mark&gt; der einzige Tag ist. Sie landeten faelschlich im
     * Quelltext-Editor.
     */
    @Test
    void markHighlightAloneDoesNotMakeItHtml() {
        String real = "## Ziel\n\nAls Mitarbeiter moechte ich...\n\n"
                + "<mark>Diese Entscheidung ist noch offen.</mark>\n\n"
                + "| Spalte | Wert |\n|---|---|\n| a | b |";
        assertThat(DescriptionDialect.of(real)).isEqualTo(DescriptionDialect.MARKDOWN);
        assertThat(DescriptionDialect.of(real).allowsVisualEditor()).isTrue();
    }

    /** Echter Mischfall: HTML-Kopf, danach eine Markdown-Tabelle. */
    @Test
    void htmlHeaderFollowedByMarkdownTableIsMixed() {
        String real = "<div>Link zum Lastenheft: <a href=\"http://x\">Doc</a></div>"
                + "<br>## Roadmap-Historie<br>| Version |<br>|---|";
        assertThat(DescriptionDialect.of(real)).isEqualTo(DescriptionDialect.MIXED);
    }

    @Test
    void onlyMarkdownLikeDialectsAllowTheVisualEditor() {
        assertThat(DescriptionDialect.MARKDOWN.allowsVisualEditor()).isTrue();
        assertThat(DescriptionDialect.PLAIN.allowsVisualEditor()).isTrue();
        assertThat(DescriptionDialect.EMPTY.allowsVisualEditor()).isTrue();
        // Beide wuerden durch einen Markdown-Serializer ihre Formatierung
        // verlieren - siehe Javadoc.
        assertThat(DescriptionDialect.HTML.allowsVisualEditor()).isFalse();
        assertThat(DescriptionDialect.MIXED.allowsVisualEditor()).isFalse();
    }

    /**
     * Schmuckloser Text, dessen Umbrueche aber als &lt;br&gt; kodiert sind (13
     * Tickets): gehoert in den Quelltext-Editor, weil ein Markdown-Serializer
     * die Umbrueche schlucken wuerde - es gibt kein Markdown-Konstrukt, an dem
     * er sich orientieren koennte.
     */
    @Test
    void plainTextWithBrBreaksStaysInTheSourceEditor() {
        assertThat(DescriptionDialect.of("Erste Zeile<br>Zweite Zeile"))
                .isEqualTo(DescriptionDialect.HTML);
    }
}
