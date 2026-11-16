/**
 * ExportTable → .xlsx sheets for write-excel-file. Money becomes a real number with 2 decimals,
 * dates real Excel dates (UTC midnight: the library converts with getTime(), so the day never
 * shifts with the device time zone), percentages real percentages.
 */
import type { Cell as XCell, Sheet, SheetData } from 'write-excel-file/browser';
import type { Cell, ExportTable } from '../../lib/export';

function cell(c: Cell | undefined, bold: boolean): XCell {
  const style = bold ? { fontWeight: 'bold' as const } : {};
  if (!c) return null;
  switch (c.kind) {
    case 'text':
      return { value: c.value, type: String, ...style };
    case 'money':
      return { value: c.cents / 100, type: Number, format: '#,##0.00', ...style };
    case 'int':
      return { value: c.value, type: Number, ...style };
    case 'percentBp':
      return { value: c.bp / 10_000, type: Number, format: '0.00%', ...style };
    case 'date': {
      const [y, m, d] = c.iso.split('-').map(Number) as [number, number, number];
      return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: 'dd/mm/yyyy', ...style };
    }
  }
}

/** Excel sheet names: max 31 chars, no []:*?/\ ; unique within the workbook. */
export function sheetName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/[[\]:*?/\\]/g, ' ')
      .slice(0, 31)
      .trim() || 'Foglio';
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++)
    n = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

export function toSheets(tables: readonly ExportTable[]): Sheet<Blob>[] {
  const used = new Set<string>();
  return tables.map((t) => {
    const bold = new Set(t.boldRows ?? []);
    const data: SheetData = [
      t.header.map((h) => ({ value: h, type: String, fontWeight: 'bold' as const })),
      ...t.rows.map((r, i) => r.map((c) => cell(c, bold.has(i)))),
    ];
    const widths = t.header.map((h, col) =>
      Math.min(
        50,
        Math.max(
          8,
          h.length + 2,
          ...t.rows.slice(0, 500).map((r) => {
            const c = r[col];
            return c?.kind === 'text' ? c.value.length + 2 : 12;
          }),
        ),
      ),
    );
    return {
      data,
      sheet: sheetName(t.name, used),
      columns: widths.map((width) => ({ width })),
      stickyRowsCount: 1,
    };
  });
}

/** Builds the workbook in the browser (library loaded on demand) and starts the download. */
export async function downloadXlsx(tables: readonly ExportTable[], fileName: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(toSheets(tables)).toFile(fileName);
}
