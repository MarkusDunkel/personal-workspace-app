async function getList(path: string): Promise<string[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export function getContacts(): Promise<string[]> {
  return getList('/api/contacts');
}

export function getProjekte(): Promise<string[]> {
  return getList('/api/projekte');
}

export function getMeetings(): Promise<string[]> {
  return getList('/api/meetings');
}
