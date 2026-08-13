import type { KnownPerson, SubmitCandidate, SubmitDecision } from './submitTypes';

export type AzureBoardsCategory = 'main' | 'technical' | 'costs';

export interface IngestResult {
  success: boolean;
  log: string | null;
  error: string | null;
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
