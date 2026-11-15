import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ToastContext, type ToastInput } from './toast';

const toneClass = {
  neutral: 'bg-fg text-bg',
  success: 'bg-fg text-bg',
  warn: 'bg-warn text-bg',
  danger: 'bg-danger text-bg',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { key: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((t: ToastInput) => {
    window.clearTimeout(timer.current);
    setToast({ ...t, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), t.durationMs ?? 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-28"
      >
        {toast && (
          <div
            key={toast.key}
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${toneClass[toast.tone ?? 'neutral']}`}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="min-h-11 rounded-lg px-2 font-semibold underline underline-offset-2"
                onClick={() => {
                  toast.action?.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
