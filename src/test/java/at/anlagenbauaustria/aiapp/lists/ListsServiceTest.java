package at.anlagenbauaustria.aiapp.lists;

import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class ListsServiceTest {

    @TempDir
    Path dataDir;

    private ListsService listsService;

    @BeforeEach
    void setUp() {
        listsService = new ListsService(new LocalDataDir(dataDir), new AtomicFileWriter());
    }

    @Test
    void addProvisionalAddsNewValueOnce() {
        listsService.addProvisional("projekte.yml", "Alpha");
        listsService.addProvisional("projekte.yml", "Alpha");

        NamedValueList data = listsService.read("projekte.yml");
        assertThat(data.confirmed()).isEmpty();
        assertThat(data.provisional()).containsExactly("Alpha");
    }

    @Test
    void addProvisionalIsCaseInsensitiveAgainstExisting() {
        listsService.addProvisional("projekte.yml", "Alpha");
        listsService.addProvisional("projekte.yml", "alpha");

        assertThat(listsService.read("projekte.yml").provisional()).containsExactly("Alpha");
    }

    @Test
    void reconcileConfirmsUsedProvisionalValues() {
        listsService.addProvisional("projekte.yml", "Alpha");

        listsService.reconcile("projekte.yml", Set.of("Alpha"));

        NamedValueList data = listsService.read("projekte.yml");
        assertThat(data.confirmed()).containsExactly("Alpha");
        assertThat(data.provisional()).isEmpty();
    }

    @Test
    void reconcileRemovesUnusedProvisionalValues() {
        listsService.addProvisional("projekte.yml", "NieVerwendet");

        listsService.reconcile("projekte.yml", Set.of());

        NamedValueList data = listsService.read("projekte.yml");
        assertThat(data.confirmed()).isEmpty();
        assertThat(data.provisional()).isEmpty();
    }

    @Test
    void reconcileNeverRemovesConfirmedValues() {
        listsService.addProvisional("projekte.yml", "Alpha");
        listsService.reconcile("projekte.yml", Set.of("Alpha"));

        // Zweiter Absenden-Vorgang, "Alpha" wird diesmal nicht verwendet.
        listsService.reconcile("projekte.yml", Set.of());

        assertThat(listsService.read("projekte.yml").confirmed()).containsExactly("Alpha");
    }

    @Test
    void readMergedDeduplicatesConfirmedAndProvisional() {
        listsService.addProvisional("projekte.yml", "Alpha");
        listsService.reconcile("projekte.yml", Set.of("Alpha"));
        listsService.addProvisional("projekte.yml", "Beta");

        assertThat(listsService.readMerged("projekte.yml")).containsExactly("Alpha", "Beta");
    }

    @Test
    void readOfMissingFileReturnsEmptyLists() {
        NamedValueList data = listsService.read("does-not-exist.yml");
        assertThat(data.confirmed()).isEmpty();
        assertThat(data.provisional()).isEmpty();
    }
}
