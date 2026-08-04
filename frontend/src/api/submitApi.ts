import type { SubmitDecision, SubmitResult, SubmitStartResponse } from './submitTypes';

export async function startSubmit(): Promise<SubmitStartResponse> {
  const res = await fetch('/api/notes/submit', { method: 'POST' });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `POST /api/notes/submit failed: ${res.status}`);
  return body;
}

export async function sendDecisions(
  reviewToken: string | null,
  decisions: SubmitDecision[],
): Promise<SubmitResult> {
  const res = await fetch('/api/notes/submit/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewToken, decisions }),
  });
  const body: SubmitResult = await res.json();
  return body;
}
