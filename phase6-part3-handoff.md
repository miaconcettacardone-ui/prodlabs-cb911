# Phase 6 — Continuation handoff (after part 3)

## Where we are

I'm Mia. The previous Claude shipped **Phase 6 part 3** today: the team-setup
wizard, now living inside the Settings tab. You're picking up the rest.

Repo: `https://github.com/miaconcettacardone-ui/prodlabs-cb911`. Mac, MAMP at
`/Applications/MAMP/htdocs/cb911-prodlabs/`, served at
`http://localhost:8888/cb911-prodlabs/`. Sync after a build:

```
rsync -a --delete --exclude='.git' --exclude='node_modules' /tmp/p8/ . && \
git add -A && git commit -m "..." && git push && \
rsync -a --delete ~/Projects/prodlabs-cb911/ /Applications/MAMP/htdocs/cb911-prodlabs/
```

Read `phase5-handoff.md`, `phase5-continuation-handoff.md`, and
`phase6-part2-handoff.md` for prior context. **Don't re-derive decisions.**

---

## What's shipped on main

### Phase 5 + Phase 6 parts 1, 2, 3 — all on main

**Phase 5:** username login, palette swap, no self-signup, etc.

**Phase 6 part 1:** two-column login, 8-tab IA for admin/manager (Dashboard | Stats | Teams & Goals | Import | History | Users | Messages | Settings), 6-tab IA for members (no Stats, no Users), Dashboard/Import/History stubs.

**Phase 6 part 2:** unified "+ Add User" modal on admin Users tab (handles all three roles via role picker, manager-flow includes "create new team" sub-flow with new-department support), Edit + Delete buttons on every user row, `State.updateTeam()` added.

**Phase 6 part 3 — THIS zip (`prodlabs-cb911-phase6-part3.zip`):**
- New module `js/views/wizard-settings.js` exposes `WizardSettings.open(opts)`. Opens a 6-step modal wizard for configuring a team:
  1. **Team basics** — name + department (with "Other" → free-text, persists via `State.addDepartment`)
  2. **Work units** — multi-select from `LIBRARY.workUnits` plus "Add custom" input
  3. **Tracked fields** — multi-select from `LIBRARY.fields`
  4. **Roles** — multi-select from `LIBRARY.roles` plus "Add custom"
  5. **Goals** — daily target per work unit (number input)
  6. **Review** — summary of all picks, then "Save team" commits via `State.addTeam` or `State.updateTeam`
- **Two modes:** `'admin'` (can target existing team or create new) and `'manager'` (locked to caller's own team).
- **Cancel safety:** all draft state is held in module-local memory. Cancelling at any step persists nothing — no orphan empty teams from create-then-bail flows.
- **Admin Settings tab** has a new "Team Setup" card with a team-selector dropdown + "Launch Setup Wizard" button. The dropdown defaults to "+ Create a new team" and lists all existing teams.
- **Manager Settings tab** has a new "Run Setup Wizard" / "Re-run Setup Wizard" button (label changes based on whether team is already configured) in the page header.
- New CSS in `css/styles.css`: `.modal-wide`, `.wiz-modal`, `.wiz-stepper`, `.wiz-pickgrid`, `.wiz-pick`, `.wiz-add-row`, `.wiz-goals`, `.wiz-review`. Uses burgundy for active step + selection state, matching Phase 5 palette.
- Smoke test now covers all 6 steps + cancel-mid-flow + manager pre-fill: **158/158 passing**.

---

## What's left

### Item P6-F — Manager empty-state CTA (small, do this first)
When a manager logs in to a brand-new team with `team.workUnits.length === 0`, the Dashboard / Stats / etc. tabs are mostly empty. Show a card on the Dashboard tab:

- Icon (use `flag` or `shieldStar`)
- Headline: "Welcome, [first name]!"
- Body: "Your team isn't set up yet. Configure work units, fields, roles, and goals to start tracking."
- Button: "Run Setup Wizard" → calls `WizardSettings.open({ mode: 'manager', teamId: session.team.id, onClose: ... })` directly. Don't make them click through Settings first.

In `manager.js`, replace `renderDashboardStub` with a check: if team is unconfigured, render this CTA card; otherwise render the existing dashboard stub (or whatever Dashboard work happens in P6-A). Roughly 30 lines of code. Estimate: 5%.

### Item P6-C — Real top-level Import tab
Sketch: "I = import. same for all (import area like intel pellbs)."

Currently:
- Manager `import` tab routes to `renderLog` with relabeled header.
- Member `import` tab also routes to `renderLog`.
- Super `import` is stubbed.

Real implementation: a unified Import page with two clearly separated sections:
1. **Single record** — the existing `renderLog` form, inline at top.
2. **Bulk CSV** — extract `openImportModal` from manager.js into a reusable `CSVImport.renderInline(container, team, session)` in `js/csv.js`, then render it inline (not as modal) at the bottom of the Import page.

For super admins, also add:
- **User roster import** (paste CSV → bulk-create members with role + team assigned)

Estimate: 15%.

### Item P6-A — Real Dashboard tab
Sketch: "d = dashboard (like Intelihub prod). admin = full company (filter by dep/team/user). man. = full team/dep (filter by team/user if pos). user = only self stats."

- **Admin Dashboard:** company-wide top metrics (total records this month, active users today, top team) + cross-team leaderboard + filter dropdowns (department / team / user).
- **Manager Dashboard:** team metrics + per-member leaderboard + team filter (if multi-team).
- **Member Dashboard:** the existing slim self-dashboard (already wired — `dashboard` routes to `renderOverview` for members). Just polish.

Replace `renderDashboardStub` in `super.js` and `manager.js` with real implementations. Manager's dashboard should use the empty-state CTA from item F when team is unconfigured.

Estimate: 25%.

### Item P6-B — Real History tab (PDF reports)
Sketch: "h = history. admin = full comp (monthly/bimonthly/yr report pdf). manager = same but for team(s). user = self report history."

- For now `manager.history` and `member.history` route to existing `renderActivity`/`renderHistory` (raw record tables) — fine fallback.
- Real implementation: top section with date-range pickers + "Generate Report" buttons (Monthly / Bi-monthly / Yearly) producing downloadable PDFs.
- Suggested approach: print-friendly stylesheet + `window.print()` for v1 (cleaner than jsPDF, no CDN dep). User clicks "Print to PDF" in the browser dialog.

Estimate: 15%.

### Item P6-G — Smoke test extension
After items above land, extend `smoke-p6.js`:
- Manager dashboard shows empty-state CTA when team has no work units; CTA button opens wizard
- Real Dashboard renders metric cards for each role
- History tab includes "Generate Report" button (admin/manager) or "Download my report" (member)
- Import tab shows BOTH single-record form AND bulk-CSV section inline (not modal)

Bundled with each item above; don't write standalone.

---

## Things to know about the wizard

### Module API
```js
WizardSettings.open({
  mode: 'admin' | 'manager',
  teamId: <string> | null,   // null in admin mode = "create new team"
  onClose: (savedTeamId) => { ... }  // null = cancelled
});
```

### Draft commit semantics
- Steps 1-5 only mutate the in-memory `draft` object
- Only step 6's "Save team" calls `State.addTeam` or `State.updateTeam`
- Cancel at any step = `draft` is discarded, nothing persists
- New department from step 1 is persisted via `State.addDepartment` only on final commit (step 6)

### Custom add UX
- Custom work units get IDs like `custom_my_action_name` (lowercase, underscored)
- Custom roles are stored as plain strings (no synthetic ID)
- Custom items get a "Custom" hint badge in burgundy on the picker card

### What I deliberately did NOT do
- **Did not let manager change their own team's name in the wizard step 1.** They can — the input is editable. Just flagging that this is the only place they can rename their team since the manager doesn't have a full Teams-tab. Maybe revisit when item P6-A lands.
- **Did not surface workUnitLabels editing.** The wizard preserves existing labels but doesn't let you rename library units (e.g. "Alert Handled" → "RDR Resolved"). The Team Info quick-edit on manager Settings doesn't expose this either. Defer to a future "Advanced" section.
- **Did not reassign managers via the wizard.** A new team created via admin wizard has `managerEmail: null` — the admin assigns a manager later via the Add User modal. This is intentional separation of concerns.
- **No auto-launch on first manager login.** The empty-state CTA (item F) handles this — but the CTA is one click away, not forced. Mia can change this if they want a forced first-run wizard.

### Budget plan (still valid)
- F (empty state): 5%  ← do first, smallest
- C (Import refactor): 15%
- A (Dashboard real impl): 25%
- B (History/PDF): 15%
- G (smoke test): bundled

If you hit ~60% used and you're still mid-A, **STOP** and write a fresh handoff.
