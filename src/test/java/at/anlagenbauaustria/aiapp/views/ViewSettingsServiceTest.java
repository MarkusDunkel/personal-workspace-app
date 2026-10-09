package at.anlagenbauaustria.aiapp.views;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.views.model.StakeholderOrderEntry;
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

class ViewSettingsServiceTest {

    @TempDir
    Path aivaultRoot;

    private ViewSettingsService service;

    @BeforeEach
    void setUp() {
        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        service = new ViewSettingsService(new FsGuard(properties));
    }

    private Path orderFile() {
        return aivaultRoot.resolve(ViewSettingsService.ORDER_FILE);
    }

    @Test
    void missingFileReadsAsEmptyOrder() {
        assertThat(service.readOrder()).isEmpty();
    }

    @Test
    void writeThenReadKeepsOrderAndDropsDuplicates() throws IOException {
        List<String> saved = service.writeOrder(List.of(
                new StakeholderOrderEntry("556", "Zeiterfassung"),
                new StakeholderOrderEntry("12", "Gerätemanagement"),
                new StakeholderOrderEntry("556", "doppelt")));

        assertThat(saved).containsExactly("556", "12");
        assertThat(service.readOrder()).containsExactly("556", "12");

        String content = Files.readString(orderFile(), StandardCharsets.UTF_8);
        assertThat(content).startsWith(ViewSettingsService.HEADER);
        assertThat(content).contains("556  # Zeiterfassung\n", "12  # Gerätemanagement\n");
    }

    @Test
    void titlesStayOnOneLine() throws IOException {
        service.writeOrder(List.of(new StakeholderOrderEntry("7", "Zeile1\n999\r\nZeile2")));

        // Ein Zeilenumbruch im Titel darf keine zusaetzliche ID "999" erzeugen.
        assertThat(service.readOrder()).containsExactly("7");
    }

    @Test
    void readIgnoresCommentsAndInvalidLines() throws IOException {
        Files.createDirectories(orderFile().getParent());
        Files.writeString(orderFile(), """
                # Kommentar
                42   # Titel

                abc
                43
                42
                """, StandardCharsets.UTF_8);

        assertThat(service.readOrder()).containsExactly("42", "43");
    }

    @Test
    void rejectsInvalidIdsAndEmptyOrder() {
        assertThatThrownBy(() -> service.writeOrder(List.of(new StakeholderOrderEntry("../x", "t"))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.writeOrder(List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(Files.exists(orderFile())).isFalse();
    }
}
