# Phase 6 — Continuation handoff (after part 1)

## Where we are

I'm Mia. I sketched a re-scoped IA on paper (`phase6-sketch.png` — hand-drawn,
in Mia's photos). The previous Claude shipped **part 1** today so my dev can
ship Laravel scaffolding against the new tab structure. **You're picking up
the rest.**

The repo is `https://github.com/miaconcettacardone-ui/prodlabs-cb911`. I'm on
a Mac, MAMP at `/Applications/MAMP/htdocs/cb911-prodlabs/`, served at
`http://localhost:8888/cb911-prodlabs/`. Sync after a build:

```
rsync -a --delete ~/Projects/prodlabs-cb911/ /Applications/MAMP/htdocs/cb911-prodlabs/
```

Read `phase5-handoff.md` and `phase5-continuation-handoff.md` for context on
prior decisions. The Phase 6 sketch's intent is captured below — don't
re-derive it from the photo.

---

## What part 1 shipped (done — don't redo)

### Login page redesign (matches sketch left panel)
- **Two-column layout** when in login mode: welcome + sign-in card on the left, value-prop bullets on the right ("Manage your team / View your stats / Engage in team competition / Review company productivity").
- Stacks at <840px. Bullets get tinted icon backgrounds.
- First-run bootstrap mode keeps the original single-column layout.
- CSS classes: `.land-split`, `.land-split-left`, `.land-split-right`, `.land-bullets`, `.land-hero-wide`.

### App shell IA matches sketch right panel
- New tab order for **admin and manager** (8 tabs):
  `Dashboard | Stats | Teams & Goals | Import | History | Users | Messages | Settings`
- New tab order for **members** (6 tabs, per sketch legend "not on regular users"):
  `Dashboard | Goals | Import | History | Messages | Settings`
- Members deliberately do NOT see `Stats` or `Users`. (The previous "Stats" leaderboard view for members no longer has a tab — discuss with Mia whether to surface it inside Dashboard when you build the real one.)
- Default tab on every role is now **Dashboard**.
- New icons added to `js/utils.js`: `dashboard`, `history`, `message`, `flag`.

### Routing of existing renderers under new tab keys
- **Super** (`js/views/super.js`):
  - `dashboard` → `renderDashboardStub` (NEW, stubbed)
  - `stats` → existing `renderOverview` (company metrics)
  - `teams` → existing `renderTeams`
  - `import` → `renderImportStub` (NEW, stubbed)
  - `history` → `renderHistoryStub` (NEW, stubbed)
  - `users` → existing `renderAdmins`
  - `messages` → existing `InboxView.render`
  - `settings` → existing `renderSettings`
- **Manager** (`js/views/manager.js`):
  - `dashboard` → `renderDashboardStub` (NEW, stubbed)
  - `stats` → existing `renderOverview`
  - `teams` → existing `renderTeam` (team config + goals)
  - `import` → `renderImport` (relabels existing `renderLog` page header to "Import"; bulk-CSV button still works)
  - `history` → existing `renderActivity` (raw record table — fine for now)
  - `users` → existing `renderTeam` (the existing team view *is* the roster)
  - `messages` → existing `InboxView.render`
  - `settings` → existing `renderSettings`
- **Member** (`js/views/member.js`):
  - `dashboard` → existing `renderOverview` (the slim self-stats dashboard)
  - `goals` → existing `renderGoals`
  - `import` → existing `renderLog` (single-record logging)
  - `history` → existing `renderHistory` (own records table)
  - `messages` → existing `InboxView.render`
  - `settings` → existing `renderSettings`
  - Legacy keys (`overview`, `log`, `stats`, `users`, `inbox`) are still routed to sensible fallbacks for any inline `data-go` links inside other panels.

### Stub CSS class
- `.empty-stub` lives in `css/app.css` for the three placeholder tabs. Burgundy-icon + headline + body + hint pattern.

### Smoke test
- `smoke-p6.js` at repo root. **99/99 passing** as of part 1 ship.
- Covers: JS load, isFirstRun, departments, username login, landing both modes, tab counts (8/8/6), every tab on every role renders without throwing, no ghost references to deleted modules.
- Run with `node smoke-p6.js` from the repo root. JSDOM required (`npm install jsdom`).

---

## What's left (Phase 6 part 2)

### Item P6-A — Real Dashboard tab (HIGH priority — Mia called it the new entry point)

The sketch says: *"d = dashboard (like Intelihub prod). admin = full company (filter by dep/team/user). man. = full team/dep (filter by team/user if pos). user = only self stats."*

Build per role:
- **Admin Dashboard:** company-wide top-line metrics (total records this month, active users today, top team by output, top contributor), plus a leaderboard cross-team (existing `renderOverview` has most of this), plus filter dropdowns: department / team / user. The filters narrow the metrics shown.
- **Manager Dashboard:** team metrics (members count, this-week output, goal completion %), plus per-member leaderboard, plus an optional team filter (if manager has multiple teams — most don't). Steal heavily from existing manager `renderOverview`.
- **Member Dashboard:** the existing slim self-dashboard (greeting, today's count, weekly mini-bars, goal progress). Already implemented as `renderOverview` in `member.js` and currently aliased to `dashboard` — so member Dashboard is *already real*. Just polish.

Replace `renderDashboardStub` in super.js and manager.js with real implementations. Member dashboard is already wired (renderOverview).

### Item P6-B — Real History tab (PDF reports)

Sketch: *"h = history. admin = full comp (monthly/bimonthly/yr report pdf). manager = same but for team(s). user = self report history."*

- For now `manager.history` and `member.history` route to existing `renderActivity`/`renderHistory` (raw record tables). That's a reasonable fallback.
- Real implementation: a top section with date-range pickers + "Generate Report" buttons (Monthly / Bi-monthly / Yearly) that produce a downloadable PDF. The existing record table can stay as the bottom section ("Raw activity").
- Suggest using **jsPDF** via CDN for client-side PDF (no backend needed in prototype). Or just a print-friendly stylesheet + `window.print()` for v1 — that's actually cleaner.
- Member history already shows their own records via `renderHistory`. Just add a "Download my report" button at the top.

### Item P6-C — Real top-level Import tab

Sketch: *"I = import. same for all (import area like intel pellbs)."*

Currently:
- Manager `import` tab routes to `renderLog` (single-record logging) with a relabeled header. Bulk-CSV is reachable via a button.
- Member `import` tab also routes to `renderLog`.
- Super `import` is stubbed.

Real implementation: a unified Import page with two clearly separated sections:
1. **Single record** — the existing `renderLog` form. Works for members logging on their own behalf and managers logging on a member's behalf.
2. **Bulk import** — the existing CSV paste-and-validate modal flow, but inline on the page (not modal). Reuse `CSVImport.parse()` from `js/csv.js` — it's already solid.

For super admins specifically, also expose:
- **User roster import** (paste-CSV of user records to bulk-create members)
- **Team configuration import** (less common, defer if time tight)

The existing `openImportModal` in manager.js has the working CSV preview/validate logic — extract it into a reusable function in `js/csv.js` (or a new `js/views/import.js`) and call from both manager and super pages.

### Item P6-D — Wizard back, inside Settings (Mia explicitly asked for this)

Sketch sidenote: *"Add: team-set up. under settings for admin/man. wizard walkthrough to create other pgs/users/reports/etc."*

A multi-step inline wizard inside the **Settings tab**, available to admin and manager only. Steps (admin perspective):
1. **Team basics** — name, department (with "Other" → `State.addDepartment()`)
2. **Work units** — pick from `LIBRARY.workUnits`, optional custom add
3. **Fields** — pick which fields each record tracks
4. **Roles** — pick or add team roles
5. **Goals** — set initial goals (record counts per period)
6. **Members** — bulk-add members or skip and use the Add Member modal later
7. **Done** — summary + "Open team" button

The deleted `js/views/wizard.js` file from Phase 5 had a working multi-step wizard. **DON'T** restore it as a top-level view — it's a Settings sub-flow now. But you can crib heavily from the deleted file's structure (it lives in git history at `c4c41d2` or thereabouts, the commit before the Phase 5 part 1 push).

For managers: same wizard but scoped to their team only, no team-creation step (their team already exists — the wizard configures it).

### Item P6-E — User-creation modals (carried over from Phase 5 item 10)

This was already in `phase5-continuation-handoff.md` and is still needed. On the **Users tab** (admin only):
- **Add Super Admin** button → modal (display name, username, email, password)
- **Add Manager** button → modal (display name, username, email, password, team selector with "create new team" sub-flow)
- **Add Member** button → modal (display name, username, email, password, team, role)
- **Edit / Delete** buttons on each row in the user list

The Phase 5 continuation handoff has full details. Reuse existing `.modal-overlay` / `.modal` CSS — palette is already correct.

### Item P6-F — Manager empty-state CTA (carried over from Phase 5 item 11)

When manager logs in to a brand-new team with no work units configured, show a card directing them to the Settings tab to run the wizard (item P6-D). See `phase5-continuation-handoff.md`.

### Item P6-G — Smoke test extension

After parts A-F land, extend `smoke-p6.js`:
- Real Dashboard renders for each role with at least one metric card visible
- History tab includes a "Generate Report" button (admin/manager) or "Download my report" (member)
- Import tab shows BOTH single-record form AND bulk-CSV section inline (not modal)
- Settings → Wizard launches and step 1 is reachable
- Add Manager / Add Member / Add Super Admin buttons present on admin Users tab

---

## Things to know

- **The tab key `users` for managers currently routes to `renderTeam`.** That's OK — `renderTeam` IS the roster + member detail view. But if you build a separate "team-config view" elsewhere, route `teams` and `users` to different functions.
- **The legacy fallback routes in `member.js`** (`overview`, `log`, `stats`, `users`, `inbox`) exist because various inline `data-go` links inside `renderOverview` and `renderGoals` still reference them. Don't delete those routes until you've grep'd `data-go` thoroughly.
- **Member's leaderboard view (`renderStats`) is currently orphaned** — it has no tab in the new IA. Either fold it into Dashboard (when you build the real one) or kill it. Don't leave it dangling.
- **The Phase 5 approval-flow code is still in `auth.js` as "Reserved for Laravel"** — leave it. Same with the inbox/pending data layer. None of it is reachable from any view but it's there for the Laravel rebuild.
- **`smoke-p6.js` uses JSDOM with `runScripts: 'dangerously'`** — that's deliberate, don't change it. Each script gets concatenated into one bundle so `const` declarations are visible across files. The `ROOT` detection auto-finds the project root whether the test lives inside or outside.
- **The Phase 6 sketch (Mia's hand-drawn diagram)** is the source of truth for IA decisions. The legend on the right side of the sketch tells you what each tab does per role. When in doubt, check the sketch.

## Budget plan

Items A and D are biggest. A is a real dashboard implementation across three
roles; D is a multi-step wizard. Budget roughly:
- A (Dashboard): 25%
- B (History/PDF): 15%
- C (Import refactor): 15%
- D (Wizard in Settings): 25%
- E (User modals): 15%  ← from Phase 5 carry-over
- F (Empty state): 5%
- G (Smoke extension): bundled with each item above

If you hit ~60% used and you're still on items A-D, **STOP** and write a fresh
handoff. Don't push partial work — Mia's dev needs whole, working slices.
