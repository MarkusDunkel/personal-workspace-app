export interface SubmitCandidate {
  value: string;
  type: 'person' | 'email';
  context: string;
  suggestedPseudonym: string;
}

export interface KnownPerson {
  canonicalValue: string;
  pseudonym: string;
}

export interface SubmitStartResponse {
  reviewToken: string | null;
  candidates: SubmitCandidate[];
  knownPersons: KnownPerson[];
}

export type DecisionAction = 'accept' | 'alias_of' | 'ignore';

export interface SubmitDecision {
  value: string;
  type: 'person' | 'email';
  action: DecisionAction;
  aliasTarget?: string;
}

export interface SubmitResult {
  success: boolean;
  targetPath?: string;
  log?: string;
  error?: string;
}
