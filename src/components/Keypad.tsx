import { Delete } from 'lucide-react';

interface Props {
  onKey: (key: string) => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];

/** Numeric keypad emitting '0'-'9', ',' and 'back'. */
export function Keypad({ onKey }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tastierino">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          className="flex h-14 items-center justify-center rounded-xl bg-surface text-2xl font-medium tabular-nums active:bg-surface-2"
          aria-label={k === 'back' ? 'Cancella' : k === ',' ? 'Virgola' : k}
        >
          {k === 'back' ? <Delete size={24} aria-hidden="true" /> : k}
        </button>
      ))}
    </div>
  );
}
