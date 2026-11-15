import { type ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Hide the visual title but keep it for screen readers. */
  hideTitle?: boolean;
}

/**
 * Modal built on <dialog>: native focus trap, Esc to close, inert background.
 * Bottom sheet on mobile, centred dialog on desktop.
 */
export function Sheet({ open, onClose, title, children, hideTitle }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on backdrop
      }}
      className="m-0 mt-auto max-h-[100dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-bg p-0 text-fg md:m-auto md:max-w-lg md:rounded-2xl"
    >
      {open && (
        <div className="flex flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-2">
            <h2 className={hideTitle ? 'sr-only' : 'text-lg font-semibold'}>{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface"
              aria-label="Chiudi"
            >
              <X size={22} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
