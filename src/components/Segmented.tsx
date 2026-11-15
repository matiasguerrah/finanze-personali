import type { ReactNode } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Accessible segmented control (radio group semantics). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  className = '',
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex rounded-xl bg-surface-2 p-1 ${className}`}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 font-medium transition-colors ${
              size === 'sm' ? 'text-sm' : 'text-base'
            } ${selected ? 'bg-raised text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
