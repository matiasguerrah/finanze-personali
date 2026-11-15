import type { Category, CategoryType, ScopeFilter } from '../../db/types';
import { CategoryIcon } from '../../components/CategoryIcon';

interface Props {
  categories: Category[];
  type: CategoryType;
  scope: ScopeFilter;
  onPick: (c: Category) => void;
  selectedId?: string;
}

/** Big, tappable category tiles (Monefy style), split into Personali / Lavoro when needed. */
export function CategoryGrid({ categories, type, scope, onPick, selectedId }: Props) {
  const visible = categories.filter((c) => c.type === type && !c.archived);
  const sections = (['personal', 'business'] as const)
    .filter((s) => scope === 'all' || scope === s)
    .map((s) => ({ scope: s, items: visible.filter((c) => c.defaultScope === s) }))
    .filter((s) => s.items.length > 0);
  const showHeadings = sections.length > 1;

  if (visible.length === 0)
    return <p className="py-8 text-center text-muted">Nessuna categoria disponibile.</p>;

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <section
          key={section.scope}
          aria-label={section.scope === 'personal' ? 'Personali' : 'Lavoro'}
        >
          {showHeadings && (
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              {section.scope === 'personal' ? 'Personali' : 'Lavoro'}
            </h3>
          )}
          <ul className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-5 lg:grid-cols-6">
            {section.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  aria-pressed={selectedId ? selectedId === c.id : undefined}
                  className={`flex w-full flex-col items-center gap-1.5 rounded-xl p-1 text-center hover:bg-surface ${
                    selectedId === c.id ? 'bg-surface-2' : ''
                  }`}
                >
                  <CategoryIcon icon={c.icon} color={c.color} size="lg" />
                  <span className="line-clamp-2 text-xs leading-tight">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
