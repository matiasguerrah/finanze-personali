/**
 * Test-only: runs the real apps-script/Code.gs in a Node VM against an in-memory fake of the
 * Apps Script services, so sync can be tested end to end without Google.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

type Cell = string | number | boolean;

class FakeSheet {
  cells: Cell[][] = [];
  maxRows = 1000;
  maxCols = 26;
  constructor(public name: string) {}
  getLastRow() {
    let last = 0;
    this.cells.forEach((r, i) => {
      if (r.some((c) => c !== '' && c !== undefined)) last = i + 1;
    });
    return last;
  }
  getLastColumn() {
    let last = 0;
    for (const r of this.cells)
      r.forEach((c, j) => {
        if (c !== '' && c !== undefined) last = Math.max(last, j + 1);
      });
    return last;
  }
  getMaxRows() {
    return this.maxRows;
  }
  getMaxColumns() {
    return this.maxCols;
  }
  insertColumnsAfter(_after: number, n: number) {
    this.maxCols += n;
  }
  insertRowsAfter(_after: number, n: number) {
    this.maxRows += n;
  }
  setFrozenRows() {}
  getRange(row: number, col: number, nRows: number, nCols: number) {
    if (row + nRows - 1 > this.maxRows || col + nCols - 1 > this.maxCols)
      throw new Error('Range out of bounds');
    return {
      setNumberFormat: () => undefined,
      getValues: () =>
        Array.from({ length: nRows }, (_, i) =>
          Array.from({ length: nCols }, (_, j) => this.cells[row - 1 + i]?.[col - 1 + j] ?? ''),
        ),
      setValues: (values: Cell[][]) => {
        values.forEach((r, i) =>
          r.forEach((v, j) => {
            const line = (this.cells[row - 1 + i] ??= []);
            // Like Sheets: a leading apostrophe forces text and is not part of the value.
            line[col - 1 + j] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
          }),
        );
      },
    };
  }
  /** Rows as objects, for assertions. */
  objects(): Record<string, Cell>[] {
    const [header, ...rows] = this.cells;
    return rows.map((r) => Object.fromEntries((header ?? []).map((h, j) => [h, r[j] ?? ''])));
  }
}

export function createAppsScript() {
  const sheets = new Map<string, FakeSheet>();
  const props = new Map<string, string>();
  const spreadsheet = {
    setSpreadsheetTimeZone: () => undefined,
    getSheetByName: (n: string) => sheets.get(n) ?? null,
    insertSheet: (n: string) => {
      const s = new FakeSheet(n);
      sheets.set(n, s);
      return s;
    },
  };
  const mails: { to: string; subject: string; body: string }[] = [];
  const triggers: { handler: string; spec: string }[] = [];
  let now = new Date();
  const triggerBuilder = (handler: string) => {
    const parts: string[] = [];
    const b = {
      timeBased: () => b,
      everyHours: (n: number) => (parts.push(`every ${n}h`), b),
      everyDays: (n: number) => (parts.push(`every ${n}d`), b),
      atHour: (h: number) => (parts.push(`at ${h}`), b),
      create: () => {
        const t = { handler, spec: parts.join(' ') };
        triggers.push(t);
        return t;
      },
    };
    return b;
  };
  const context = vm.createContext({
    MailApp: {
      sendEmail: (to: string, subject: string, body: string) =>
        void mails.push({ to, subject, body }),
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    ScriptApp: {
      newTrigger: triggerBuilder,
      getProjectTriggers: () =>
        triggers.map((t) => ({ getHandlerFunction: () => t.handler, _t: t })),
      deleteTrigger: (x: { _t: (typeof triggers)[number] }) =>
        void triggers.splice(triggers.indexOf(x._t), 1),
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) ?? null,
        setProperty: (k: string, v: string) => void props.set(k, v),
      }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s: string) => ({ setMimeType: () => ({ content: s }) }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      // Only the pattern Code.gs uses ('yyyy-MM-dd'); the date is the fake clock (setNow).
      formatDate: (_d: Date, tz: string) => now.toLocaleDateString('sv-SE', { timeZone: tz }),
    },
    Logger: { log: () => undefined },
  });
  const path = fileURLToPath(new URL('../../apps-script/Code.gs', import.meta.url));
  vm.runInContext(readFileSync(path, 'utf8'), context);
  const g = context as Record<string, (...a: unknown[]) => unknown>;

  return {
    sheets,
    props,
    mails,
    triggers,
    /** Fixes "today" as seen by Code.gs alerts (todayRome_). */
    setNow: (d: Date) => {
      now = d;
    },
    /** Pure functions of Code.gs, for unit tests. */
    fn: g,
    setup: () => g.setup!() as string,
    /** Simulates an HTTP POST to the web app and returns the parsed JSON response. */
    post: (body: unknown): unknown => {
      const out = g.doPost!({ postData: { contents: JSON.stringify(body) } }) as {
        content: string;
      };
      return JSON.parse(out.content);
    },
  };
}
