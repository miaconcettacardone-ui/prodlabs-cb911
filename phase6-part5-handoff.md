# Phase 6 — Continuation handoff (after part 5)

## Where we are

I'm Mia. The previous Claude shipped **Phase 6 part 5** today: real Dashboards
for all three roles. **Only one item remains** to finish Phase 6: the real
History tab with PDF reports. Everything else from Mia's sketch is done.

Repo: `https://github.com/miaconcettacardone-ui/prodlabs-cb911`. Mac, MAMP at
`/Applications/MAMP/htdocs/cb911-prodlabs/`, served at
`http://localhost:8888/cb911-prodlabs/`. Sync after a build:

```
rsync -a --delete --exclude='.git' --exclude='node_modules' /tmp/p10/ . && \
git add -A && git commit -m "..." && git push && \
rsync -a --delete ~/Projects/prodlabs-cb911/ /Applications/MAMP/htdocs/cb911-prodlabs/
```

Read `phase5-handoff.md`, `phase5-continuation-handoff.md`,
`phase6-part2-handoff.md`, `phase6-part3-handoff.md`, and
`phase6-part4-handoff.md` for prior context. **Don't re-derive decisions.**

---

## What's shipped on main

### Phase 5 + Phase 6 parts 1, 2, 3, 4, 5 — all on main

- Phase 5: username login, palette swap, no self-signup
- Phase 6 part 1: two-column login, 8-tab IA admin/manager, 6-tab member
- Phase 6 part 2: unified Add User modal + Edit/Delete on rows
- Phase 6 part 3: team-setup wizard inside Settings, 6 steps, cancel-safe
- Phase 6 part 4: real Import tab + manager empty-state CTA
- **Phase 6 part 5 — THIS zip (`prodlabs-cb911-phase6-part5.zip`):**
  - **Admin Dashboard:** filter bar with department / team / user dropdowns (cascading: picking a department filters the team dropdown, picking a team filters the user dropdown). Six metric cards (Today, This Week, This Month, Active Today, Teams, Members) all scaled to filter intersection. Cross-team leaderboard ranked by this-week record count, showing rank / name / dept+member-count / bar / count. Recent activity table.
  - **Manager Dashboard:** Member filter dropdown in page header. Top metric strip (Today / Week / Month / All Time) scaled to filter. Today's Goals card (hidden when filter active). Top Performers + Goal Hit Rate compact leaderboards (hidden when single-member filter active). Recent activity.
  - **Member Dashboard:** Prominent metric strip with Today/Week/Month/All Time. New "You vs The Team — This Week" card showing your records / team average / your rank (hidden when team has 1 member). Existing trend + by-work-unit charts and recent records preserved.
  - Module-scoped filter state (`dashboardMember` in manager.js, `dashFilter` in super.js) — persists within a tab session, doesn't leak across role switches because `Router.go('app')` re-instantiates per session.
  - New CSS in `css/app.css`: `.dash-filter`, `.dash-filter-bar`, `.dash-filters`, `.dash-team-board`, `.dash-team-row`, `.vs-grid`, `.vs-stat`, `.vs-num`, `.vs-rank-top/good/plain`.
  - **Tests:** smoke-p6.js extended with section [14]. **208/208 passing.**

---

## What's left

### Item P6-B — Real History tab with PDF reports (only remaining item)

Sketch: *"h = history. admin = full comp (monthly/bimonthly/yr report pdf). manager = same but for team(s). user = self report history."*

Currently:
- Manager `history` routes to `renderActivity` (raw record table) — fine fallback
- Member `history` routes to `renderHistory` (own records table) — fine fallback
- Super admin `history` is the only stub (`renderHistoryStub`)

**Suggested approach: print-friendly stylesheet + `window.print()`.** Cleaner than jsPDF, no CDN dependency. User clicks "Print to PDF" in the browser's print dialog. Same UX, much less code.

For each role:

#### Admin History
Replace `renderHistoryStub` in super.js. Build:
- **Top section:**
  - Date range presets row: buttons for "This Month", "Last Month", "This Quarter", "This Year"
  - Custom range: two date inputs (from / to)
  - Filter row: department + team dropdowns (reuse `dashFilter` cascade pattern from Dashboard if helpful)
  - Big "Generate PDF Report" button → triggers a print-styled view

- **Below:** existing-style record table scoped to the date range + filters. Reuse `renderActivityTable` from manager.js if it can be extracted, or write a slimmer one inline.

The **print-styled view** is the magic part. Two approaches, pick one:

1. **Inline print stylesheet (preferred):** add a `<style media="print">` block that hides everything except `#print-area`. The "Generate PDF Report" button populates `#print-area` with a clean report layout (company logo, date range, summary metrics, then a compact record list/table) and immediately calls `window.print()`. After print dialog closes, hide `#print-area` and restore normal view.

2. **Hidden-iframe approach:** create an iframe, write a self-contained printable HTML to it, call `iframe.contentWindow.print()`. More portable but more code.

Either way: the print layout should include:
- Company name + logo (if there's one) at top
- Date range and filter summary
- Top metrics (record count, active members, teams)
- Per-team breakdown
- Optionally: full record listing or just summary

#### Manager History
Currently routes to `renderActivity` (raw records). Replace with:
- Same date-range pickers + presets
- "Generate PDF Report" button (scoped to manager's team only — no department/team filters)
- Below: the existing `renderActivity` table scoped to the date range

Or simpler: keep `renderActivity` and add a "Generate PDF Report" button + date-range presets to its page header. Either works.

#### Member History
Currently routes to `renderHistory` (own records). Same treatment:
- Date-range pickers
- "Download My Report" button → print-friendly view of just their records over the range
- Below: existing record table

### Item P6-G — Smoke test extension

After History lands:
- History tab includes "Generate PDF Report" / "Download My Report" button (per role)
- Date-range presets fill the date inputs correctly when clicked
- Printable area populates when Generate is clicked (don't actually call window.print() in tests — just verify the print-area DOM is built)

---

## Things to know

### How the existing Dashboard filters work
- **Admin:** `dashFilter = { department, teamId, memberEmail }` — module-scoped in super.js. The filter cascade is in `df-dept` / `df-team` / `df-user` change handlers — clearing department also clears team if team's department doesn't match; clearing team also clears member if member isn't in the new team.
- **Manager:** `dashboardMember` (single string) module-scoped in manager.js.
- Filters persist within a session but reset when switching to a different role (because `Router.go('app')` re-instantiates the view IIFE? Actually no — IIFEs are once-per-page-load. The state persists across role switches. If Mia complains about stale filter state when admin → manager → admin, you'll need to reset filters on login.)

### Styling notes
- Use `var(--cb-burgundy)` for active/highlight elements (it's the Phase 5 secondary)
- Use `var(--cb-red)` only for primary actions (buttons, brand stripe)
- Print stylesheets should set background to `#fff`, text to `#000`, hide `.topbar` / `.tabs` / `.dash-filter-bar` etc. Use `@media print { .no-print { display: none; } }` pattern.

### What I deliberately did NOT do in part 5
- **Did not change the Stats tab** — the existing `renderOverview` in super.js and manager.js stays as the deep-dive view. Dashboard is the quick-glance overview, Stats is the detail. Mia can later decide if Stats and Dashboard should be merged or kept separate.
- **Did not add charts to admin Dashboard** — the existing charts (trend / by work unit) live on Stats. Admin Dashboard is text + leaderboard + filters, intentionally chart-free for fast scanning.
- **Did not unify the manager `renderOverview` (Stats tab) with the new Dashboard** — they're now two different views with different purposes. Some duplication, but easier to reason about than a flag-driven merged view.

### Budget for History
- **B (History/PDF): 15%** — should fit comfortably in one session
- **G (Smoke test): bundled**

After History ships, Phase 6 is essentially complete. Mia's hand-drawn sketch will be fully realized.
