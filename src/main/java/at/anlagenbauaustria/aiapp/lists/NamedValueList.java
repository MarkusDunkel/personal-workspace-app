package at.anlagenbauaustria.aiapp.lists;

import java.util.List;

/**
 * Zwei Klarnamen-Listen statt eines Flags pro Wert: "confirmed" sind Werte,
 * die mindestens einmal in einem erfolgreichen Absenden-Vorgang tatsaechlich
 * verwendet wurden und bleiben dauerhaft erhalten; "provisional" sind neu
 * eingetippte Werte, die verschwinden, wenn sie beim naechsten Absenden
 * nicht verwendet werden (siehe ListsService.reconcile).
 */
public record NamedValueList(
        List<String> confirmed,
        List<String> provisional
) {}
