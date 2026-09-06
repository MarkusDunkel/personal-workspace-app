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

/**
 * Pseudonym -> Klarname, fuer die LESBARE Anzeige von "Person_076".
 *
 * Nur diese Richtung gibt es; die Rueckersetzung bleibt serverseitig (siehe
 * PseudonymMapper). Kein string[] wie die uebrigen Listen, daher eigenes
 * fetch statt getList.
 */
export async function getPersonRegister(): Promise<Record<string, string>> {
  const res = await fetch('/api/person-register');
  if (!res.ok) throw new Error(`GET /api/person-register failed: ${res.status}`);
  return res.json();
}
