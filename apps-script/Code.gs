/**
 * Conti — sync backend. Bind this script to the Google Sheet (Estensioni › Apps Script) and deploy
 * it as a web app (Esegui come: me · Chi ha accesso: chiunque). See README › Sincronizzazione.
 *
 * Protocol (POST, body = JSON as text/plain, every response is JSON with `ok`):
 *   {action:'ping', key}                       → {ok, serverTime}
 *   {action:'push', key, tables:{t:{columns, rows}}} → {ok, serverTime, written, conflicts:{t:[rows]}}
 *   {action:'pull', key, since}                → {ok, serverTime, tables:{t:[rows]}}
 *
 * One tab per table, row 1 = column names, all cells plain text. Columns are added automatically
 * when the app sends new ones. Every written row gets `_serverUpdatedAt`, a strictly increasing
 * server timestamp: pull returns rows with `_serverUpdatedAt > since`.
 * Conflicts are last-write-wins on the client's `updatedAt`.
 *
 * The pure functions (no Spreadsheet/Properties calls) are unit-tested by the app's test suite
 * (src/lib/sync/server.test.ts), which runs this very file.
 */

var TABLES = [
  'transactions',
  'activities',
  'categories',
  'accounts',
  'budgets',
  'recurring',
  'debts',
  'taxParams',
  'profile',
];
var SERVER_COL = '_serverUpdatedAt';
var KEY_PROP = 'SYNC_KEY';
var STAMP_PROP = 'LAST_STAMP';

// ---------------------------------------------------------------- entry points

/** Run once from the editor: creates the tabs and the secret key (shown in the log). */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Europe/Rome');
  TABLES.forEach(function (t) {
    getOrCreateSheet_(ss, t);
  });
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty(KEY_PROP);
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty(KEY_PROP, key);
  }
  Logger.log('Chiave segreta da incollare in Conti › Sincronizzazione:\n' + key);
  return key;
}

/** Opening the web app URL in a browser shows that it is deployed. */
function doGet() {
  return json_({ ok: true, app: 'conti-sync' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  var expected = PropertiesService.getScriptProperties().getProperty(KEY_PROP);
  if (!expected) return json_({ ok: false, error: 'not_setup' });
  if (!req || req.key !== expected) return json_({ ok: false, error: 'unauthorized' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (req.action === 'ping') return json_({ ok: true, serverTime: lastStamp_() });
    if (req.action === 'push') return json_(handlePush_(ss, req));
    if (req.action === 'pull') return json_(handlePull_(ss, req));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- handlers (Sheet I/O)

function handlePush_(ss, req) {
  var stamp = nextStamp_();
  var written = 0;
  var conflicts = {};
  var tables = req.tables || {};
  Object.keys(tables).forEach(function (t) {
    if (TABLES.indexOf(t) < 0) throw new Error('unknown table ' + t);
    var sheet = getOrCreateSheet_(ss, t);
    var values = readValues_(sheet);
    var result = applyPush(values, tables[t].columns || [], tables[t].rows || [], stamp);
    writeValues_(sheet, values.length ? values[0].length : 0, result.values);
    written += result.written;
    if (result.conflicts.length) conflicts[t] = result.conflicts;
  });
  return { ok: true, serverTime: stamp, written: written, conflicts: conflicts };
}

function handlePull_(ss, req) {
  var since = String(req.since || '');
  var tables = {};
  TABLES.forEach(function (t) {
    var sheet = ss.getSheetByName(t);
    if (!sheet) return;
    var rows = rowsChangedSince(readValues_(sheet), since);
    if (rows.length) tables[t] = rows;
  });
  return { ok: true, serverTime: lastStamp_(), tables: tables };
}

function getOrCreateSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  // Plain text everywhere: dates and ATECO codes must not be turned into dates/numbers.
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setNumberFormat('@');
  sheet.setFrozenRows(1);
  return sheet;
}

function readValues_(sheet) {
  var rows = sheet.getLastRow();
  var cols = sheet.getLastColumn();
  if (rows === 0 || cols === 0) return [];
  return sheet
    .getRange(1, 1, rows, cols)
    .getValues()
    .map(function (r) {
      return r.map(cellToString);
    });
}

function writeValues_(sheet, oldCols, values) {
  if (!values.length) return;
  var cols = values[0].length;
  if (cols > sheet.getMaxColumns())
    sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
  if (values.length > sheet.getMaxRows())
    sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  var range = sheet.getRange(1, 1, values.length, cols);
  range.setNumberFormat('@');
  range.setValues(
    values.map(function (r) {
      return r.map(protectCell);
    }),
  );
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ---------------------------------------------------------------- timestamps

function lastStamp_() {
  return PropertiesService.getScriptProperties().getProperty(STAMP_PROP) || '';
}

/** A server timestamp strictly greater than every previous one (one per push). */
function nextStamp_() {
  var stamp = nextStampAfter(lastStamp_(), new Date());
  PropertiesService.getScriptProperties().setProperty(STAMP_PROP, stamp);
  return stamp;
}

// ---------------------------------------------------------------- pure functions (tested)

function nextStampAfter(last, now) {
  var t = now.getTime();
  if (last) t = Math.max(t, new Date(last).getTime() + 1);
  return new Date(t).toISOString();
}

/** Sheets may return booleans/numbers/dates for cells edited by hand: normalise to text. */
function cellToString(v) {
  if (v === null || v === undefined) return '';
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  var s = String(v);
  return s.charAt(0) === "'" ? s.slice(1) : s;
}

/** A note starting with "=" would become a formula: store it as literal text. */
function protectCell(s) {
  return typeof s === 'string' && s.charAt(0) === '=' ? "'" + s : s;
}

/**
 * Upserts rows into a table held as a 2D array (row 0 = header). Adds missing columns.
 * A row is written when it is new or its updatedAt is ≥ the stored one; otherwise the stored row
 * is returned as a conflict. Mutates nothing: returns the new 2D array.
 */
function applyPush(values, columns, rows, stamp) {
  var header = values.length ? values[0].slice() : [];
  columns.concat(['id', 'updatedAt', SERVER_COL]).forEach(function (c) {
    if (header.indexOf(c) < 0) header.push(c);
  });
  var width = header.length;
  var out = [header];
  for (var i = 1; i < values.length; i++) {
    var r = values[i].slice();
    while (r.length < width) r.push('');
    out.push(r);
  }
  var idCol = header.indexOf('id');
  var updCol = header.indexOf('updatedAt');
  var srvCol = header.indexOf(SERVER_COL);
  var index = {};
  for (var j = 1; j < out.length; j++) if (out[j][idCol]) index[out[j][idCol]] = j;

  var written = 0;
  var conflicts = [];
  rows.forEach(function (row) {
    if (!row || !row.id) return;
    var at = index[row.id];
    if (at !== undefined && String(row.updatedAt || '') < out[at][updCol]) {
      conflicts.push(rowToObject(header, out[at]));
      return;
    }
    var target = at !== undefined ? out[at] : new Array(width).fill('');
    header.forEach(function (c, k) {
      if (Object.prototype.hasOwnProperty.call(row, c)) target[k] = String(row[c]);
    });
    target[srvCol] = stamp;
    if (at === undefined) {
      index[row.id] = out.length;
      out.push(target);
    }
    written++;
  });
  return { values: out, written: written, conflicts: conflicts };
}

/** Rows whose _serverUpdatedAt is after `since` ('' = all), as {column: text} objects. */
function rowsChangedSince(values, since) {
  if (values.length < 2) return [];
  var header = values[0];
  var srvCol = header.indexOf(SERVER_COL);
  var idCol = header.indexOf('id');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (idCol >= 0 && !r[idCol]) continue;
    if (since && srvCol >= 0 && !(r[srvCol] > since)) continue;
    out.push(rowToObject(header, r));
  }
  return out;
}

function rowToObject(header, r) {
  var o = {};
  header.forEach(function (c, k) {
    if (c) o[c] = r[k] === undefined ? '' : String(r[k]);
  });
  return o;
}
