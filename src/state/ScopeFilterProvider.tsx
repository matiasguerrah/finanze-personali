import { type ReactNode, useCallback, useState } from 'react';
import type { ScopeFilter } from '../db/types';
import { ScopeFilterContext } from './scopeFilter';

const KEY = 'conti.scopeFilter';

function load(): ScopeFilter {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'personal' || v === 'business' || v === 'all') return v;
  } catch {
    /* storage unavailable */
  }
  return 'all';
}

export function ScopeFilterProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<ScopeFilter>(load);
  const setScope = useCallback((s: ScopeFilter) => {
    setScopeState(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {
      /* storage unavailable */
    }
  }, []);
  return (
    <ScopeFilterContext.Provider value={{ scope, setScope }}>
      {children}
    </ScopeFilterContext.Provider>
  );
}
