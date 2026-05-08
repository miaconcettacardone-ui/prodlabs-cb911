# Phase 6 — Continuation handoff (after part 4)

## Where we are

I'm Mia. The previous Claude shipped **Phase 6 part 4** today: the real Import
tab + manager empty-state CTA. You're picking up the rest. Two real-feature
items remain: Dashboard and History.

Repo: `https://github.com/miaconcettacardone-ui/prodlabs-cb911`. Mac, MAMP at
`/Applications/MAMP/htdocs/cb911-prodlabs/`, served at
`http://localhost:8888/cb911-prodlabs/`. Sync after a build:

```
rsync -a --delete --exclude='.git' --exclude='node_modules' /tmp/p9/ . && \
git add -A && git commit -m "..." && git push && \
rsync -a --delete ~/Projects/prodlabs-cb911/ /Applications/MAMP/htdocs/cb911-prodlabs/
```

Read `phase5-handoff.md`, `phase5-continuation-handoff.md`,
`phase6-part2-handoff.md`, and `phase6-part3-handoff.md` for prior context.
**Don't re-derive decisions.**

---

## What's shipped on main

### Phase 5 + Phase 6 parts 1, 2, 3, 4 — all on main

- **Phase 5:** username login, palette swap, no self-signup
- **Phase 6 part 1:** two-column login, 8-tab IA admin/manager, 6-tab member, Dashboard/Import/History stubs
- **Phase 6 part 2:** unified Add User modal (admin Users tab), Edit/Delete on rows, `State.updateTeam()`
- **Phase 6 part 3:** team-setup wizard inside Settings, 6 steps, cancel-safe
- **Phase 6 part 4 — THIS zip (`prodlabs-cb911-phase6-part4.zip`):**
  - **Real Import tab** — no longer a stub:
    - **Manager Import:** single-record form (date, member, work unit, fields) AT TOP + inline bulk CSV section BELOW. Same paste-validate-commit flow as the old modal but rendered inline.
    - **Member Import:** single-record form ONLY (no bulk CSV — members shouldn't log against teammates, and the CSV format requires a `member` column).
    - **Super admin Import:** team picker first, then bulk CSV per selected team. Warning shown when picked team has no work units.
  - **`CSVImport.renderInline(container, team, session, opts)`** added to `js/csv.js` — the bulk-import flow extracted into a reusable inline renderer. Replaces the old modal flow on the Import tab. Old modal code in `manager.js` (`openImportModal`, accessed via Activity tab's "Bulk Import" button) is still around as a backup path.
  - **Manager Dashboard empty-state CTA** — when `team.workUnits.length === 0`, the Dashboard tab renders a "Welcome, [first name]!" card with a "Run Setup Wizard" button that calls `WizardSettings.open()` directly. Click → wizard opens pre-filled with the team. After save, Dashboard re-renders with the regular configured-team stub.
  - **Tests:** smoke-p6.js extended with section [13]. **185/185 passing.**

---

## What's left

### Item P6-A — Real Dashboard tab (~25%)

**This is the biggest remaining item. Probably its own session.**

Per Mia's sketch: *"d = dashboard (like Intelihub prod). admin = full company (filter by dep/team/user). man. = full team/dep (filter by team/user if pos). user = only self stats."*

#### Admin Dashboard
Replace `renderDashboardStub` in `super.js`. Build:
- **Top metric strip** (4-5 cards): total records this month, active users today, top team by output this week, total teams, total members.
- **Filter bar:** department dropdown, team dropdown, user dropdown. All independent — narrowing applies to everything below.
- **Cross-team leaderboard:** ranked list of teams by record count over selected window (default: last 7 days).
- **Recent activity feed:** last 10-15 records across all teams, with team badge and member name.
- **Goal completion summary:** % of teams hitting their daily goals today.

Reuse existing renderers where possible: `Analytics.activeGoals(team)`, `State.recordsOfTeam(teamId)`, `State.membersOfTeam(teamId)`. The `renderOverview` function already in `super.js` (now under the **Stats** tab) has most of the company-wide metric logic — refactor it so Dashboard and Stats both pull from the same data layer but render different views.

#### Manager Dashboard
Replace the configured-team branch in `manager.js`'s `renderDashboardStub`. Build:
- **Top metric strip:** today's record count, this week's count, top performer this week, goal hit %.
- **Per-member leaderboard** (already exists in current `renderOverview` — extract and reuse).
- **Member filter:** dropdown to focus the rest of the page on one member.
- **Goal progress per work unit** (already exists in current code — reuse).

#### Member Dashboard
Already wired — `dashboard` routes to `renderOverview` (the slim self-stats view). Just polish:
- Make sure today's count is prominent.
- Surface the "engage in team competition" thread from Mia's sketch — show "you vs team avg" or "your rank this week" on the dashboard.

### Item P6-B — Real History tab with PDF reports (~15%)

Sketch: *"h = history. admin = full comp (monthly/bimonthly/yr report pdf). manager = same but for team(s). user = self report history."*

Currently:
- Manager `history` routes to `renderActivity` (raw record table) — fine fallback
- Member `history` routes to `renderHistory` (own records table) — fine fallback
- Super admin `history` is stubbed

**Approach: print-friendly stylesheet + `window.print()`.** Cleaner than jsPDF, no CDN dependency. User clicks "Print to PDF" in the browser's print dialog.

For each role:
- Top section: date-range pickers (Monthly / Bi-monthly / Yearly buttons that pre-fill the dates) + a "Generate PDF Report" button that opens a print-styled view.
- Below: existing record table (already works).

The print-styled view is a separate route or a `<style media="print">` block that hides everything except a clean report layout: header with company logo, date range, summary metrics, then a list/table of relevant records.

**Member history** also needs a "Download my report" button that does the same thing, scoped to their own records.

### Item P6-G — Smoke test extension

Bundled with each item above. Specifically:
- Real Dashboard renders metric cards for each role (count assertions for cards present, no value-correctness assertions since data depends on test setup)
- History tab includes "Generate Report" button (admin/manager) or "Download my report" (member)
- Date range presets fill the date inputs correctly

---

## Things to know

### Import tab notes

The old modal-based `openImportModal` in `manager.js` is **still reachable** from the Activity tab's "Bulk Import" button. That's fine — it's a backup/duplicate path. If you want to fully consolidate, remove that button and the function. I (the previous Claude) didn't to keep the diff minimal.

### Manager empty-state CTA notes

The CTA only shows on **Dashboard** when team is unconfigured. Other tabs still render their default stubs/views. If Mia wants the empty state to dominate ALL tabs (forcing the user to set up before doing anything), wrap the route check at the top of `manager.js`'s `render(session)` — but I'd ask first. The current behavior (only Dashboard) lets a manager browse the empty Stats / Teams / Settings / etc. without being blocked.

### Things I deliberately did NOT do

- **Did not remove the old `openImportModal` modal** from manager.js's Activity tab — see above. Defer.
- **Did not add bulk CSV to member Import** — security/UX choice. Members shouldn't be able to log against teammates via CSV.
- **Did not add user-roster bulk import for super admin** — was mentioned in the part 3 handoff but is genuinely Phase 7 work (the user record format, role assignment, password handling all need design).

### Budget plan
- **A (Dashboard real impl): 25%** ← biggest remaining, do as own session
- **B (History/PDF): 15%** ← second-biggest
- **G (Smoke test): bundled**

If you hit ~60% used and you're still mid-A, **STOP** and write a fresh handoff. After both A and B land, Phase 6 is essentially done.
