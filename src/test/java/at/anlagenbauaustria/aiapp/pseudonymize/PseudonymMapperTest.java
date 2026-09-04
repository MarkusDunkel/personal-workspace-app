package at.anlagenbauaustria.aiapp.pseudonymize;

import at.anlagenbauaustria.aiapp.config.AivaultProperties;
import at.anlagenbauaustria.aiapp.pipeline.AivaultEnv;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class PseudonymMapperTest {

    @TempDir
    Path aivaultRoot;

    private static final String HEADER = "canonical_value,pseudonym,type,aliases,notes\n";

    /**
     * Der Registerpfad kommt aus ai-vault/.env - hier wird also eine .env im
     * Temp-Root geschrieben, die auf eine ebenfalls temporaere Registerdatei
     * zeigt. Kein Zugriff auf das echte Register des Nutzers.
     */
    private PseudonymMapper.Mapping mappingFor(String csvBody) throws IOException {
        Path register = aivaultRoot.resolve("person_register.csv");
        Files.writeString(register, HEADER + csvBody, StandardCharsets.UTF_8);
        Files.writeString(aivaultRoot.resolve(".env"),
                "AIVAULT_PERSON_REGISTER=" + register.toString().replace('\\', '/') + "\n",
                StandardCharsets.UTF_8);

        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        return new PseudonymMapper(new AivaultEnv(properties)).load();
    }

    @Test
    void longestMatchWinsOverAliasSubstring() throws IOException {
        PseudonymMapper.Mapping mapping = mappingFor(
                "Christian Müller,Person_040,person,MueC;Christian,\n");

        assertThat(mapping.toPseudonym("Christian Müller kommt"))
                .isEqualTo("Person_040 kommt");
    }

    @Test
    void aliasMapsToSamePseudonymAsCanonical() throws IOException {
        PseudonymMapper.Mapping mapping = mappingFor(
                "Helena Nölscher,Person_004,person,Helena;Nölscher,\n");

        assertThat(mapping.toPseudonym("Helena")).isEqualTo("Person_004");
        assertThat(mapping.toPseudonym("Nölscher")).isEqualTo("Person_004");
        // Hinrichtung ist eindeutig: immer der Kanonische, nie ein Alias.
        assertThat(mapping.toDisplay("Person_004")).isEqualTo("Helena Nölscher");
    }

    @Test
    void unknownPseudonymPassesThroughUnchanged() throws IOException {
        PseudonymMapper.Mapping mapping = mappingFor(
                "Markus Dunkel,Person_007,person,,\n");

        assertThat(mapping.toDisplay("Person_083 traf Person_007"))
                .isEqualTo("Person_083 traf Markus Dunkel");
    }

    @Test
    void roundTripLeavesUntouchedTextUnchanged() throws IOException {
        PseudonymMapper.Mapping mapping = mappingFor(
                "Markus Dunkel,Person_007,person,@Markus Dunkel;Markus Dunkel,\n"
                        + "Helena Nölscher,Person_004,person,Helena;Nölscher,\n");

        String original = "Person_007 und Person_083: Rückfrage an Person_004";
        assertThat(mapping.toPseudonym(mapping.toDisplay(original))).isEqualTo(original);
    }

    @Test
    void atPrefixedAliasIsMatched() throws IOException {
        PseudonymMapper.Mapping mapping = mappingFor(
                "Markus Dunkel,Person_007,person,@Markus Dunkel;Markus Dunkel,\n");

        // Beweist die \p{L}-Lookarounds: mit \b als Wortgrenze wuerde das
        // fuehrende "@" die Erkennung verhindern.
        assertThat(mapping.toPseudonym("@Markus Dunkel")).isEqualTo("Person_007");
    }

    @Test
    void umlautNameDoesNotMatchInsideLongerWord() throws IOException {
        PseudonymMapper.Mapping mapping = mappingFor(
                "Nölscher,Person_004,person,,\n");

        // Mit \b (gegen \w definiert, ohne Umlaute) wuerde hier mitten im
        // Wort ersetzt werden.
        assertThat(mapping.toPseudonym("Nölschermann")).isEqualTo("Nölschermann");
    }

    @Test
    void unmappedNameInPersonCellIsReported() throws IOException {
        PseudonymMapper.Mapping mapping = mappingFor(
                "Markus Dunkel,Person_007,person,,\n");

        String reversed = mapping.toPseudonym("Hans Gruber");
        assertThat(mapping.unmappedNames(reversed)).containsExactly("Hans Gruber");
        assertThat(mapping.unmappedNames(mapping.toPseudonym("Markus Dunkel"))).isEmpty();
    }

    @Test
    void missingRegisterYieldsEmptyMapping() throws IOException {
        AivaultProperties properties = new AivaultProperties();
        properties.setRoot(aivaultRoot);
        PseudonymMapper.Mapping mapping = new PseudonymMapper(new AivaultEnv(properties)).load();

        assertThat(mapping.isEmpty()).isTrue();
        assertThat(mapping.toDisplay("Person_007")).isEqualTo("Person_007");
    }
}
