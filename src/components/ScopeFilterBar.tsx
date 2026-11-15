import { useScopeFilter } from '../state/scopeFilter';
import { Segmented } from './Segmented';
import type { ScopeFilter } from '../db/types';

const OPTIONS: { value: ScopeFilter; label: string }[] = [
  { value: 'all', label: 'Tutto' },
  { value: 'personal', label: 'Personale' },
  { value: 'business', label: 'Lavoro' },
];

export function ScopeFilterBar({ className = '' }: { className?: string }) {
  const { scope, setScope } = useScopeFilter();
  return (
    <Segmented
      label="Ambito"
      size="sm"
      value={scope}
      options={OPTIONS}
      onChange={setScope}
      className={className}
    />
  );
}
