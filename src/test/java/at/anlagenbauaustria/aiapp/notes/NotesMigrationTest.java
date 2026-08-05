package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class NotesMigrationTest {

    @TempDir
    Path aivaultRoot;

    private FsGuard fsGuard;
    private NoteDataService dataService;
    private NotesMigration migration;
    private Path notesDir;

    @BeforeEach
    void setUp() {
        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        fsGuard = new FsGuard(properties);
        ObjectMapper objectMapper = new ObjectMapper();
        dataService = new NoteDataService(fsGuard, new AtomicFileWriter(), objectMapper);
        migration = new NotesMigration(fsGuard, dataService, objectMapper);
        notesDir = aivaultRoot.resolve("0_sources/notes");
    }

    private void writeLegacyFile(String name, String json) throws IOException {
        Files.createDirectories(notesDir);
        Files.writeString(notesDir.resolve(name), json, StandardCharsets.UTF_8);
    }

    private String readNotesJson() throws IOException {
        return Files.readString(notesDir.resolve("notes.json"), StandardCharsets.UTF_8);
    }

    @Test
    void mergesAufgabeAndInfoRowsTaggedWithTyp() throws IOException {
        writeLegacyFile("aufgabe.json", """
                {
                  "tableId": "aufgabe",
                  "rows": [
                    {"id": "a1", "cells": {"von": "Alice", "inhalt": "Task 1"}, "order": 0},
                    {"id": "a2", "cells": {"von": "Bob", "inhalt": "Task 2"}, "order": 1}
                  ]
                }
                """);
        writeLegacyFile("info.json", """
                {
                  "tableId": "info",
                  "rows": [
                    {"id": "i1", "cells": {}, "order": 0}
                  ]
                }
                """);

        migration.run(null);

        NoteTableData merged = dataService.read("notes");
        assertThat(merged.rows()).hasSize(3);
        assertThat(merged.rows().get(0).id()).isEqualTo("a1");
        assertThat(merged.rows().get(0).cells()).containsEntry("typ", "Aufgabe");
        assertThat(merged.rows().get(0).order()).isEqualTo(0);
        assertThat(merged.rows().get(1).id()).isEqualTo("a2");
        assertThat(merged.rows().get(1).cells()).containsEntry("typ", "Aufgabe");
        assertThat(merged.rows().get(1).order()).isEqualTo(1);
        assertThat(merged.rows().get(2).id()).isEqualTo("i1");
        assertThat(merged.rows().get(2).cells()).containsEntry("typ", "Info");
        assertThat(merged.rows().get(2).order()).isEqualTo(2);
    }

    @Test
    void isIdempotentOnSecondRun() throws IOException {
        writeLegacyFile("aufgabe.json", """
                {"tableId": "aufgabe", "rows": [{"id": "a1", "cells": {"von": "Alice"}, "order": 0}]}
                """);

        migration.run(null);
        String firstRun = readNotesJson();

        migration.run(null);
        String secondRun = readNotesJson();

        assertThat(secondRun).isEqualTo(firstRun);
        assertThat(dataService.read("notes").rows()).hasSize(1);
    }

    @Test
    void noLegacyFilesProducesEmptyNotes() {
        migration.run(null);

        NoteTableData result = dataService.read("notes");
        assertThat(result.rows()).isEmpty();
    }

    @Test
    void onlyOneLegacyFilePresentMigratesOnlyThat() throws IOException {
        writeLegacyFile("info.json", """
                {"tableId": "info", "rows": [{"id": "i1", "cells": {"quelle": "X"}, "order": 0}]}
                """);

        migration.run(null);

        NoteTableData result = dataService.read("notes");
        assertThat(result.rows()).hasSize(1);
        assertThat(result.rows().get(0).cells()).containsEntry("typ", "Info");
    }
}
