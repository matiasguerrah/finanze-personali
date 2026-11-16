# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Conti": offline-first PWA for one user's personal + professional finances (Italian _regime forfettario_). UI language Italian, code/comments English, currency EUR, locale it-IT, timezone Europe/Rome, weeks start Monday. Stack: Vite + React 18 + TS strict, Tailwind v4, Dexie, vite-plugin-pwa, lucide-react, date-fns (`it`). Sync goes to a Google Sheet through an Apps Script web app (`apps-script/`); there is no other backend. Work proceeds in phases (plan: `~/.claude/plans/quizzical-discovering-shamir.md`); stop after each phase with a summary and test instructions.

## Commands

```bash
npm run dev            # dev server (add -- --host to test from phone on LAN)
npm run build          # tsc -b + vite build (also generates sw.js/manifest)
npm run preview        # serve dist/ (needed to test the service worker/offline)
npm run typecheck
npm run lint           # ESLint (flat config) ; npm run format = Prettier
npm test               # Vitest, all
npx vitest run src/lib/money.test.ts -t "applyBp"   # single file / test
```

Deploy: every push to `main` runs `.github/workflows/deploy.yml` (lint, test, build with `BASE_PATH=/<repo>/` read in `vite.config.ts`, deploy to GitHub Pages) → https://matiasguerrah.github.io/finanze-personali/. The repo is public: never commit personal data (test fixtures use a fictitious "Mario Rossi"). Routing uses `HashRouter` so no server rewrites are needed.

## Architecture rules (non-negotiable)

- **Money is integer cents** (`…Cents`), **rates are integer basis points** (`…Bp`, 10000 = 100%). Never floats for money. Use `applyBp`/`divRound` (exact integer rounding, half away from zero) from `src/lib/money.ts`; format only at display time with `formatCents`.
- **Calendar dates are `YYYY-MM-DD` strings** in Europe/Rome (`todayRome()`); timestamps are ISO UTC. Compare dates as strings.
- **Dexie is the source of truth on device.** UI reads via `useLiveQuery` (hooks in `src/db/hooks.ts`) and never calls the network.
- **All writes to synced tables go through `src/db/repo.ts`** (`create`/`update`/`softDelete`/`restore`/`putRaw`/`atomically`). It bumps `updatedAt` and upserts the record into `outbox` (one row per table+recordId) in the same transaction — sync depends on this. Never call `db.<table>.put/add/delete` from features. Deletes are soft (`deleted: true`); every query must filter them out.
- **Sync** (phase 4): `src/lib/sync/merge.ts` declares the Sheet columns of every synced table (`COLUMNS`, compile-time checked against the record types: a new field without a column fails `tsc`) plus row (de)serialisation and LWW. `src/sync/engine.ts` (`runSync` = push outbox in batches, then pull since `lastPullServerTime`) is browser-independent; `src/sync/sync.ts` adds config, Web Locks and status; `SyncScheduler` triggers it. Remote records enter only via `repo.applyRemote`. The backend is `apps-script/Code.gs`; its pure functions and the full two-device flow are tested by running the real file in a VM (`src/test/appsScriptHarness.ts`) — keep Code.gs plain ES (no imports).
- `settings` and `outbox` are local-only tables (never synced). Secrets (Apps Script URL/key) live only in `settings`.
- **Seed data uses fixed UUIDs and `SEED_TIMESTAMP` (year 2000)** so independent devices don't create duplicates and user edits always win LWW. Seed steps in `src/db/seed.ts` are versioned: append steps, never edit/reorder existing ones.
- Schema changes: add a new `this.version(n)` in `src/db/db.ts` (never edit an existing version, only needed for new tables/indexes), update `src/db/types.ts` and add the column to `COLUMNS` in `src/lib/sync/merge.ts` (the Sheet picks it up automatically on the next push).
- **Pure logic lives in `src/lib/`** (no React/Dexie imports) with a `*.test.ts` next to each file; features only fetch data and call these functions. Fiscal logic goes in `src/lib/tax.ts`. **No fiscal parameter (rates, coefficients, thresholds) may be hard-coded** — they come from the `activities` and `taxParams` tables.
- Categories the logic must recognise (INPS contributions, substitute tax, invoices) are identified by `Category.systemKey`, never by name.

## Domain rules worth knowing

- `scope` (`personal|business`) separates the two worlds on a single bank account; the global filter (`all|personal|business`, `src/state/scopeFilter.ts`) applies to dashboards, reports, budgets and exports.
- Activities (ATECO codes) are active on a date if `activeFrom ≤ date` and (`activeTo` empty or `≥ date`). Business income **requires** an activity active on its date (`checkActivityAssignment` in `src/lib/activities.ts`); a code change = new activity + `activeTo` on the old one.
- In the keypad the scope is proposed as business if the category _or_ account defaults to business (`proposedScope`), until the user taps the toggle.
- Transfers are `type: 'transfer'` with `accountId` → `toAccountId` and empty `categoryId`; they move balances but never count as income/expense. Balances (`src/lib/balances.ts`) only include transactions dated ≤ today.
- Recurring: month-based frequencies return to `anchorDay` after short months (`advanceDueDate` in `src/lib/recurring.ts`); `amountCents: 0` means "da definire". "Segna come pagata"/"Salta" live in `src/features/recurring/actions.ts` and return an `undo`. The 4 fiscal deadlines are seed step 2 (`taxKind` set).
- Budgets (`src/lib/budgets.ts`) count only expenses in the current day/ISO week/month. "All expenses" budgets exclude the `inps`/`substituteTax` categories (`excludedFromGlobalBudgets`, a required argument of `evaluateBudgets`); category budgets count everything. `AlertWatcher` (mounted once in `App.tsx`) recomputes them on every data change and announces each level once per period: keys like `budget:<id>:<periodStart>:warn|over` stored in the `shownAlerts` setting. Toasts stack (max 3) so alerts never hide an "Annulla".
- Local notifications go through the service worker (`src/state/notify.ts`; click handler in `public/sw-notify.js`, imported via `workbox.importScripts`). On iOS they need the installed PWA (`notificationSupport` → `needsInstall`). Due-date reminders fire only when the app is opened.
- The owner profile (name, partita IVA, codice fiscale, PEC) is the synced table `profile` with a single record `PROFILE_ID` (Dexie v2), saved via `saveProfile` (`src/features/profile/actions.ts`); validators in `src/lib/profile.ts`. ATECO codes are NOT in the profile: they belong to `activities`.
- Debts (phase 5): `src/lib/amortization.ts` builds the French plan in integer cents (interest per row = `divRound(balance × bp, 120000)`, the last row closes the residual; with no `plannedInstallments` the count comes from the installment and a leftover ≤ 1 cent per row is absorbed by the last row). `src/lib/debts.ts` (`debtStatus`) matches linked expenses (`debtId`) to the plan cumulatively, 1 cent of slack per row; extra payments cover the next rows, delays/advances shift the payoff date. `startDate` = date of the first monthly installment. `Debt.state`: `notice` (avviso: `noticeAmountCents` + `noticeDueDate`, treated by `debtTerms` as a single-installment plan, so partial/late/paid work unchanged) or `installments`. "Rateizza" turns a notice into a plan and stamps `rateizedAt` (UTC timestamp): payments _recorded_ (`createdAt`) before it count for the notice (`paidBeforePlanCents`), not the plan. Use `tryDebtStatus` in UI (null on broken stored terms instead of throwing). "Registra rata" proposes the category with `systemKey: 'debtPayments'` (seed step 3).
- "Dividi" keeps the personal part on the original record and creates the business part; both share `splitGroupId` (`src/features/transactions/actions.ts`).

## UI conventions

- Colour tokens are CSS variables in `src/index.css` mapped to Tailwind (`bg-bg`, `bg-surface`, `text-muted`, `text-accent`, `bg-raised`, …); dark mode only redefines variables, so don't add `dark:` classes. Category/account colours come from the single palette in `src/lib/palette.ts`; icons only from the curated registry in `src/components/icons.ts`.
- Touch targets ≥ 44px (`min-h-11`), amounts use `tabular-nums` (`<Amount>`), every icon has a text label. Modals use `<Sheet>` (native `<dialog>`).
- The quick-entry sheet is opened from anywhere via `useOpenEntry()`; its data is preloaded in `EntryProvider` so it renders complete on the first frame.
