import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { strFromU8, unzipSync } from 'fflate';
import { sheetName, toSheets } from './xlsx';
import type { ExportTable } from '../../lib/export';

describe('sheetName', () => {
  it('strips forbidden characters, truncates and de-duplicates', () => {
    const used = new Set<string>();
    expect(sheetName('Movimenti 01/11–30/11', used)).toBe('Movimenti 01 11–30 11');
    expect(sheetName('x'.repeat(40), used)).toHaveLength(31);
    expect(sheetName('Dati', used)).toBe('Dati');
    expect(sheetName('dati', used)).toBe('dati 2');
  });
});

describe('real .xlsx output', () => {
  it('writes numbers, dates on the right day and bold headers', async () => {
    const table: ExportTable = {
      name: 'Movimenti',
      header: ['Data', 'Importo (€)', 'Quota'],
      rows: [
        [
          { kind: 'date', iso: '2026-11-16' },
          { kind: 'money', cents: -1234 },
          { kind: 'percentBp', bp: 2550 },
        ],
      ],
    };
    const buf = await writeXlsxFile(toSheets([table]) as never).toBuffer();
    const files = unzipSync(new Uint8Array(buf));
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']!);
    // 16 Nov 2026 = Excel serial 46342.
    expect(xml).toContain('<v>46342</v>');
    expect(xml).toContain('<v>-12.34</v>');
    expect(xml).toContain('<v>0.255</v>');
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('name="Movimenti"');
  });
});
