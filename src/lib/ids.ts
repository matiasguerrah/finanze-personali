/**
 * UUID v4. `crypto.randomUUID` exists only in secure contexts (HTTPS or localhost): opening the dev
 * server from a phone on the LAN (http://192.168…) has only `crypto.getRandomValues`, which is
 * available everywhere and equally random.
 */
export function uuidV4(
  getRandomValues: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a),
): string {
  const b = getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newUuid(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uuidV4();
}
