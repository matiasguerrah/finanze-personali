import { createContext, useContext } from 'react';

export type ToastTone = 'neutral' | 'success' | 'warn' | 'danger';

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

export const ToastContext = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(ToastContext);
