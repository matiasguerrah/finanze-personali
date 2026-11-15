import { createContext, useContext } from 'react';
import type { ScopeFilter } from '../db/types';

export interface ScopeFilterState {
  scope: ScopeFilter;
  setScope: (s: ScopeFilter) => void;
}

export const ScopeFilterContext = createContext<ScopeFilterState>({
  scope: 'all',
  setScope: () => {},
});

export const useScopeFilter = () => useContext(ScopeFilterContext);

export function matchesScope(recordScope: string, filter: ScopeFilter): boolean {
  return filter === 'all' || recordScope === filter;
}
