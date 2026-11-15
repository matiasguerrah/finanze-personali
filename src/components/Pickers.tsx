import { PALETTE, colorHex } from '../lib/palette';
import { ICON_NAMES, iconFor } from './icons';

/** Colour swatches from the single app palette (radio group). */
export function ColorPicker({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm text-muted">Colore</legend>
      <div role="radiogroup" aria-label="Colore" className="flex flex-wrap gap-1">
        {PALETTE.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={value === p.key}
            aria-label={p.label}
            title={p.label}
            onClick={() => onChange(p.key)}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${
              value === p.key ? 'ring-2 ring-fg ring-offset-2 ring-offset-bg' : ''
            }`}
          >
            <span className="h-8 w-8 rounded-full" style={{ backgroundColor: p.hex }} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Icons from the curated registry, drawn in the selected colour. */
export function IconPicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (name: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm text-muted">Icona</legend>
      <div
        role="radiogroup"
        aria-label="Icona"
        className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto rounded-xl bg-surface p-1 sm:grid-cols-8"
      >
        {ICON_NAMES.map((name) => {
          const Icon = iconFor(name);
          const selected = value === name;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name}
              title={name}
              onClick={() => onChange(name)}
              className={`inline-flex h-11 items-center justify-center rounded-lg ${
                selected ? 'text-white' : 'text-fg hover:bg-surface-2'
              }`}
              style={selected ? { backgroundColor: colorHex(color) } : undefined}
            >
              <Icon size={20} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
