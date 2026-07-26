// Mirrors at.anlagenbauaustria.aiapp.notes.model.Warning
export interface Warning {
  code: string;
  message: string;
}

// Mirrors at.anlagenbauaustria.aiapp.notes.LineValidation
export interface LineValidation {
  lineIndex: number;
  blank: boolean;
  error: string | null;
  warnings: Warning[];
}

// Mirrors at.anlagenbauaustria.aiapp.notes.model.NoteType
export type NoteType =
  | 'INFO'
  | 'TASK'
  | 'TASK_ME'
  | 'TASK_DELEGATE'
  | 'DECISION'
  | 'QUESTION'
  | 'RISK'
  | 'BLOCKER'
  | 'FOLLOWUP';

// Mirrors at.anlagenbauaustria.aiapp.notes.model.Priority
export type Priority = 'HOCH' | 'NORMAL' | 'NIEDRIG';

// Mirrors at.anlagenbauaustria.aiapp.notes.model.Note
// (currently backend-internal only; not serialized by any endpoint today)
export interface Note {
  type: NoteType;
  source: string | null;
  sourceForced: boolean;
  text: string;
  due: string | null;
  dueRaw: string | null;
  priority: Priority | null;
  project: string | null;
  assignee: string | null;
  tags: string[];
  confidential: boolean;
  done: boolean;
  fileRef: string | null;
  warnings: Warning[];
  linkedFollowUp: Note | null;
}

// Mirrors at.anlagenbauaustria.aiapp.notes.model.ParseResult
// (currently backend-internal only)
export interface ParseResult {
  notes: Note[];
  error: string | null;
}

// NoteController: GET /api/notes/{date} response
export interface NoteDayResponse {
  date: string;
  content: string;
}

// NoteController: PUT /api/notes/{date} request
export interface NoteDayRequest {
  content: string;
}

// NoteController: POST /api/notes/validate request
export interface ValidateRequest {
  content: string;
}
