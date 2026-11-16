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
 * Email alerts (optional): run installAlertsTrigger() once from the editor for an hourly
 * checkAlerts() (budgets over their threshold, due dates incl. fiscal ones, revenue threshold),
 * and installDailySummaryTrigger() for a morning summary of the previous day's expenses.
 * Each alert is emailed once: sent keys live in the Script Properties (SENT_ALERTS).
 * Mails go to the script owner, or to the ALERT_EMAIL Script Property when set.
 *
 * The pure functions (no Spreadsheet/Properties calls) are unit-tested by the app's test suite
 * (src/lib/sync/server.test.ts, src/lib/sync/alerts.test.ts), which runs this very file.
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
var SENT_PROP = 'SENT_ALERTS';
var EMAIL_PROP = 'ALERT_EMAIL';
var TZ = 'Europe/Rome';

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

// ================================================================ email alerts (phase 8)

/** Run once from the editor: hourly checkAlerts (replaces an existing one). */
function installAlertsTrigger() {
  removeTriggers_('checkAlerts');
  ScriptApp.newTrigger('checkAlerts').timeBased().everyHours(1).create();
  Logger.log('Avvisi email attivi: controllo ogni ora, invio a ' + recipient_());
}

/** Run once from the editor: daily summary of yesterday's expenses, around 8:00. */
function installDailySummaryTrigger() {
  removeTriggers_('dailySummary');
  ScriptApp.newTrigger('dailySummary').timeBased().everyDays(1).atHour(8).create();
  Logger.log('Riepilogo giornaliero attivo, invio a ' + recipient_());
}

/** Run from the editor to stop every email. */
function removeAllTriggers() {
  removeTriggers_('checkAlerts');
  removeTriggers_('dailySummary');
  Logger.log('Avvisi email disattivati');
}

function checkAlerts() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var today = todayRome_();
    var sent = JSON.parse(props.getProperty(SENT_PROP) || '[]');
    var mail = computeAlerts(readTables_(), today, sent);
    if (!mail) return;
    MailApp.sendEmail(recipient_(), mail.subject, mail.body);
    props.setProperty(
      SENT_PROP,
      JSON.stringify(pruneSentKeys(sent.concat(mail.keys), addDays(today, -62))),
    );
  } finally {
    lock.releaseLock();
  }
}

function dailySummary() {
  var mail = dailySummaryEmail(readTables_(), addDays(todayRome_(), -1));
  if (mail) MailApp.sendEmail(recipient_(), mail.subject, mail.body);
}

function removeTriggers_(handler) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
}

function recipient_() {
  return (
    PropertiesService.getScriptProperties().getProperty(EMAIL_PROP) ||
    Session.getEffectiveUser().getEmail()
  );
}

function todayRome_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

/** Every table as an array of {column: text} rows. */
function readTables_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = {};
  TABLES.forEach(function (t) {
    var sheet = ss.getSheetByName(t);
    out[t] = sheet ? rowsChangedSince(readValues_(sheet), '') : [];
  });
  return out;
}

// ---------------------------------------------------------------- alerts: pure functions (tested)
// They mirror src/lib/budgets.ts, recurring.ts and tax.ts of the app (same keys and rules).

var WARN_BP = 8000; // revenue threshold alert levels (UI choice, same as the app)
var ALERT_BP = 9500;

function int_(s) {
  var n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

function live_(rows) {
  return (rows || []).filter(function (r) {
    return r.deleted !== 'TRUE';
  });
}

function parseDate_(s) {
  return new Date(Date.UTC(int_(s.slice(0, 4)), int_(s.slice(5, 7)) - 1, int_(s.slice(8, 10))));
}

function isoDate_(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(s, n) {
  var d = parseDate_(s);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate_(d);
}

function daysBetween(from, to) {
  return Math.round((parseDate_(to) - parseDate_(from)) / 86400000);
}

/** Current day / ISO week (Monday) / month containing `date`. */
function periodRange(period, date) {
  if (period === 'daily') return { from: date, to: date };
  if (period === 'weekly') {
    var dow = (parseDate_(date).getUTCDay() + 6) % 7; // Monday = 0
    var from = addDays(date, -dow);
    return { from: from, to: addDays(from, 6) };
  }
  var first = date.slice(0, 8) + '01';
  var d = parseDate_(first);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { from: first, to: isoDate_(d) };
}

/** "1.234,56 €" */
function formatEuro(cents) {
  var neg = cents < 0;
  var abs = Math.abs(cents);
  var euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  var rest = ('0' + (abs % 100)).slice(-2);
  return (neg ? '-' : '') + euros + ',' + rest + ' €';
}

function formatDateIt(s) {
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}

var SCOPE_TEXT = { all: 'tutte', personal: 'personali', business: 'di lavoro' };
var PERIOD_TEXT = { daily: 'oggi', weekly: 'questa settimana', monthly: 'questo mese' };

function budgetAlerts_(t, today, sent) {
  var cats = {};
  var excluded = {};
  live_(t.categories).forEach(function (c) {
    cats[c.id] = c;
    if (c.systemKey === 'inps' || c.systemKey === 'substituteTax') excluded[c.id] = true;
  });
  var txs = live_(t.transactions).filter(function (x) {
    return x.type === 'expense';
  });
  var out = [];
  live_(t.budgets).forEach(function (b) {
    if (b.active !== 'TRUE') return;
    var range = periodRange(b.period, today);
    var spent = 0;
    txs.forEach(function (x) {
      if (x.date < range.from || x.date > range.to) return;
      if (b.scope !== 'all' && b.scope !== x.scope) return;
      if (b.target === 'category' ? x.categoryId !== b.categoryId : excluded[x.categoryId]) return;
      spent += int_(x.amountCents);
    });
    var limit = int_(b.limitCents);
    var status = spent > limit ? 'over' : spent * 10000 >= limit * int_(b.warnAtBp) ? 'warn' : 'ok';
    if (status === 'ok') return;
    var key = 'budget:' + b.id + ':' + range.from + ':' + status;
    if (sent.indexOf(key) >= 0) return;
    var keys = [key];
    if (status === 'over') keys.push('budget:' + b.id + ':' + range.from + ':warn');
    var label =
      b.target === 'category'
        ? (cats[b.categoryId] && cats[b.categoryId].name) || 'Categoria eliminata'
        : 'Spese ' + (SCOPE_TEXT[b.scope] || '');
    var pct = limit > 0 ? Math.floor((spent * 100) / limit) : 100;
    out.push({
      keys: keys,
      text:
        label +
        ' (' +
        (PERIOD_TEXT[b.period] || '') +
        '): ' +
        (status === 'over' ? 'SUPERATA, ' : 'attenzione, ') +
        formatEuro(spent) +
        ' su ' +
        formatEuro(limit) +
        ' (' +
        pct +
        '%)',
    });
  });
  return out;
}

function dueAlerts_(t, today, sent) {
  var out = [];
  live_(t.recurring)
    .filter(function (r) {
      return r.active === 'TRUE' && r.nextDueDate;
    })
    .sort(function (a, b) {
      return a.nextDueDate < b.nextDueDate ? -1 : a.nextDueDate > b.nextDueDate ? 1 : 0;
    })
    .forEach(function (r) {
      var days = daysBetween(today, r.nextDueDate);
      if (days > int_(r.reminderDaysBefore)) return;
      var key = 'due:' + r.id + ':' + r.nextDueDate;
      if (sent.indexOf(key) >= 0) return;
      var when =
        days < 0
          ? 'scaduta da ' + -days + (days === -1 ? ' giorno' : ' giorni')
          : days === 0
            ? 'scade oggi'
            : days === 1
              ? 'scade domani'
              : 'tra ' + days + ' giorni';
      var amount = int_(r.amountCents);
      out.push({
        keys: [key],
        text:
          r.name +
          ': ' +
          formatDateIt(r.nextDueDate) +
          ' (' +
          when +
          ') · ' +
          (amount > 0
            ? (r.estimated === 'TRUE' ? 'circa ' : '') + formatEuro(amount)
            : r.taxKind
              ? 'importo stimato nell’app (Scadenze)'
              : 'importo da definire'),
      });
    });
  return out;
}

function revenueAlert_(t, today, sent) {
  var year = int_(today.slice(0, 4));
  var params = null;
  live_(t.taxParams).forEach(function (p) {
    var y = int_(p.validFromYear);
    if (y <= year && (!params || y > int_(params.validFromYear))) params = p;
  });
  if (!params) return [];
  var limit = int_(params.revenueThresholdCents);
  if (limit <= 0) return [];
  var income = 0;
  live_(t.transactions).forEach(function (x) {
    if (x.type === 'income' && x.scope === 'business' && x.date.slice(0, 4) === String(year))
      income += int_(x.amountCents);
  });
  var used = Math.round((income * 10000) / limit);
  var levels =
    used > 10000
      ? ['warn', 'alert', 'over']
      : used >= ALERT_BP
        ? ['warn', 'alert']
        : used >= WARN_BP
          ? ['warn']
          : [];
  if (!levels.length) return [];
  var keys = levels.map(function (l) {
    return 'revenue:' + year + ':' + l;
  });
  if (sent.indexOf(keys[keys.length - 1]) >= 0) return [];
  var pct = Math.floor(used / 100) + '%';
  var level = levels[levels.length - 1];
  return [
    {
      keys: keys,
      text:
        'Ricavi ' +
        year +
        ': ' +
        formatEuro(income) +
        ' su ' +
        formatEuro(limit) +
        ' — ' +
        (level === 'over'
          ? 'soglia superata (' + pct + ')'
          : pct + ' della soglia, oltre ' + (level === 'alert' ? 'il 95%' : 'l’80%')),
    },
  ];
}

/**
 * The email for alerts not sent yet, or null. `tables` = rows as read from the Sheet (text),
 * `sent` = keys already emailed. Returns {subject, body, keys}.
 */
function computeAlerts(tables, today, sent) {
  var sections = [
    ['Soglie di spesa', budgetAlerts_(tables, today, sent)],
    ['Scadenze', dueAlerts_(tables, today, sent)],
    ['Soglia ricavi', revenueAlert_(tables, today, sent)],
  ].filter(function (s) {
    return s[1].length > 0;
  });
  if (!sections.length) return null;
  var keys = [];
  var count = 0;
  var body = sections
    .map(function (s) {
      return (
        s[0] +
        '\n' +
        s[1]
          .map(function (a) {
            keys = keys.concat(a.keys);
            count++;
            return '• ' + a.text;
          })
          .join('\n')
      );
    })
    .join('\n\n');
  return {
    subject: 'Conti: ' + (count === 1 ? '1 nuovo avviso' : count + ' nuovi avvisi'),
    body: body + '\n\n— Conti (avviso automatico, inviato una sola volta)',
    keys: keys,
  };
}

/** Drops keys whose period/due date is before `cutoff`; keys without a date are kept. */
function pruneSentKeys(keys, cutoff) {
  var seen = {};
  return keys.filter(function (k) {
    if (seen[k]) return false;
    seen[k] = true;
    var m = /:(\d{4}-\d{2}-\d{2})(?::|$)/.exec(k);
    return !m || m[1] >= cutoff;
  });
}

/** Summary of the expenses of `day`, personal and business apart, or null if there were none. */
function dailySummaryEmail(tables, day) {
  var cats = {};
  live_(tables.categories).forEach(function (c) {
    cats[c.id] = c.name;
  });
  var groups = { personal: {}, business: {} };
  var totals = { personal: 0, business: 0 };
  var n = 0;
  live_(tables.transactions).forEach(function (x) {
    if (x.type !== 'expense' || x.date !== day || !groups[x.scope]) return;
    var name = cats[x.categoryId] || 'Senza categoria';
    groups[x.scope][name] = (groups[x.scope][name] || 0) + int_(x.amountCents);
    totals[x.scope] += int_(x.amountCents);
    n++;
  });
  if (!n) return null;
  var part = function (scope, title) {
    var names = Object.keys(groups[scope]).sort(function (a, b) {
      return groups[scope][b] - groups[scope][a];
    });
    if (!names.length) return title + ': nessuna spesa';
    return (
      title +
      ': ' +
      formatEuro(totals[scope]) +
      '\n' +
      names
        .map(function (k) {
          return '• ' + k + ' ' + formatEuro(groups[scope][k]);
        })
        .join('\n')
    );
  };
  return {
    subject:
      'Conti: spese del ' +
      formatDateIt(day) +
      ' — ' +
      formatEuro(totals.personal + totals.business),
    body:
      part('personal', 'Personali') +
      '\n\n' +
      part('business', 'Lavoro') +
      '\n\n— Conti (riepilogo giornaliero)',
  };
}
