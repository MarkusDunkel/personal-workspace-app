import type { KnownPerson, SubmitCandidate, SubmitDecision } from './submitTypes';

export type AzureBoardsCategory = 'main' | 'technical' | 'costs';

export interface IngestResult {
  success: boolean;
  log: string | null;
  error: string | null;
  // Gesetzt, wenn der 3-Wege-Merge Konflikte gemeldet hat (run_merge.sh Exit 5).
  // Kein Fehler: das Ergebnis ist geschrieben, aber die betroffenen Items
  // tragen einen '_conflicts'-Schluessel und run_import.sh verweigert die
  // Planung, solange der stehen bleibt.
  warning: string | null;
  conflictFiles: string[];
}

// SubmitCandidate/KnownPerson/SubmitDecision werden von submitTypes.ts
// wiederverwendet (identisches Format wie beim Notizen-Absenden-Flow, siehe
// pipelines/pseudonymize/core/review.py in ai-vault) - kein Duplikat noetig.
export interface IngestScanResponse {
  reviewToken: string | null;
  candidates: SubmitCandidate[];
  knownPersons: KnownPerson[];
  log: string;
}

export type { SubmitCandidate, KnownPerson, SubmitDecision };

export interface DigestPlanResponse {
  planToken: string;
  planMarkdown: string;
  log: string;
}

export interface DigestApplyResult {
  success: boolean;
  comparisonPath: string | null;
  log: string | null;
  error: string | null;
}
