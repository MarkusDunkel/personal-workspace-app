package at.anlagenbauaustria.aiapp.pseudonymize;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Liefert die Zuordnung Pseudonym -> Klarname, damit die Oberflaeche
 * "Person_076" LESBAR anzeigen kann.
 *
 * Bewusst ein eigenes Praefix und keine Unterressource von
 * /api/workspaces/{name} - dort warnt die Javadoc ausdruecklich davor (der
 * Name wuerde ein "/register" mit verschlucken). Die Zuordnung ist ausserdem
 * gar nicht workspace-spezifisch: sie gilt fuer jedes Dokument.
 *
 * NUR die Hinrichtung (Pseudonym -> Klarname) wird ausgeliefert, nicht die
 * Rueckrichtung. Das ist Absicht: die Oberflaeche soll Namen ANZEIGEN, sie
 * darf sie nicht in die Datei zurueckschreiben. Die Rueckersetzung bleibt
 * dort, wo sie hingehoert - serverseitig zwischen Request und Dateisystem
 * (siehe PseudonymMapper, Klassen-Javadoc).
 */
@RestController
public class PersonRegisterController {

    private final PseudonymMapper pseudonymMapper;

    public PersonRegisterController(PseudonymMapper pseudonymMapper) {
        this.pseudonymMapper = pseudonymMapper;
    }

    /**
     * Pseudonym -> Klarname. Leer, wenn das Register fehlt oder
     * AIVAULT_PERSON_REGISTER nicht gesetzt ist - die Oberflaeche zeigt dann
     * einfach die Pseudonyme, was der heutige Zustand ist.
     */
    @GetMapping("/api/person-register")
    public Map<String, String> personRegister() {
        return pseudonymMapper.load().displayNames();
    }
}
