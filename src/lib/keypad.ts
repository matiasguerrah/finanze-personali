/** Applies a keypad key to an amount string ("12,5"), allowing at most 2 decimals. */
export function applyKey(current: string, key: string): string {
  if (key === 'back') return current.slice(0, -1);
  if (key === ',') return current.includes(',') ? current : (current || '0') + ',';
  const [, dec] = current.split(',');
  if (dec !== undefined && dec.length >= 2) return current;
  if (current === '0') return key;
  if (current.replace(',', '').length >= 9) return current; // max 9.999.999,99
  return current + key;
}
