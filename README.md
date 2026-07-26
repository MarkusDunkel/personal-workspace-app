# ai-app

Lokal laufende Spring-Boot-Anwendung als Steuerzentrale fuer die
[ai-vault](../ai-vault)-Pipelines. Erster Anwendungsfall: ein
tastaturzentrierter Editor fuer strukturierte Notizen, der die neue
Ingest-Pipeline `notes` in ai-vault befuellt.

**Verhaeltnis zu ai-vault:** `ai-vault` ist die Grundlage dieses Projekts
und bleibt es auch fuer alles, was noch folgt. Dort leben die eigentlichen
Pipelines (Ingest, Boundary, Result) als Python-/Bash-Skripte samt der
sechs Datenstufen (`0_sources` -> ... -> `5_output`) und der
Pseudonymisierungs-Boundary. `ai-app` implementiert keine Pipeline-Logik
neu, sondern ist die Bedienoberflaeche darueber: sie ruft die bestehenden
Skripte auf (`ProcessBuilder`), zeigt ihren Status/ihre Logs an und gibt
dem Nutzer eine schnelle Eingabemaske (den Notiz-Editor), deren Ausgabe
direkt in `ai-vault` landet. Ohne `ai-vault` hat `ai-app` keine Daten und
keine Pipelines zum Steuern - die beiden Repos sind bewusst getrennt
(unterschiedliche Lebenszyklen: Python/Bash-Skripte vs. Java-Anwendung),
aber `ai-app` ist ohne einen konfigurierten `ai-vault`-Checkout nicht
sinnvoll lauffaehig.

## Voraussetzungen

- Java 21 (LTS)
- Maven
- Node/npm werden **nicht** manuell benoetigt: der Maven-Build laedt sich
  eine gepinnte Node-Version automatisch selbst herunter (siehe
  `frontend-maven-plugin` in `pom.xml`)
- Ein lokal ausgecheckter `ai-vault`-Checkout, dessen Pfad in
  `aivault.root` konfiguriert wird (kein Default - siehe
  `src/main/resources/application.yml`)

## Konfiguration

`aivault.root` muss auf den absoluten Pfad des `ai-vault`-Repos zeigen,
z.B. lokal in einer nicht versionierten `application-local.yml` oder als
Umgebungsvariable:

```
AIVAULT_ROOT=/c/Users/<user>/OneDrive - Anlagenbau Austria GmbH/ai-vault
```

Fehlt der Wert, startet die App nicht (`FsGuard` lehnt jeden Zugriff ab -
bewusst kein Default, analog `AIVAULT_PERSON_REGISTER` im ai-vault-Repo).

## Starten

```
mvn spring-boot:run
```

Baut dabei automatisch das React-Frontend (`frontend/`) und liefert es
unter `http://127.0.0.1:8080` aus (nur localhost, kein Netzwerkzugriff
von aussen).

### Frontend-Entwicklung (Hot Reload)

Fuer schnelles Iterieren am Frontend ohne Maven-Rebuild bei jeder
Aenderung: Backend und Vite-Dev-Server parallel laufen lassen.

```
# Terminal 1
mvn spring-boot:run

# Terminal 2
cd frontend
npm run dev
```

Der Vite-Dev-Server (`http://localhost:5173`) leitet alle `/api/**`-
Aufrufe transparent an das Backend auf Port 8080 weiter (siehe
`frontend/vite.config.ts`). Im Browser also `http://localhost:5173`
oeffnen, nicht 8080.

---

## Konzept

### Zielbild

`ai-app` soll perspektivisch jede Pipeline im `ai-vault`-Repo steuerbar
machen: starten, konfigurieren, ueberwachen, pausieren, freigeben, erneut
ausfuehren, protokollieren, Ergebnis nachvollziehen. Die erste Version
deckt davon nur das ab, was fuer den Notiz-Editor und die neue
`notes`-Ingest-Pipeline noetig ist - die Architektur soll die vollstaendige
Steuerung aller Pipelines aber nicht verhindern oder erschweren.

Der erste konkrete Anwendungsfall: ein Editor fuer strukturierte Notizen,
so schnell bedienbar, dass er den Gespraechsfluss in einem Meeting nicht
unterbricht - vollstaendig mit der Tastatur, zeilenorientiert, mit einer
kompakten Syntaxsprache fuer Aufgaben, Entscheidungen, Rueckfragen,
Risiken, Termine, Verweise auf Personen/Projekte/Dateien usw.

### Architektur

```
Browser (127.0.0.1:8080)
  static/ - React + TypeScript SPA (Vite-Build), Quelle in frontend/
      |  fetch() / JSON REST
Spring Boot (embedded Tomcat, nur 127.0.0.1)
  Controller  - REST-Endpunkte
  Services    - Parsing/Validierung, Dateizugriff, (spaeter) Pipeline-Runner
  Persistenz  - Markdown-Dateien in ai-vault (Wahrheit), optional SQLite
                als Index/Cache (nie die einzige Quelle)
      |  direkter Dateisystemzugriff + Aufruf bestehender Skripte
ai-vault/ (separates Repo, per aivault.root referenziert)
  0_sources/notes/ -> 1_processed/notes/ -> Boundary -> 2_ai-ready/notes/
  Boundary-Skripte (run_pseudonymize.sh, run_reidentify.sh) werden
  unveraendert aufgerufen, nie in Java neu implementiert.
```

Leitentscheidungen, die die aktuelle Umsetzung praegen:

- **React + TypeScript Frontend, Maven-integrierter Build.** Die Quelle
  liegt in `frontend/` (Vite + React + TypeScript), das
  `frontend-maven-plugin` in `pom.xml` laedt eine gepinnte Node-Version
  herunter und baut das Frontend automatisch bei jedem `mvn package`
  nach `src/main/resources/static/` - ein einziger Build-Schritt liefert
  das komplette lauffaehige JAR. Die Textarea+Overlay-Technik fuer die
  Live-Validierung pro Zeile (kein Server-Roundtrip pro Tastendruck)
  bleibt dabei unveraendert erhalten, nur die Implementierungstechnologie
  hat gewechselt (vormals reines Vanilla-JS ohne Build-Schritt). Fuer
  Frontend-Entwicklung mit Hot Reload laeuft der Vite-Dev-Server separat
  und proxied API-Aufrufe zum Backend (siehe Abschnitt "Starten").
- **Markdown bleibt die einzige Wahrheit.** Die App schreibt/liest
  Markdown-Dateien in `ai-vault`; eine etwaige SQLite-Datenbank ist reiner
  Index/Cache und muss aus den Markdown-Dateien jederzeit neu aufbaubar
  sein.
- **Pipeline-Logik lebt in `ai-vault`, nicht in Java.** Boundary
  (Pseudonymisierung), Parsing im echten Ingest-Lauf, Klassifizierung -
  all das bleibt in den bestehenden Python-/Bash-Skripten. `ai-app` ruft
  sie auf und zeigt ihr Ergebnis, reimplementiert sie nicht.
- **Sicherheitsfundament vor jeder Datei-I/O.** Jeder Dateizugriff laeuft
  ueber `FsGuard` (Pfad-Traversal-Schutz, Schreibzonen-Whitelist) und
  `AtomicFileWriter` (atomare Schreibvorgaenge) - siehe
  [Sicherheitsmodell](#sicherheitsmodell).

### Syntaxsprache (Kurzfassung)

Praefixbasiert, ein Kern-Trenner (`|`) zwischen Segmenten:

```
[Quelle:] [Typ-Praefix] Inhalt [| Praefix: Wert]...
```

Beispiel: `Huber: t: Angebot nachfassen | f: 2026-08-01` - Huber ist die
Quelle, `t:` markiert eine Aufgabe, `f:` setzt die Frist. Weitere
Typ-Praefixe: `tm:` (Aufgabe fuer mich), `td:` (delegierte Aufgabe),
`d:` (Entscheidung), `r:` (Rueckfrage), `risk:` (Risiko), `blk:`
(Blocker), `nx:` (Folgeaktion). Segmente wie `p:` (Prioritaet), `proj:`
(Projekt), `@`/`->`/`>>` (Person/Empfaenger), `#` (Tag), `f-doc:`
(Dateiverweis), `!` (vertraulich) lassen sich beliebig kombinieren. Ein
einzelner Syntaxfehler blockiert nur die betroffene Zeile, nie den Rest
der Datei.

Referenzimplementierung: `NoteSyntaxParser` (Java, fuer die Live-
Validierung im Editor) und `parse_notes.py` (Python, im echten Ingest-Lauf
in `ai-vault`) - beide sind unabhaengige Implementierungen desselben
Kontrakts und muessen bei Grammatikaenderungen synchron gepflegt werden.

### Statusmodell einer Notiz

```
[parse] -> draft -> reviewed -> (Boundary: pseudonymize) -> in 2_ai-ready
              |         |
              |         +-> rejected (bewusst verworfen)
              +-> invalid (Parser-Fehler, Originaltext bleibt erhalten)
```

Nur Notizen mit `status: reviewed` nehmen am naechsten
`run_pseudonymize.sh`-Lauf teil (Filter `filter_reviewed.py` in
`ai-vault`). `draft`, `rejected` und `invalid` erreichen `2_ai-ready/`
nie - kein Datenverlust, aber auch keine ungeprueften Inhalte im
Knowledge Hub.

---

## Aktueller Stand

Umgesetzt (siehe `src/main/java/at/anlagenbauaustria/aiapp/`):

- **Grundgeruest:** Maven-Projekt, Spring Boot 3.3.4, Java 21,
  SQLite-JDBC als Abhaengigkeit vorbereitet (noch nicht verdrahtet).
- **Sicherheitsfundament:** `fs.FsGuard` (Pfad-Traversal-/Schreibzonen-
  Schutz), `fs.AtomicFileWriter` (atomare Schreibvorgaenge),
  `config.AivaultProperties` (Pflicht-Property `aivault.root`, kein
  Default).
- **Syntaxsprache:** `notes.NoteSyntaxParser` (reine, seiteneffektfreie
  Grammatik-Implementierung) und `notes.NoteValidator` (relative
  Datumsausdruecke wie "Fr"/"morgen", zusaetzliche Plausibilitaets-
  warnungen). 23 Unit-Tests in `NoteSyntaxParserTest`, ein Testfall pro
  Beispiel der Konzept-Referenztabelle.
- **REST-API:** `notes.NoteController` mit `GET/PUT /api/notes/{date}`
  (Rohtext lesen/speichern) und `POST /api/notes/validate`
  (zeilenweise Live-Validierung ohne Datei zu schreiben), dahinter
  `notes.NoteFileService` (einzige Schreibzone: `0_sources/notes/`).
- **Frontend:** `frontend/` (React + TypeScript, Vite-Build) - Editor
  als `<textarea>` mit synchron mitlaufendem Overlay (Fehler/Warnungen
  als linker Rand, kein contenteditable), debounced Auto-Save (800 ms)
  plus periodisches Speichern als Netz (30 s), debounced
  Live-Validierung (400 ms), Tastenkuerzel fuer Erledigt-Markierung
  (`Strg+Enter`), Zeile duplizieren (`Strg+D`), Kurzhilfe (`Strg+.`).
  Baut via `frontend-maven-plugin` automatisch in
  `src/main/resources/static/`.
- **Gegenstueck in `ai-vault`:** `pipelines/notes/` mit `run_ingest.sh`,
  `processing/01_parse/parse_notes.py`, `processing/02_classify_dedupe/
  classify_dedupe.py` (Duplikaterkennung: exakt -> automatisch
  verworfen, aehnlich -> nur Hinweis), `filter_reviewed.py`,
  `run_pseudonymize.sh`, `run_reidentify.sh`, `reidentify/reidentify.py`
  (Passthrough-Stub). End-to-end mit Python gegen alle Syntaxbeispiele
  getestet.

Noch nicht umgesetzt / bekannte Luecken:

- Die Java-Testsuite (`NoteSyntaxParserTest`) laeuft jetzt (Java 21 ist
  installiert), zeigt aber 2 von 23 Tests fehlschlagend
  (`example07_blockerWithFollowupSegment`,
  `example17_unknownPrefixBecomesFreetextWithWarning`) - vorbestehende
  Abweichungen in `NoteSyntaxParser` gegenueber der Python-Referenz
  (`parse_notes.py`), unabhaengig vom Frontend-Wechsel. **Noch zu
  klaeren, bevor `mvn package` ohne `-DskipTests` wieder gruen laeuft.**
- Keine Autovervollstaendigung fuer Personen/Projekte im Frontend
  (Konzept sieht eine `contacts.yml` vor, getrennt vom
  `person_register.csv` der Boundary - noch nicht angelegt).
- Kein GitHub-Remote fuer dieses Repo eingerichtet (nur lokal
  initialisiert).

## Ausschau: was noch umgesetzt werden soll

Reihenfolge in etwa wie im urspruenglichen Umsetzungsplan, angepasst an
den erreichten Stand:

1. **Java-Umgebung einrichten und Tests scharf schalten.** JDK 21 +
   Maven lokal installieren, `mvn test` einmal echt gruen bekommen,
   danach `mvn spring-boot:run` gegen einen echten `ai-vault`-Checkout
   im Meeting ausprobieren.
2. **Autovervollstaendigung** fuer Praefixe, bekannte Personen (aus
   einer eigenen `contacts.yml`, bewusst getrennt vom
   Pseudonymisierungs-Register) und Projekte im Editor-Frontend.
3. **Pipeline-Domaenenmodell generisch verdrahten:**
   `PipelineDefinition`/`StepDefinition`/`PipelineRun` als Java-Records,
   `PipelineRegistry` (liest eine Konfiguration oder registrierte
   Provider-Beans) und `PipelineRunner` (fuehrt Schritt-Kommandos ueber
   `ProcessBuilder` aus, faengt stdout/stderr/Exit-Code ein, serielle
   Run-Queue). `notes` wird die erste registrierte Pipeline, aber das
   Modell bleibt von Anfang an eine Liste, kein Sonderfall - jede
   bestehende `ai-vault`-Pipeline (`sharepoint`, `azure_boards`,
   `transcripts`, die Result-Pipelines) laesst sich darauf ohne
   Architekturaenderung aufsetzen.
4. **Pipeline-Dashboard** (statisches Frontend, analog zum Editor):
   Karten pro Pipeline/Schritt, Start-Button, Live-Log per
   Server-Sent-Events, letzter Lauf/Status.
5. **Review-UI** gegen `1_processed/notes/02_classify_dedupe/`: Liste der
   `draft`/`invalid`-Notizen, Freigeben/Verwerfen/Korrigieren, schreibt
   den Statuswechsel inkl. `history:`-Eintrag in die jeweilige Datei
   zurueck.
6. **Ingest-Lauf aus der App ausloesen** (Button ruft
   `pipelines/notes/run_ingest.sh` auf), inklusive Anzeige der
   Ergebnisse (wie viele Einheiten, wie viele ungueltig/Duplikate).
7. **SQLite-Index** (`index.NoteIndexRepository`,
   `index.IndexRebuildService`): Statusuebersicht, Volltextsuche,
   Run-Historie - als Cache, jederzeit aus den Markdown-Dateien in
   `ai-vault` neu aufbaubar, nie die einzige Quelle.
8. **End-to-End-Testlauf mit echtem Register:** Editor -> Ingest ->
   Review -> `run_pseudonymize.sh` (mit echtem
   `person_register.csv`) -> Kontrolle des Ergebnisses in
   `2_ai-ready/notes/`.
9. **Absicherung/Wiederherstellung nachziehen:** Aenderungsjournal
   (`logs/notes-journal.jsonl`) fuer Statuswechsel, Recovery nach Absturz
   waehrend eines Schreibvorgangs (unfertige `.tmp`-Dateien beim
   App-Start erkennen und aufraeumen).
10. **Perspektivisch, nicht terminiert:** Zeitsteuerung/Ordnerueberwachung
    fuer automatische Ingest-Laeufe, Dry-Run fuer Massenoperationen,
    Undo-UI auf Basis des Journals - das Domaenenmodell aus Schritt 3
    sieht diese Erweiterungen vor (z.B. `TriggerDefinition`-Typen), sie
    sind aber bewusst nicht Teil der ersten Version.

## Sicherheitsmodell

Jeder Dateizugriff laeuft ausschliesslich ueber `FsGuard`
(`at.anlagenbauaustria.aiapp.fs.FsGuard`): Pfad-Traversal ("..",
Symlinks aus der Root heraus) wird hart abgelehnt, Schreibzonen sind pro
Feature eingeschraenkt (der Notiz-Editor darf z.B. nur nach
`0_sources/notes/` schreiben). Schreibvorgaenge laufen ueber
`AtomicFileWriter` (Schreiben nach `.tmp`, dann atomarer Move).
