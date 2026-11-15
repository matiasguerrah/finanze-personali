import { type ReactNode, useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccounts, useActivities, useCategories } from '../db/hooks';
import { getSetting } from '../db/repo';
import { EntrySheet } from '../features/quick-entry/EntrySheet';
import { EntryContext, type EntryRequest } from './entry';

export function EntryProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<(EntryRequest & { key: number }) | null>(null);
  const open = useCallback((r: EntryRequest) => setReq({ ...r, key: Date.now() }), []);
  // Kept subscribed for the whole session so the sheet opens instantly with complete data.
  const categories = useCategories();
  const accounts = useAccounts();
  const activities = useActivities();
  const lastAccountId = useLiveQuery(() => getSetting<string>('lastAccountId', ''), []);
  const ready = categories.length > 0 && accounts.length > 0 && lastAccountId !== undefined;

  return (
    <EntryContext.Provider value={open}>
      {children}
      {/* key: every opening starts from a fresh state */}
      {req && ready && (
        <EntrySheet
          key={req.key}
          request={req}
          data={{ categories, accounts, activities, lastAccountId }}
          onClose={() => setReq(null)}
        />
      )}
    </EntryContext.Provider>
  );
}
