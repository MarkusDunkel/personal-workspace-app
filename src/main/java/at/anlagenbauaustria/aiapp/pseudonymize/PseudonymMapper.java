package at.anlagenbauaustria.aiapp.pseudonymize;

import at.anlagenbauaustria.aiapp.pipeline.AivaultEnv;
import at.anlagenbauaustria.aiapp.pseudonymize.model.RegistryEntry;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Uebersetzt zwischen Pseudonym und Klarname, damit bereits abgelegte
 * (pseudonymisierte) Notizen in 2_ai-ready mit lesbaren Namen angezeigt und
 * nach dem Bearbeiten wieder pseudonymisiert zurueckgeschrieben werden
 * koennen. Grundlage ist ausschliesslich person_register.csv - geschrieben
 * wird die Registerdatei nie von hier (siehe PersonRegisterCsv).
 *
 * Die Zuordnung liegt bewusst serverseitig: der Schreibpfad kann so
 * ueberhaupt keinen Klarnamen nach 2_ai-ready ausgeben, weil die
 * Rueckersetzung zwischen Request-Body und Dateisystem sitzt. Im Frontend
 * waere sie durch jeden kuenftigen Speicherpfad umgehbar.
 */
@Service
public class PseudonymMapper {

    private static final Pattern PSEUDONYM = Pattern.compile("Person_\\d+");

    private final AivaultEnv aivaultEnv;

    public PseudonymMapper(AivaultEnv aivaultEnv) {
        this.aivaultEnv = aivaultEnv;
    }

    /**
     * Liest das Register und baut eine unveraenderliche Momentaufnahme.
     * Bewusst ohne Cache: die Datei wird vom externen
     * "python -m pipelines.pseudonymize update-register" geschrieben, ein
     * Cache waere also genau dann veraltet, wenn es darauf ankommt (direkt
     * nachdem ueber das Absenden eine neue Person aufgenommen wurde). Bei
     * 31 Zeilen / ~1 KB kostet das Neulesen nichts. Pro Request EINMAL
     * aufrufen und die Mapping-Instanz ueber alle Zellen wiederverwenden -
     * dann wird die Alternations-Regex nur einmal kompiliert.
     */
    public Mapping load() {
        Path path = aivaultEnv.getPath("AIVAULT_PERSON_REGISTER");
        List<RegistryEntry> entries = path == null ? List.of() : PersonRegisterCsv.read(path);
        return new Mapping(entries.stream()
                .filter(entry -> "person".equals(entry.type()))
                .filter(entry -> !entry.pseudonym().isBlank() && !entry.canonicalValue().isBlank())
                .toList());
    }

    public static final class Mapping {

        private final Map<String, String> canonicalByPseudonym;
        private final Map<String, String> pseudonymByTermLower;
        private final Pattern termPattern;

        private Mapping(List<RegistryEntry> entries) {
            this.canonicalByPseudonym = entries.stream().collect(Collectors.toMap(
                    RegistryEntry::pseudonym,
                    RegistryEntry::canonicalValue,
                    (first, second) -> first,
                    LinkedHashMap::new));

            // Rueckrichtung akzeptiert Kanonischen UND jeden Alias (viele zu
            // eins: "Helena" und "Noelscher" fuehren beide auf dasselbe
            // Pseudonym). Die Hinrichtung bleibt dagegen eindeutig und gibt
            // immer nur den Kanonischen aus - diese Asymmetrie ist gewollt.
            List<Term> terms = new ArrayList<>();
            Map<String, String> byTermLower = new LinkedHashMap<>();
            for (RegistryEntry entry : entries) {
                LinkedHashSet<String> candidates = new LinkedHashSet<>();
                candidates.add(entry.canonicalValue());
                candidates.addAll(entry.aliases());
                for (String candidate : candidates) {
                    String term = candidate.strip();
                    if (term.isEmpty()) {
                        continue;
                    }
                    String lower = term.toLowerCase(Locale.ROOT);
                    if (byTermLower.putIfAbsent(lower, entry.pseudonym()) == null) {
                        terms.add(new Term(term, lower));
                    }
                }
            }
            this.pseudonymByTermLower = byTermLower;

            // Laengste zuerst: Java bevorzugt in einer Alternation an
            // derselben Position den zuerst genannten Zweig. Ohne diese
            // Sortierung wuerde ein kurzer Alias einen laengeren Namen
            // zerschneiden, in dem er als Teilstring vorkommt ("Christian"
            // ist Alias, "Christian Mueller" der Kanonische - naiv wuerde
            // daraus "Person_040 Mueller").
            terms.sort(Comparator.comparingInt((Term t) -> t.text().length()).reversed()
                    .thenComparing(Term::text));

            this.termPattern = terms.isEmpty() ? null : Pattern.compile(
                    // Bewusst KEIN \b: das ist gegen \w definiert und schliesst
                    // Umlaute aus, wodurch "Noelscher" mitten in einem
                    // zusammengesetzten Wort greifen wuerde. \p{L} blockiert
                    // nur Buchstaben, sodass "@", "-", ".", "," Ziffern und
                    // Leerraum als Grenze gelten - so wird auch die
                    // "@Vorname Nachname"-Aliasform erkannt.
                    terms.stream().map(t -> Pattern.quote(t.text()))
                            .collect(Collectors.joining("|", "(?<!\\p{L})(?:", ")(?!\\p{L})")),
                    Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
        }

        /**
         * Leeres Register: die Hinrichtung ist dann ein harmloser No-Op, die
         * RUECKrichtung waere aber ein Leck (Klarnamen gingen ungefiltert
         * durch). Aufrufer muessen das Schreiben in diesem Fall verweigern.
         */
        public boolean isEmpty() {
            return canonicalByPseudonym.isEmpty();
        }

        /**
         * Die Zuordnung Pseudonym -> Klarname, unveraenderlich.
         *
         * Fuer die Oberflaeche, die Pseudonyme beim ANZEIGEN aufloest (siehe
         * PersonRegisterController). Bewusst nur diese Richtung: die
         * Rueckrichtung (Klarname -> Pseudonym) bleibt serverseitig, sonst
         * waere sie ueber jeden kuenftigen Speicherpfad umgehbar - die
         * Begruendung steht in der Klassen-Javadoc.
         */
        public Map<String, String> displayNames() {
            return Map.copyOf(canonicalByPseudonym);
        }

        /**
         * Ersetzt jedes bekannte Pseudonym durch seinen Klarnamen. Unbekannte
         * Pseudonyme bleiben unveraendert stehen - das Register ist
         * unvollstaendig (es kennt weit weniger Personen als in den Notizen
         * vorkommen), und ein Platzhalter wuerde die Information verlieren,
         * welches Pseudonym gemeint war.
         */
        public String toDisplay(String text) {
            if (text == null || text.isEmpty()) {
                return text;
            }
            // replaceAll(Function) statt replaceAll(String): so werden "$" und
            // "\" in Klarnamen nicht als Ersetzungssyntax interpretiert.
            return PSEUDONYM.matcher(text)
                    .replaceAll(match -> canonicalByPseudonym.getOrDefault(match.group(), match.group()));
        }

        /**
         * Ersetzt bekannte Klarnamen und Aliase wieder durch ihr Pseudonym.
         */
        public String toPseudonym(String text) {
            if (text == null || text.isEmpty() || termPattern == null) {
                return text;
            }
            return termPattern.matcher(text).replaceAll(match ->
                    Matcher.quoteReplacement(
                            pseudonymByTermLower.get(match.group().toLowerCase(Locale.ROOT))));
        }

        /**
         * Fuer Zellen, deren gesamter Inhalt eine Personenidentitaet ist
         * (Von/An/Quelle): liefert die Bestandteile, die nach der
         * Rueckersetzung noch kein Pseudonym sind - also Namen, die im
         * Register fehlen. Im Freitext ist eine solche Pruefung nicht
         * moeglich; dort erkennt nur der Python-Scan neue Namen.
         */
        public List<String> unmappedNames(String pseudonymizedCellValue) {
            if (pseudonymizedCellValue == null || pseudonymizedCellValue.isBlank()) {
                return List.of();
            }
            return Arrays.stream(pseudonymizedCellValue.split("[;,]"))
                    .map(String::strip)
                    .filter(part -> !part.isEmpty())
                    .filter(part -> !PSEUDONYM.matcher(part).matches())
                    .toList();
        }

        private record Term(String text, String lower) {}
    }
}
