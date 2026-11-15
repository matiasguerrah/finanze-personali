/** Owner profile: normalisation and validation of Italian identifiers (pure). */
import type { Profile } from '../db/types';

/** Removes spaces and uppercases ("rss mra 85t10 a562s" → "RSSMRA85T10A562S"). */
export function normalizeCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** "IT01234567897" or "01234567897" → "01234567897". */
export function normalizeVat(input: string): string {
  return normalizeCode(input).replace(/^IT/, '');
}

/** Partita IVA: 11 digits, the last one is a Luhn-style check digit. */
export function isValidVatNumber(vat: string): boolean {
  if (!/^\d{11}$/.test(vat)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(vat[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(vat[10]);
}

// Values of characters in odd positions (1st, 3rd, …) for the codice fiscale check letter.
const ODD: Record<string, number> = {};
'0123456789'.split('').forEach((c, i) => {
  ODD[c] = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21][i]!;
});
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => {
  ODD[c] = [
    1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23,
  ][i]!;
});
const evenValue = (c: string) => (/\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65);

/**
 * Codice fiscale of a person (16 chars, omocodia letters allowed) with a valid check letter.
 * An 11-digit code (companies, or a sole trader's numeric code) is validated like a partita IVA.
 */
export function isValidTaxCode(cf: string): boolean {
  if (/^\d{11}$/.test(cf)) return isValidVatNumber(cf);
  if (
    !/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(
      cf,
    )
  )
    return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf[i]!;
    sum += i % 2 === 0 ? ODD[c]! : evenValue(c);
  }
  return String.fromCharCode(65 + (sum % 26)) === cf[15];
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export type ProfileFields = Pick<
  Profile,
  'firstName' | 'lastName' | 'vatNumber' | 'taxCode' | 'pec'
>;

/** Normalises user input; every field is optional (empty string = not set). */
export function normalizeProfile(p: ProfileFields): ProfileFields {
  return {
    firstName: p.firstName.trim(),
    lastName: p.lastName.trim(),
    vatNumber: normalizeVat(p.vatNumber),
    taxCode: normalizeCode(p.taxCode),
    pec: p.pec.trim().toLowerCase(),
  };
}

export type ProfileError = 'vatNumber' | 'taxCode' | 'pec';

/** Validates a normalised profile; empty fields are allowed. */
export function validateProfile(p: ProfileFields): ProfileError[] {
  const errors: ProfileError[] = [];
  if (p.vatNumber && !isValidVatNumber(p.vatNumber)) errors.push('vatNumber');
  if (p.taxCode && !isValidTaxCode(p.taxCode)) errors.push('taxCode');
  if (p.pec && !isValidEmail(p.pec)) errors.push('pec');
  return errors;
}
