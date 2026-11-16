import { createContext, useContext } from 'react';
import type { Transaction, TxType } from '../db/types';

export type EntryRequest =
  | {
      mode: 'new';
      type: TxType;
      categoryId?: string;
      /** Prefill for "Registra rata" on the Debiti page. */
      debtId?: string;
      amountCents?: number;
    }
  | { mode: 'edit'; tx: Transaction };

/** Opens the quick-entry sheet from anywhere (FAB, Home grid, transaction list). */
export const EntryContext = createContext<(r: EntryRequest) => void>(() => {});
export const useOpenEntry = () => useContext(EntryContext);
