import { useEffect, useState } from 'react';
import { getContacts } from '../api/contactsApi';

export function useContacts(): string[] {
  const [contacts, setContacts] = useState<string[]>([]);

  useEffect(() => {
    getContacts()
      .then(setContacts)
      .catch(() => setContacts([]));
  }, []);

  return contacts;
}
