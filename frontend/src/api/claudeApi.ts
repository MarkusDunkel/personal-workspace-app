export const IMPROVE_READABILITY_PROMPT_ID = 'improve-readability';

export async function improveCellText(
  promptId: string,
  text: string,
  context?: { projekt?: string | null; meeting?: string | null },
): Promise<string> {
  const res = await fetch('/api/claude/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptId, text, projekt: context?.projekt, meeting: context?.meeting }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `POST /api/claude/improve failed: ${res.status}`);
  }
  const data = await res.json();
  return data.improvedText;
}
