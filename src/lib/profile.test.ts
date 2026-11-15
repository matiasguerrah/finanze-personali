import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  isValidTaxCode,
  isValidVatNumber,
  normalizeProfile,
  normalizeVat,
  validateProfile,
} from './profile';

describe('partita IVA', () => {
  it('accepts valid check digits', () => {
    expect(isValidVatNumber('01234567897')).toBe(true);
    expect(isValidVatNumber('12345678903')).toBe(true);
    expect(isValidVatNumber('00743110157')).toBe(true);
  });
  it('rejects wrong check digit or format', () => {
    expect(isValidVatNumber('01234567890')).toBe(false);
    expect(isValidVatNumber('1234567890')).toBe(false);
    expect(isValidVatNumber('0123456789A')).toBe(false);
  });
  it('normalises the IT prefix and spaces', () => {
    expect(normalizeVat(' it 012 345 67897 ')).toBe('01234567897');
  });
});

describe('codice fiscale', () => {
  it('accepts valid codes', () => {
    expect(isValidTaxCode('RSSMRA85T10A562S')).toBe(true);
    expect(isValidTaxCode('BNCLRA90A41H501F')).toBe(true);
    expect(isValidTaxCode('VRDGPP80M01F205O')).toBe(true);
  });
  it('rejects a wrong check letter or a malformed code', () => {
    expect(isValidTaxCode('RSSMRA85T10A562X')).toBe(false);
    expect(isValidTaxCode('RSSMRA85Z10A562S')).toBe(false); // Z is not a month letter
    expect(isValidTaxCode('RSSMRA85T10A562')).toBe(false);
  });
  it('accepts an 11-digit numeric code validated like a partita IVA', () => {
    expect(isValidTaxCode('01234567897')).toBe(true);
    expect(isValidTaxCode('01234567890')).toBe(false);
  });
});

describe('PEC', () => {
  it('checks the address shape', () => {
    expect(isValidEmail('mario.rossi@pec.example.it')).toBe(true);
    expect(isValidEmail('mario@pec')).toBe(false);
    expect(isValidEmail('mario pec.example.it')).toBe(false);
  });
});

describe('profile', () => {
  it('normalises and allows empty fields', () => {
    const p = normalizeProfile({
      firstName: ' Mario ',
      lastName: 'Rossi',
      vatNumber: 'IT 01234567897',
      taxCode: 'rssmra85t10a562s',
      pec: ' Mario.Rossi@PEC.example.it ',
    });
    expect(p).toEqual({
      firstName: 'Mario',
      lastName: 'Rossi',
      vatNumber: '01234567897',
      taxCode: 'RSSMRA85T10A562S',
      pec: 'mario.rossi@pec.example.it',
    });
    expect(validateProfile(p)).toEqual([]);
    expect(
      validateProfile({ firstName: '', lastName: '', vatNumber: '', taxCode: '', pec: '' }),
    ).toEqual([]);
  });
  it('reports each invalid field', () => {
    expect(
      validateProfile({
        firstName: '',
        lastName: '',
        vatNumber: '01234567890',
        taxCode: 'RSSMRA85T10A562X',
        pec: 'nope',
      }),
    ).toEqual(['vatNumber', 'taxCode', 'pec']);
  });
});
