package at.anlagenbauaustria.aiapp.notes.archive;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.fs.AtomicFileWriter;
import at.anlagenbauaustria.aiapp.fs.FsGuard;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableData;
import at.anlagenbauaustria.aiapp.notes.model.NoteTableRow;
import at.anlagenbauaustria.aiapp.pipeline.AivaultEnv;
import at.anlagenbauaustria.aiapp.pseudonymize.PseudonymMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ArchiveNotesMigrationTest {

    @TempDir
    Path aivaultRoot;

    private NoteArchiveService service;
    private ArchiveNotesMigration migration;
    private Path archiveDir;

    @BeforeEach
    void setUp() throws IOException {
        archiveDir = aivaultRoot.resolve("2_ai-ready").resolve("notes");
        Files.createDirectories(archiveDir);

        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        ObjectMapper objectMapper = new ObjectMapper();
        // Bewusst OHNE person_register.csv und ohne .env: die Migration darf
        // nicht vom Register abhaengen (sie beruehrt keine Personenzelle).
        // Laeuft dieser Test gruen, ist bewiesen, dass ein fehlendes Register
        // den Start nicht blockiert - genau der Grund fuer den Rohzugriff
        // ueber readRaw/writeRaw statt read/write.
        service = new NoteArchiveService(
                new FsGuard(properties),
                new AtomicFileWriter(),
                objectMapper,
                new PseudonymMapper(new AivaultEnv(properties)));
        migration = new ArchiveNotesMigration(service, new AtomicFileWriter(), objectMapper);
    }

    private void writeArchiveFile(String fileName, String json) throws IOException {
        Files.writeString(archiveDir.resolve(fileName), json, StandardCharsets.UTF_8);
    }

    private String readArchiveFile(String fileName) throws IOException {
        return Files.readString(archiveDir.resolve(fileName), StandardCharsets.UTF_8);
    }

    @Test
    void backfillsCreatedFromFileTimestamp() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", """
                {
                  "tableId": "notes",
                  "rows": [
                    {"id": "r1", "cells": {"typ": "Aufgabe", "von": "Person_007"}, "order": 0}
                  ]
                }
                """);

        migration.run(null);

        NoteTableData migrated = service.readRaw("notes-2026-08-05T12-20-07Z.json");
        assertThat(migrated.rows().get(0).cells())
                .containsEntry("created", "2026-08-05T12:20:07Z");
        // Die Personenzelle bleibt pseudonymisiert - der Rohzugriff darf
        // nichts uebersetzen.
        assertThat(migrated.rows().get(0).cells()).containsEntry("von", "Person_007");
    }

    @Test
    void leavesExistingCreatedUntouched() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", """
                {
                  "tableId": "notes",
                  "rows": [
                    {"id": "r1", "cells": {"created": "2026-07-01T08:00:00.123Z"}, "order": 0},
                    {"id": "r2", "cells": {"typ": "Info"}, "order": 1}
                  ]
                }
                """);

        migration.run(null);

        List<NoteTableRow> rows = service.readRaw("notes-2026-08-05T12-20-07Z.json").rows();
        assertThat(rows.get(0).cells()).containsEntry("created", "2026-07-01T08:00:00.123Z");
        assertThat(rows.get(1).cells()).containsEntry("created", "2026-08-05T12:20:07Z");
    }

    @Test
    void fixesCorruptedTableId() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-23-08Z.json", """
                {
                  "tableId": "notes-2026-08-05T12-23-08Z.json",
                  "rows": [
                    {"id": "r1", "cells": {"created": "2026-07-01T08:00:00.000Z"}, "order": 0}
                  ]
                }
                """);

        migration.run(null);

        assertThat(service.readRaw("notes-2026-08-05T12-23-08Z.json").tableId()).isEqualTo("notes");
    }

    @Test
    void doesNotRewriteFileWithoutDefects() throws IOException {
        String original = """
                {"tableId":"notes","rows":[{"id":"r1","cells":{"created":"2026-07-01T08:00:00.000Z"},"order":0}]}""";
        writeArchiveFile("notes-2026-08-21T06-57-51Z.json", original);

        migration.run(null);

        // Byte-identisch, insbesondere ohne Pretty-Printing: eine fehlerfreie
        // Datei darf der Nutzer offen haben, ohne dass sie umgeschrieben wird.
        assertThat(readArchiveFile("notes-2026-08-21T06-57-51Z.json")).isEqualTo(original);
    }

    @Test
    void isIdempotentOnSecondRun() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", """
                {
                  "tableId": "notes-2026-08-05T12-20-07Z.json",
                  "rows": [
                    {"id": "r1", "cells": {"typ": "Aufgabe"}, "order": 0}
                  ]
                }
                """);

        migration.run(null);
        String firstRun = readArchiveFile("notes-2026-08-05T12-20-07Z.json");

        migration.run(null);

        assertThat(readArchiveFile("notes-2026-08-05T12-20-07Z.json")).isEqualTo(firstRun);
    }

    @Test
    void preservesCellInsertionOrder() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", """
                {
                  "tableId": "notes",
                  "rows": [
                    {"id": "r1", "cells": {"typ": "Aufgabe", "von": "Person_007", "inhalt": "X", "bis": "2026-08-07"}, "order": 0}
                  ]
                }
                """);

        migration.run(null);

        // created haengt HINTEN an, die bestehenden Zellen behalten ihre
        // Reihenfolge - sonst produziert die Migration ein Scheindiff ueber
        // die ganze Datei.
        assertThat(service.readRaw("notes-2026-08-05T12-20-07Z.json").rows().get(0).cells().keySet())
                .containsExactly("typ", "von", "inhalt", "bis", "created");
    }

    @Test
    void migratesEveryFileInTheZone() throws IOException {
        writeArchiveFile("notes-2026-08-05T12-20-07Z.json", """
                {"tableId": "notes", "rows": [{"id": "a", "cells": {}, "order": 0}]}
                """);
        writeArchiveFile("notes-2026-08-08T12-16-40Z.json", """
                {"tableId": "notes", "rows": [{"id": "b", "cells": {}, "order": 0}]}
                """);

        migration.run(null);

        assertThat(service.readRaw("notes-2026-08-05T12-20-07Z.json").rows().get(0).cells())
                .containsEntry("created", "2026-08-05T12:20:07Z");
        assertThat(service.readRaw("notes-2026-08-08T12-16-40Z.json").rows().get(0).cells())
                .containsEntry("created", "2026-08-08T12:16:40Z");
    }

    @Test
    void emptyZoneIsNoOp() {
        migration.run(null);

        assertThat(service.list()).isEmpty();
    }
}
