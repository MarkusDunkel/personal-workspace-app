package at.anlagenbauaustria.aiapp.views;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.pipeline.AivaultEnv;
import at.anlagenbauaustria.aiapp.pipeline.PipelineRunner;
import at.anlagenbauaustria.aiapp.views.model.ViewInfo;
import at.anlagenbauaustria.aiapp.views.model.ViewKind;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Deckt den Lesepfad ab (Auflisten, Aufloesen). refresh() bleibt bewusst
 * ungetestet: es braucht eine echte Bash und ein echtes ai-vault mit
 * Personenregister - genauso wie es fuer AzureBoardsService keinen Test gibt.
 * Die Skripte selbst sind in ai-vault per E2E-Test abgedeckt.
 */
class ViewsServiceTest {

    @TempDir
    Path aivaultRoot;

    private ViewsService service;

    @BeforeEach
    void setUp() {
        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        FsGuard fsGuard = new FsGuard(properties);
        service = new ViewsService(new PipelineRunner(properties), fsGuard, new AivaultEnv(properties));
    }

    private void writeOutput(ViewKind kind) throws IOException {
        Path file = aivaultRoot.resolve(kind.outputPath());
        Files.createDirectories(file.getParent());
        Files.writeString(file, "<!doctype html><title>x</title>", StandardCharsets.UTF_8);
    }

    @Test
    void listsEveryViewAndMarksMissingOutputsUnavailable() throws IOException {
        writeOutput(ViewKind.STAKEHOLDER);

        List<ViewInfo> infos = service.list();

        assertThat(infos).extracting(ViewInfo::id)
                .containsExactly("cockpit", "stakeholder", "costs");
        ViewInfo stakeholder = infos.stream()
                .filter(i -> i.id().equals("stakeholder")).findFirst().orElseThrow();
        assertThat(stakeholder.available()).isTrue();
        assertThat(stakeholder.generatedAt()).isNotNull();

        assertThat(infos).filteredOn(i -> !i.id().equals("stakeholder"))
                .allSatisfy(info -> {
                    assertThat(info.available()).isFalse();
                    assertThat(info.generatedAt()).isNull();
                });
    }

    @Test
    void resolveHtmlReturnsTheGeneratedFile() throws IOException {
        writeOutput(ViewKind.COCKPIT);

        assertThat(service.resolveHtml(ViewKind.COCKPIT))
                .isEqualTo(aivaultRoot.resolve(ViewKind.COCKPIT.outputPath()));
    }

    @Test
    void resolveHtmlRejectsAViewThatWasNeverGenerated() {
        assertThatThrownBy(() -> service.resolveHtml(ViewKind.COSTS))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("noch nicht erzeugt");
    }

    @Test
    void unknownIdIsRejected() {
        assertThatThrownBy(() -> ViewKind.fromId("bogus"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cockpit");
    }

    /**
     * Haelt die Schreib-/Lesezone fest: waechst der Enum spaeter um eine
     * Ansicht, darf sie nicht versehentlich aus einer anderen Stufe lesen.
     */
    @Test
    void everyViewReadsFromTheOutputStage() {
        assertThat(ViewKind.values())
                .allSatisfy(kind -> assertThat(kind.outputPath()).startsWith("5_output/"));
    }

    /** Alle Ansichten laufen ueber den JSON-Pfad - der CSV-Pfad ist abgeloest. */
    @Test
    void everyViewUsesTheJsonPipeline() {
        assertThat(ViewKind.values()).allSatisfy(kind -> {
            assertThat(kind.publishScript()).contains("/json/");
            assertThat(kind.outputPath()).contains("/json/");
        });
    }
}
