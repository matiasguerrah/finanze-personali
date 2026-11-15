import { useEffect, useRef, useState } from 'react';
import { EllipsisVertical } from 'lucide-react';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** Desktop "⋮" menu. Closes on Esc, outside click or selection. */
export function RowMenu({ actions, label }: { actions: MenuAction[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2"
      >
        <EllipsisVertical size={18} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-44 overflow-hidden rounded-xl border border-line bg-bg py-1 shadow-lg"
        >
          {actions.map((a) => (
            <li key={a.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={`block min-h-11 w-full px-4 text-left text-sm hover:bg-surface ${
                  a.danger ? 'text-danger' : ''
                }`}
                onClick={() => {
                  setOpen(false);
                  a.onSelect();
                }}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
