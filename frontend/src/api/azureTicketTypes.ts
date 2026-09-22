// Mirrors at.anlagenbauaustria.aiapp.azureboards.tickets.*

/**
 * In welchem Format die Beschreibung vorliegt. Bestimmt, welcher Editor
 * angeboten wird - umgeschrieben wird ein Dialekt nie.
 */
export type DescriptionDialect = 'EMPTY' | 'PLAIN' | 'MARKDOWN' | 'HTML' | 'MIXED';

/** Dialekte, die der visuelle Editor bedienen kann (siehe DescriptionDialect.java). */
export function allowsVisualEditor(dialect: DescriptionDialect): boolean {
  return dialect === 'MARKDOWN' || dialect === 'PLAIN' || dialect === 'EMPTY';
}

export interface TicketSummary {
  id: string;
  title: string;
  workItemType: string;
  fileName: string;
  dialect: DescriptionDialect;
  /** Enthaelt eine Roadmap-Historie-Tabelle, die die Pipeline auswertet. */
  hasRoadmapHistory: boolean;
  /** Traegt den _conflicts-Schluessel des 3-Wege-Merges - blockiert den Import. */
  hasConflicts: boolean;
}

/** Mirrors EditableField.java - die Felder, die bearbeitet werden duerfen. */
export type EditableField = 'DESCRIPTION' | 'ACCEPTANCE_CRITERIA';

export interface TicketField {
  field: EditableField;
  /** Ueberschrift im Editor, vom Server vorgegeben. */
  label: string;
  /** Der Rohwert, genau wie er in der Datei steht. */
  value: string;
  /**
   * Je Feld einzeln bestimmt: die Beschreibung kann Markdown sein, waehrend
   * die Acceptance Criteria desselben Tickets in HTML vorliegen.
   */
  dialect: DescriptionDialect;
}

export interface TicketDocument extends TicketSummary {
  /** Der Rohwert, genau wie er in der Datei steht. */
  description: string;
  /** Opaker Aenderungsmarker der DATEI, unveraendert zurueckzugeben. */
  revision: string;
  /**
   * Was dieses Ticket bearbeiten laesst: immer die Beschreibung, bei User
   * Stories in "technical" zusaetzlich die Acceptance Criteria. Reihenfolge
   * wie im Editor.
   */
  fields: TicketField[];
  /**
   * Adresse des Originals in Azure Boards. Kommt fertig vom Server, damit
   * Organisation und Projektname nicht im Frontend festgeschrieben sind.
   */
  azureUrl: string | null;
}

export interface TicketSaveResult {
  /** false = Wert war identisch, die Datei wurde nicht angefasst. */
  changed: boolean;
  revision: string;
}

/** Womit verglichen wird - siehe BaselineRef.java. */
export type BaselineRef = 'HEAD' | 'INDEX';

export interface TicketBaselineField {
  field: EditableField;
  /** Der Feldwert im Vergleichsstand. Leer, wenn es das Ticket dort nicht gab. */
  value: string;
}

/**
 * Der Stand der Felder im letzten Commit - Grundlage der Aenderungsmarkierung.
 *
 * available=false ist ein normaler Zustand (Datei unversioniert, kein
 * Repository, kein Commit), kein Fehler. Die Oberflaeche markiert dann nichts
 * und nennt reason als Erklaerung.
 */
export interface TicketBaseline {
  id: string;
  ref: BaselineRef;
  available: boolean;
  reason: string | null;
  fields: TicketBaselineField[];
}
