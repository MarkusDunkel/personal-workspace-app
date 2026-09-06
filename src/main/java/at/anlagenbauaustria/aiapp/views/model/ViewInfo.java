package at.anlagenbauaustria.aiapp.views.model;

/**
 * Kopfzeile einer Ansicht fuer die Auswahlliste.
 *
 * available trennt "noch nie erzeugt" von "vorhanden": die Oberflaeche kann
 * dann statt eines leeren iframes den Hinweis zeigen, dass zuerst
 * "Neu erzeugen" zu druecken ist. Eine fehlende Datei ist naemlich der
 * Normalfall bei einer frisch aufgesetzten ai-vault-Kopie, kein Fehler.
 *
 * generatedAt ist die Aenderungszeit der Ausgabedatei (ISO-8601, lokale
 * Zeitzone) oder null, wenn es sie noch nicht gibt.
 */
public record ViewInfo(String id, String label, boolean available, String generatedAt) {}
