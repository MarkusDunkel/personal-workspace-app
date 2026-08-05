import { getMeetings } from '../api/listsApi';
import { useSuggestionList } from './useSuggestionList';

export function useMeetings(reloadToken: number = 0): string[] {
  return useSuggestionList(getMeetings, reloadToken);
}
