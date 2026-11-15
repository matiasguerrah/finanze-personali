import { colorHex } from '../lib/palette';
import { iconFor } from './icons';

interface Props {
  icon: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14' };
const iconSizes = { sm: 18, md: 22, lg: 28 };

export function CategoryIcon({ icon, color, size = 'md' }: Props) {
  const Icon = iconFor(icon);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${sizes[size]}`}
      style={{ backgroundColor: colorHex(color) }}
    >
      <Icon size={iconSizes[size]} strokeWidth={2} />
    </span>
  );
}
