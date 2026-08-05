import { getProjekte } from '../api/listsApi';
import { useSuggestionList } from './useSuggestionList';

export function useProjekte(reloadToken: number = 0): string[] {
  return useSuggestionList(getProjekte, reloadToken);
}
