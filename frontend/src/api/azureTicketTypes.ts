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

export interface TicketDocument extends TicketSummary {
  /** Der Rohwert, genau wie er in der Datei steht. */
  description: string;
  /** Opaker Aenderungsmarker der DATEI, unveraendert zurueckzugeben. */
  revision: string;
}

export interface TicketSaveResult {
  /** false = Wert war identisch, die Datei wurde nicht angefasst. */
  changed: boolean;
  revision: string;
}
