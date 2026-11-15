import { Briefcase } from 'lucide-react';

/** Small "Lavoro" marker shown next to every business transaction. */
export function BusinessBadge() {
  return (
    <span className="inline-flex items-center text-business" title="Lavoro">
      <Briefcase size={14} aria-hidden="true" />
      <span className="sr-only">Lavoro</span>
    </span>
  );
}
