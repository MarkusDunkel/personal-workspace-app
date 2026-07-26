package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.notes.model.Note;
import at.anlagenbauaustria.aiapp.notes.model.NoteType;
import at.anlagenbauaustria.aiapp.notes.model.ParseResult;
import at.anlagenbauaustria.aiapp.notes.model.Priority;
import at.anlagenbauaustria.aiapp.notes.model.Warning;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Ein Testfall pro Beispiel aus dem Konzeptdokument, Kapitel 11
 * (Syntaxbeispiele und Interpretation). Nummerierung folgt der Tabelle dort
 * 1:1, damit Parser-Java und der spaetere Python-Ingest-Parser denselben
 * Kontrakt teilen (offene Entscheidung 22, Variante a).
 */
class NoteSyntaxParserTest {

    private final NoteSyntaxParser parser = new NoteSyntaxParser();

    @Test
    void example01_taskWithSourceAndDue() {
        Note note = single("Huber: t: Angebot nachfassen | f: 2026-08-01");
        assertThat(note.type()).isEqualTo(NoteType.TASK);
        assertThat(note.source()).isEqualTo("Huber");
        assertThat(note.text()).isEqualTo("Angebot nachfassen");
        assertThat(note.due()).isEqualTo("2026-08-01");
    }

    @Test
    void example02_taskMeWithRelativeDueAndPriority() {
        Note note = single("tm: Bericht für Vorstand schreiben | f: Fr | p: hoch");
        assertThat(note.type()).isEqualTo(NoteType.TASK_ME);
        assertThat(note.text()).isEqualTo("Bericht für Vorstand schreiben");
        assertThat(note.dueRaw()).isEqualTo("Fr");
        assertThat(note.priority()).isEqualTo(Priority.HOCH);
    }

    @Test
    void example03_taskDelegateWithArrowInHead() {
        Note note = single("td: Angebot prüfen -> Maier | f: 2026-08-05");
        assertThat(note.type()).isEqualTo(NoteType.TASK_DELEGATE);
        assertThat(note.text()).isEqualTo("Angebot prüfen");
        assertThat(note.assignee()).isEqualTo("Maier");
        assertThat(note.due()).isEqualTo("2026-08-05");
        assertThat(note.warnings()).isEmpty();
    }

    @Test
    void example04_decisionWithProjectAndTag() {
        Note note = single("d: Variante B gewählt | proj: Rollout2026 | #Entscheidung");
        assertThat(note.type()).isEqualTo(NoteType.DECISION);
        assertThat(note.project()).isEqualTo("Rollout2026");
        assertThat(note.tags()).containsExactly("Entscheidung");
    }

    @Test
    void example05_questionWithPersonRef() {
        Note note = single("r: Ist das Budget für Q3 schon freigegeben? | @Maier");
        assertThat(note.type()).isEqualTo(NoteType.QUESTION);
        assertThat(note.assignee()).isEqualTo("Maier");
    }

    @Test
    void example06_riskWithPriorityAndProject() {
        Note note = single("risk: Lieferverzug bei Komponente X wahrscheinlich | p: hoch | proj: Rollout2026");
        assertThat(note.type()).isEqualTo(NoteType.RISK);
        assertThat(note.priority()).isEqualTo(Priority.HOCH);
        assertThat(note.project()).isEqualTo("Rollout2026");
    }

    @Test
    void example07_blockerWithFollowupSegment() {
        Note note = single("blk: Zugang zur Test-API fehlt noch | nx: IT kontaktieren");
        assertThat(note.type()).isEqualTo(NoteType.BLOCKER);
        assertThat(note.text()).contains("IT kontaktieren");
    }

    @Test
    void example08_forcedSourceViaQPrefix() {
        Note note = single("q: Kunde XY | Wunsch nach früherem Liefertermin geäußert");
        assertThat(note.source()).isEqualTo("Kunde XY");
        assertThat(note.sourceForced()).isTrue();
        assertThat(note.type()).isEqualTo(NoteType.INFO);
        assertThat(note.text()).isEqualTo("Wunsch nach früherem Liefertermin geäußert");
    }

    @Test
    void example09_sourceWithQuestionAndProject() {
        Note note = single("Maier: r: Wie ist der Status beim Rollout? | proj: Rollout2026");
        assertThat(note.source()).isEqualTo("Maier");
        assertThat(note.type()).isEqualTo(NoteType.QUESTION);
        assertThat(note.project()).isEqualTo("Rollout2026");
    }

    @Test
    void example10_doneMarker() {
        Note note = single("x t: Angebot verschickt");
        assertThat(note.done()).isTrue();
        assertThat(note.type()).isEqualTo(NoteType.TASK);
        assertThat(note.text()).isEqualTo("Angebot verschickt");
    }

    @Test
    void example11_fileRefWithFreetextHead() {
        Note note = single("f-doc: Angebot_v2.docx | proj: Rollout2026 | Angebot final abgestimmt");
        assertThat(note.type()).isEqualTo(NoteType.INFO);
        assertThat(note.fileRef()).isEqualTo("Angebot_v2.docx");
        assertThat(note.project()).isEqualTo("Rollout2026");
        assertThat(note.text()).contains("Angebot final abgestimmt");
    }

    @Test
    void example12_confidentialMarker() {
        Note note = single("! Vertrauliche Info: Budget-Deckel liegt bei 50k");
        assertThat(note.confidential()).isTrue();
        assertThat(note.type()).isEqualTo(NoteType.INFO);
        assertThat(note.text()).contains("Budget-Deckel liegt bei 50k");
    }

    @Test
    void example13_continuationLineIsJoinedBeforeParsing() {
        List<String> joined = parser.joinContinuations(List.of(
                "t: Rabattstaffel für",
                "  + Mengen über 500 klären -> Maier"
        ));
        assertThat(joined).hasSize(1);
        Note note = single(joined.get(0));
        assertThat(note.type()).isEqualTo(NoteType.TASK);
        assertThat(note.text()).isEqualTo("Rabattstaffel für Mengen über 500 klären");
        assertThat(note.assignee()).isEqualTo("Maier");
    }

    @Test
    void example14_freetextWithoutPrefixIsInfoNotError() {
        Note note = single("Servus, kurze Frage zum Zeitplan noch offen");
        assertThat(note.type()).isEqualTo(NoteType.INFO);
        assertThat(note.text()).isEqualTo("Servus, kurze Frage zum Zeitplan noch offen");
    }

    @Test
    void example15_taskDelegateMissingRecipientIsWarningNotError() {
        Note note = single("td: Protokoll versenden");
        assertThat(note.type()).isEqualTo(NoteType.TASK_DELEGATE);
        assertThat(note.warnings())
                .extracting(Warning::code)
                .contains(Warning.MISSING_RECIPIENT);
    }

    @Test
    void example16_unresolvedDateIsWarningNotError() {
        Note note = single("f: übernächsten Dienstag | t: Workshop vorbereiten");
        assertThat(note.type()).isEqualTo(NoteType.TASK);
        assertThat(note.text()).isEqualTo("Workshop vorbereiten");
        assertThat(note.due()).isNull();
        assertThat(note.dueRaw()).isEqualTo("übernächsten Dienstag");
        assertThat(note.warnings())
                .extracting(Warning::code)
                .contains(Warning.UNRESOLVED_DATE);
    }

    @Test
    void example17_unknownPrefixBecomesFreetextWithWarning() {
        Note note = single("xy: irgendwas Neues");
        assertThat(note.type()).isEqualTo(NoteType.INFO);
        assertThat(note.text()).isEqualTo("xy: irgendwas Neues");
        assertThat(note.warnings())
                .extracting(Warning::code)
                .contains(Warning.UNKNOWN_PREFIX);
    }

    @Test
    void example18_taskWithFullSegmentSet() {
        Note note = single("t: Schulung buchen | proj: Onboarding | p: 2 | f: 2026-09-01 | >> Weber");
        assertThat(note.project()).isEqualTo("Onboarding");
        assertThat(note.priority()).isEqualTo(Priority.HOCH);
        assertThat(note.due()).isEqualTo("2026-09-01");
        assertThat(note.assignee()).isEqualTo("Weber");
    }

    @Test
    void example19_secondTypePrefixCreatesLinkedSecondUnit() {
        ParseResult result = parser.parse("d: Tool-Wechsel auf Version 5 | #IT #Budget | risk: Migrationsaufwand unklar");
        assertThat(result.notes()).hasSize(2);
        Note first = result.notes().get(0);
        Note second = result.notes().get(1);
        assertThat(first.type()).isEqualTo(NoteType.DECISION);
        assertThat(first.tags()).containsExactlyInAnyOrder("IT", "Budget");
        assertThat(second.type()).isEqualTo(NoteType.RISK);
        assertThat(second.text()).isEqualTo("Migrationsaufwand unklar");
    }

    @Test
    void example20_blankLineIsIgnored() {
        ParseResult result = parser.parse("   ");
        assertThat(result.isBlank()).isTrue();
        assertThat(result.notes()).isEmpty();
        assertThat(result.error()).isNull();
    }

    @Test
    void example21_sourceWithoutTypePrefixIsInfo() {
        Note note = single("Huber: Frage zur Deadline offen, sonst nichts Neues");
        assertThat(note.source()).isEqualTo("Huber");
        assertThat(note.type()).isEqualTo(NoteType.INFO);
    }

    @Test
    void example22_followupWithAssigneeAndRelativeDue() {
        Note note = single("nx: Rückmeldung an Kunden bis Freitag | -> Weber | f: Fr");
        assertThat(note.type()).isEqualTo(NoteType.FOLLOWUP);
        assertThat(note.assignee()).isEqualTo("Weber");
        assertThat(note.dueRaw()).isEqualTo("Fr");
    }

    @Test
    void emptyContentAfterPrefixIsHardError() {
        ParseResult result = parser.parse("t:");
        assertThat(result.isError()).isTrue();
        assertThat(result.error()).contains("Text");
    }

    private Note single(String line) {
        ParseResult result = parser.parse(line);
        assertThat(result.isError()).isFalse();
        assertThat(result.notes()).hasSize(1);
        return result.notes().get(0);
    }
}
