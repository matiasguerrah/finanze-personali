import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ToastContext, type ToastInput } from './toast';

const toneClass = {
  neutral: 'bg-fg text-bg',
  success: 'bg-fg text-bg',
  warn: 'bg-warn text-bg',
  danger: 'bg-danger text-bg',
};

/** At most this many toasts are visible; older ones are dropped first. */
const MAX_VISIBLE = 3;

type Item = ToastInput & { key: number };

/**
 * Toasts stack instead of replacing each other, so a budget alert raised by a new transaction
 * does not hide that transaction's "Annulla".
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Item[]>([]);
  const timers = useRef(new Map<number, number>());
  const seq = useRef(0);

  const dismiss = useCallback((key: number) => {
    window.clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    setToasts((list) => list.filter((t) => t.key !== key));
  }, []);

  const show = useCallback(
    (t: ToastInput) => {
      const key = ++seq.current;
      setToasts((list) => [...list, { ...t, key }].slice(-MAX_VISIBLE));
      timers.current.set(
        key,
        window.setTimeout(() => dismiss(key), t.durationMs ?? 4000),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((id) => window.clearTimeout(id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-28"
      >
        {toasts.map((toast) => (
          <div
            key={toast.key}
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${toneClass[toast.tone ?? 'neutral']}`}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-lg px-2 font-semibold underline underline-offset-2"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.key);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
