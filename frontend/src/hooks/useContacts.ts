import { getContacts } from '../api/listsApi';
import { useSuggestionList } from './useSuggestionList';

export function useContacts(reloadToken: number = 0): string[] {
  return useSuggestionList(getContacts, reloadToken);
}
