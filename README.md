# ai-app

Lokal laufende Spring-Boot-Anwendung als Steuerzentrale fuer die
[ai-vault](../ai-vault)-Pipelines. Erster Anwendungsfall: eine
tabellenartige Eingabemaske fuer strukturierte Notizen (Aufgabe/Info), die
per "Absenden"-Button die Ingest-Pipeline `notes` in ai-vault anstoesst -
inklusive der Pseudonymisierungs-Boundary, gesteuert ueber die
Weboberflaeche statt per Hand in `review.csv`/`person_register.csv`.

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

Der erste konkrete Anwendungsfall: zwei tabellenartige Eingabemasken
("Aufgabe", "Info") fuer strukturierte Notizen, mit Autosave, Tastatur-
navigation und einem expliziten "Absenden"-Button, der die Daten pseudony-
misiert nach `ai-vault` uebertraegt.

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
  0_sources/notes/ -> Boundary (scan/apply) -> 2_ai-ready/notes/
  Boundary-Skripte (pipelines/notes/run_scan.sh, run_pseudonymize.sh,
  das generische pipelines/pseudonymize-Modul) werden unveraendert per
  ProcessBuilder aufgerufen, nie in Java neu implementiert.
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

### Notes-Tabellen (Kurzfassung)

Zwei fest definierte Tabellentypen (`NoteRegistry`): "Aufgabe"
(Spalten `von`, `inhalt`, `bis`, `an`) und "Info" (Spalten `quelle`,
`inhalt`). Jede Zeile ist eine strukturierte Notiz; Personen-Spalten
(`ColumnType.PERSON`) bieten eine Autovervollstaendigung gegen
`0_sources/contacts.yml`. Autosave (debounced 800 ms + 30s-Netz) haelt
`0_sources/notes/{aufgabe,info}.json` in `ai-vault` synchron.

### Absenden-Flow (Pseudonymisierung ueber die Weboberflaeche)

Der "Absenden"-Button in der `TopBar` stoesst die Uebergabe an die
Pseudonymisierungs-Boundary an, vollstaendig aus der Weboberflaeche
gesteuert - der Nutzer bearbeitet `review.csv`/`person_register.csv`
nie mehr von Hand:

```
Absenden
  -> POST /api/notes/submit           (pipelines/notes/run_scan.sh: scan)
  -> Review-Dialog pro neuem Kandidaten (neu anlegen / Alias von / ignorieren)
  -> POST /api/notes/submit/decisions (update-register + run_pseudonymize.sh)
  -> Ergebnis: 2_ai-ready/notes/{aufgabe,info}.json
```

Die eigentliche Erkennung (spaCy-NER + E-Mail-Regex), die Registerpflege
und die Ersetzung bleiben vollstaendig in `pipelines/pseudonymize`
(Python) - `ai-app` orchestriert nur die Prozessaufrufe und zeigt die
Kandidaten/das Ergebnis an. Reidentify ist bewusst kein Teil dieses
Schritts (siehe `pipelines/notes/README.md` in `ai-vault`).

---

## Aktueller Stand

Umgesetzt (siehe `src/main/java/at/anlagenbauaustria/aiapp/`):

- **Grundgeruest:** Maven-Projekt, Spring Boot 3.3.4, Java 21,
  SQLite-JDBC als Abhaengigkeit vorbereitet (noch nicht verdrahtet).
- **Sicherheitsfundament:** `fs.FsGuard` (Pfad-Traversal-/Schreibzonen-
  Schutz), `fs.AtomicFileWriter` (atomare Schreibvorgaenge),
  `config.AivaultProperties` (Pflicht-Property `aivault.root`, kein
  Default).
- **Notes-Tabellen:** `notes.NoteRegistry` (hardcodierte Tabellentypen
  Aufgabe/Info), `notes.NoteDataService` (einzige Schreibzone:
  `0_sources/notes/`), REST-API `notes.NoteController`
  (`GET /api/notes`, `GET/PUT /api/notes/{tableId}`).
- **Absenden/Pseudonymisierung:** `pipeline.PipelineRunner` (fuehrt
  ai-vault-Skripte per `ProcessBuilder` aus), `notes.NoteSubmitService` +
  `notes.NoteSubmitController` (`POST /api/notes/submit`,
  `POST /api/notes/submit/decisions`) orchestrieren
  `pipelines/notes/run_scan.sh` -> Review-Entscheidungen des Nutzers ->
  `update-register` -> `pipelines/notes/run_pseudonymize.sh`.
- **Frontend:** `frontend/` (React + TypeScript, Vite-Build) - zwei
  Tabellen-Grids (`DataGrid`, `NoteSection`) mit Zellnavigation,
  Personen-Autovervollstaendigung, Datumspicker, debounced Auto-Save
  (800 ms) plus periodisches Speichern als Netz (30 s). "Absenden"-Button
  in der `TopBar` fuehrt durch eine Modal-Sequenz (Scan-Fortschritt,
  Kandidaten-Review, Ergebnis). Baut via `frontend-maven-plugin`
  automatisch in `src/main/resources/static/`.
- **Gegenstueck in `ai-vault`:** `pipelines/notes/` mit `run_scan.sh`
  (ruft `pipelines.pseudonymize scan`) und `run_pseudonymize.sh` (ruft
  `pipelines.pseudonymize apply`), beide ohne `1_processed`-Zwischenschritt
  (die JSON-Dateien sind bereits strukturiert). Kein `run_reidentify.sh`
  in dieser Ausbaustufe.

Noch nicht umgesetzt / bekannte Luecken:

- Kein GitHub-Remote fuer dieses Repo eingerichtet (nur lokal
  initialisiert).
- Kein `run_reidentify.sh` fuer Notes (siehe `ai-vault/pipelines/notes/README.md`).
- Kein generisches Pipeline-Dashboard - der Absenden-Flow ist der einzige
  aus der UI ausloesbare Pipeline-Lauf.

## Ausschau: was noch umgesetzt werden soll

1. **Reidentify fuer Notes** (`pipelines/notes/run_reidentify.sh` +
   `reidentify/reidentify.py`), falls spaeter benoetigt.
2. **Pipeline-Domaenenmodell generisch verdrahten:**
   `PipelineDefinition`/`StepDefinition`/`PipelineRun` als Java-Records,
   `PipelineRegistry` und ein ausgebauter `PipelineRunner` mit serieller
   Run-Queue. `notes` ist aktuell noch ein Sonderfall (direkter Aufruf,
   kein generisches Modell) - jede weitere `ai-vault`-Pipeline
   (`sharepoint`, `azure_boards`, `transcripts`, die Result-Pipelines)
   soll darauf ohne Architekturaenderung aufsetzen koennen.
3. **Pipeline-Dashboard** (statisches Frontend): Karten pro
   Pipeline/Schritt, Start-Button, Live-Log per Server-Sent-Events,
   letzter Lauf/Status.
4. **SQLite-Index** (`index.NoteIndexRepository`,
   `index.IndexRebuildService`): Statusuebersicht, Volltextsuche,
   Run-Historie - als Cache, jederzeit aus den JSON-Dateien in
   `ai-vault` neu aufbaubar, nie die einzige Quelle.
5. **Absicherung/Wiederherstellung nachziehen:** Aenderungsjournal fuer
   Absenden-Laeufe, Recovery nach Absturz waehrend eines Schreibvorgangs
   (unfertige `.tmp`-Dateien beim App-Start erkennen und aufraeumen).
6. **Perspektivisch, nicht terminiert:** Zeitsteuerung/Ordnerueberwachung
   fuer automatische Ingest-Laeufe, Dry-Run fuer Massenoperationen,
   Undo-UI - das Domaenenmodell aus Schritt 2 sieht diese Erweiterungen
   vor, sie sind aber bewusst nicht Teil der ersten Version.

## Sicherheitsmodell

Jeder Dateizugriff laeuft ausschliesslich ueber `FsGuard`
(`at.anlagenbauaustria.aiapp.fs.FsGuard`): Pfad-Traversal ("..",
Symlinks aus der Root heraus) wird hart abgelehnt, Schreibzonen sind pro
Feature eingeschraenkt (die Notes-Tabellen duerfen z.B. nur nach
`0_sources/notes/` schreiben). Schreibvorgaenge laufen ueber
`AtomicFileWriter` (Schreiben nach `.tmp`, dann atomarer Move).

Der Absenden-Flow greift zusaetzlich auf `person_register.csv`
(`AIVAULT_PERSON_REGISTER`) lesend zu und ruft ausschliesslich
bestehende, unveraenderte ai-vault-Skripte auf - `ai-app` schreibt nie
direkt in `person_register.csv` oder `2_ai-ready/`, das erledigen die
Python-Skripte in `ai-vault` (siehe `ai-vault/CLAUDE.md`, "Boundary is
the user's").
