import type {
  LineValidation,
  NoteDayRequest,
  NoteDayResponse,
  ValidateRequest,
} from './types';

export async function getNote(date: string): Promise<NoteDayResponse> {
  const res = await fetch(`/api/notes/${date}`);
  if (!res.ok) throw new Error(`GET /api/notes/${date} failed: ${res.status}`);
  return res.json();
}

export async function saveNote(date: string, content: string): Promise<void> {
  const res = await fetch(`/api/notes/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content } satisfies NoteDayRequest),
  });
  if (!res.ok) throw new Error(`PUT /api/notes/${date} failed: ${res.status}`);
}

export async function validateNote(content: string): Promise<LineValidation[]> {
  const res = await fetch('/api/notes/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content } satisfies ValidateRequest),
  });
  if (!res.ok) throw new Error(`POST /api/notes/validate failed: ${res.status}`);
  return res.json();
}
