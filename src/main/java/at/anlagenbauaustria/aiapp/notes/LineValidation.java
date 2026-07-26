package at.anlagenbauaustria.aiapp.notes;

import at.anlagenbauaustria.aiapp.notes.model.Warning;

import java.util.List;

/**
 * Validierungsergebnis fuer genau eine Editor-Zeile, wie es das
 * Overlay-Rendering im Frontend braucht (Konzept Kapitel 10.12): kein
 * Fehler/keine Warnung -> ruhige Darstellung, error gesetzt -> roter Rand,
 * sonst nur warnings -> gelber Rand.
 */
public record LineValidation(int lineIndex, boolean blank, String error, List<Warning> warnings) {
}
