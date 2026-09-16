package at.anlagenbauaustria.aiapp.notes.archive.model;

/**
 * Ein Wert in einer Personenspalte (Von/An/Quelle), den das Register nicht
 * aufloesen konnte.
 *
 * Bewusst strukturiert und nicht als fertiger Satz: den Text baut die
 * Oberflaeche, weil sie ihn ohnehin um den Dateinamen ergaenzt und mehrere
 * Funde zu einer lesbaren Zeile zusammenfasst. Ein vorformulierter String
 * vom Server verteilte die Formatierung auf zwei Schichten.
 *
 * row ist die 1-basierte Zeilennummer (order + 1), also die Zahl, die der
 * Nutzer in der Oberflaeche sieht.
 */
public record UnmappedName(int row, String column, String value) {}
