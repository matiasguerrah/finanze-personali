/**
 * The single colour palette for categories and accounts. All tones keep ≥ 4.5:1 contrast with a
 * white icon, so the same swatch works in light and dark theme.
 */
export const PALETTE = [
  { key: 'teal', hex: '#0f766e', label: 'Verde acqua' },
  { key: 'cyan', hex: '#0e7490', label: 'Ciano' },
  { key: 'blue', hex: '#1d4ed8', label: 'Blu' },
  { key: 'indigo', hex: '#4338ca', label: 'Indaco' },
  { key: 'violet', hex: '#6d28d9', label: 'Viola' },
  { key: 'pink', hex: '#be185d', label: 'Rosa' },
  { key: 'red', hex: '#b91c1c', label: 'Rosso' },
  { key: 'orange', hex: '#c2410c', label: 'Arancione' },
  { key: 'amber', hex: '#b45309', label: 'Ambra' },
  { key: 'lime', hex: '#4d7c0f', label: 'Lime' },
  { key: 'green', hex: '#15803d', label: 'Verde' },
  { key: 'slate', hex: '#475569', label: 'Ardesia' },
] as const;

export type PaletteKey = (typeof PALETTE)[number]['key'];

export function colorHex(key: string): string {
  return PALETTE.find((p) => p.key === key)?.hex ?? '#475569';
}
