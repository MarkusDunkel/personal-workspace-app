export interface SubmitCandidate {
  value: string;
  type: 'person' | 'email';
  context: string;
  suggestedPseudonym: string;
  // Fundstelle aus review.csv - nur fuer action="alias_of_position"
  // gebraucht (positionsgenaue Ersetzung, siehe SubmitDecision).
  file: string;
  startChar: number;
  endChar: number;
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

export type DecisionAction = 'accept' | 'alias_of' | 'alias_of_once' | 'alias_of_position' | 'ignore';

export interface SubmitDecision {
  value: string;
  type: 'person' | 'email';
  action: DecisionAction;
  aliasTarget?: string;
  // Vom Nutzer bereinigter Wert (z.B. Name ohne angehaengtes NER-Rauschen
  // wie "Arne Nowak:\nWir" -> "Arne Nowak"), leer wenn keine Korrektur noetig war.
  resolvedValue?: string;
}

export interface SubmitResult {
  success: boolean;
  targetPath?: string;
  log?: string;
  error?: string;
}
