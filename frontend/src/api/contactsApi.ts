export async function getContacts(): Promise<string[]> {
  const res = await fetch('/api/contacts');
  if (!res.ok) throw new Error(`GET /api/contacts failed: ${res.status}`);
  return res.json();
}
