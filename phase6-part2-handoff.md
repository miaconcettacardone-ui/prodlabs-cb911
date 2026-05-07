# Phase 6 — Continuation handoff (after part 2)

## Where we are

I'm Mia. The previous Claude shipped **Phase 6 part 1** (login redesign + new
8-tab IA per my hand-drawn sketch) and now **Phase 6 part 2** (unified Add
User modal so super admins can create managers, members, and other super
admins from inside the app). You're picking up from here.

Repo: `https://github.com/miaconcettacardone-ui/prodlabs-cb911`. Mac, MAMP at
`/Applications/MAMP/htdocs/cb911-prodlabs/`, served at
`http://localhost:8888/cb911-prodlabs/`. Sync after a build:

```
rsync -a --delete --exclude='.git' --exclude='node_modules' /tmp/p7/ . && \
git add -A && git commit -m "..." && git push && \
rsync -a --delete ~/Projects/prodlabs-cb911/ /Applications/MAMP/htdocs/cb911-prodlabs/
```

Read `phase5-handoff.md`, `phase5-continuation-handoff.md`, and the older
`phase6-handoff.md` (in this zip) for prior context. **Don't re-derive
decisions** — they're locked.

---

## What's shipped on main as of this handoff

### Phase 5 (already on main)
- Self-signup gone, username login, palette swap, restyled topbar, etc. See `phase5-continuation-handoff.md`.

### Phase 6 part 1 (already on main)
- Two-column login layout with value-prop bullets (per Mia's sketch's left panel).
- 8-tab IA for admin/manager: `Dashboard | Stats | Teams & Goals | Import | History | Users | Messages | Settings`.
- 6-tab IA for members: `Dashboard | Goals | Import | History | Messages | Settings` (no Stats, no Users — per sketch legend).
- Stub renders for Dashboard / Import / History (real implementations are P6 part 3 work).
- New icons in `js/utils.js`: `dashboard`, `history`, `message`, `flag`.

### Phase 6 part 2 (THIS zip — `prodlabs-cb911-phase6-part2.zip`)
- **Unified Add User modal** in `js/views/super.js` (`openUserModal`, `submitUserModal`):
  - Single "+ Add User" button on the admin Users tab
  - Role picker drives field visibility (Member / Manager / Super Admin)
  - **Member flow:** team dropdown + role dropdown (uses `LIBRARY.roles`)
  - **Manager flow:** existing-team dropdown OR create-new-team sub-flow with team name + department picker (department dropdown includes "Other" → free-text input that gets registered via `State.addDepartment()` for future use)
  - **Super Admin flow:** identity fields only
- **Edit / Delete buttons** on every user row (with safeguards: can't delete self, can't delete the last super admin)
- **Edit modal** = same modal in edit mode. Email is locked (use delete-and-recreate to change). Role is locked. Manager's team can't be changed via edit (use Teams tab — but that flow doesn't exist yet, see below).
- **`State.updateTeam(teamId, patch)`** added to state.js. Used to stamp `managerEmail` onto a team when a new manager is assigned, and to unstamp it when a manager is deleted.
- Smoke test now covers all three add flows + validation: **123/123 passing**.

---

## What's left

### Item P6-C — Real top-level Import tab
Sketch: "I = import. same for all (import area like intel pellbs)."

Currently:
- Manager `import` tab routes to `renderLog` with a relabeled header.
- Member `import` tab also routes to `renderLog`.
- Super `import` is stubbed.

Real implementation: a unified Import page with two clearly separated sections:
1. **Single record** — the existing `renderLog` form.
2. **Bulk CSV** — the existing CSV paste-and-validate flow, but **inline on the page** (not as a modal). Reuse `CSVImport.parse()` from `js/csv.js`.

For super admins specifically, also expose:
- **User roster import** (paste CSV of users to bulk-create)
- (Defer team-config import for now)

The existing `openImportModal` in manager.js has the working CSV preview/validate logic — extract it into a reusable function in `js/csv.js` and call from both manager + super pages.

### Item P6-D — Wizard back, inside Settings
Sketch sidenote: "Add: team-set up. under settings for admin/man. wizard walkthrough to create other pgs/users/reports/etc."

A multi-step inline wizard inside the **Settings tab**, available to admin and manager only. Steps (admin):
1. Team basics (name, department w/ "Other" → `State.addDepartment()`)
2. Work units (pick from `LIBRARY.workUnits`, optional custom add)
3. Fields (pick from `LIBRARY.fields`)
4. Roles (pick or add team roles)
5. Goals (initial goal counts per period)
6. Members (bulk-add or skip — defer to Add User modal which now exists)
7. Done (summary + "Open team" button)

For managers: same wizard scoped to their team only, no team-creation step.

The deleted `js/views/wizard.js` file from Phase 5 had a working multi-step wizard. **Don't restore it as a top-level view** — make it a Settings sub-flow. Crib heavily from the deleted file's structure (find it in git history before the Phase 5 push). The Add User modal in `super.js` is a good reference for in-modal sub-flow patterns (the "create new team" branching inside Add Manager).

### Item P6-A — Real Dashboard tab
Sketch: "d = dashboard (like Intelihub prod). admin = full company (filter by dep/team/user). man. = full team/dep (filter by team/user if pos). user = only self stats."

- **Admin Dashboard:** company-wide top metrics + cross-team leaderboard + filter dropdowns (department / team / user)
- **Manager Dashboard:** team metrics + per-member leaderboard + optional team filter
- **Member Dashboard:** existing slim self-dashboard (already wired — `dashboard` routes to `renderOverview` for members). Just polish.

Replace `renderDashboardStub` in `super.js` and `manager.js` with real implementations.

### Item P6-B — Real History tab (PDF reports)
Sketch: "h = history. admin = full comp (monthly/bimonthly/yr report pdf). manager = same but for team(s). user = self report history."

- For now `manager.history` and `member.history` route to existing `renderActivity`/`renderHistory` (raw record tables) — that's a fine fallback.
- Real implementation: top section with date-range pickers + "Generate Report" buttons (Monthly / Bi-monthly / Yearly) producing downloadable PDFs.
- Suggested: **jsPDF** via CDN, or just a print-friendly stylesheet + `window.print()` for v1 (cleaner).

### Item P6-F — Manager empty-state CTA
When a manager logs in to a brand-new team with no work units configured, show a card directing them to Settings → Team Setup wizard (item P6-D). See `phase5-continuation-handoff.md` for the original spec.

### Item P6-G — Smoke test extension
After items above land, extend `smoke-p6.js`:
- Real Dashboard renders metric cards for each role
- History tab includes "Generate Report" button (admin/manager) or "Download my report" (member)
- Import tab shows BOTH single-record form AND bulk-CSV section inline (not modal)
- Settings → Wizard launches and step 1 is reachable
- Manager empty-state shows CTA when team has no work units

---

## Things to know

### About the Add User modal
- Role picker is locked to current value when editing. To switch a user's role, delete and recreate.
- Email is locked when editing. Username + display name + password are editable.
- When creating a manager assigned to an *existing* team, the team's `managerEmail` field is overwritten via `State.updateTeam()`. That's fine because the existing-team dropdown filters out teams that already have a manager (UNLESS we're editing — see code).
- Department "Other" path persists the new department name via `State.addDepartment()` so it shows in future dropdowns.
- `Auth.usernameInUse()` and `State.emailInUse()` both check across all three role lists + pending records.

### Defaults
- Default role in the modal is `member` (most common operation).
- Manager team mode defaults to "Pick existing team."

### CSS additions in part 2
- `.u-uname` — small mono pill showing `@username` next to display name on user rows
- `.radio-group` — used inside the Add User modal for the "existing vs new team" toggle

### What I deliberately did NOT do
- **Did not surface user creation to managers.** Sketch implies admin-only ("U: admin = see all users; same for man." — managers SEE users but the create button is admin-only). If you want managers to be able to add members to their team, mention it to Mia first.
- **Did not add a manager-team-reassignment flow** to the edit modal. Currently editing a manager updates only their identity fields. Reassigning team is Teams-tab-territory and that flow needs design work first.
- **Did not refactor the manager-side roster** (manager.js `renderTeam`). It already has its own member-management UI; merging it into the new Users-tab pattern is a separate cleanup.

## Budget plan (from previous handoff, still valid)
- C (Import refactor): 15%
- D (Wizard in Settings): 25%  ← biggest remaining item
- A (Dashboard real impl): 25%
- B (History/PDF): 15%
- F (Empty state): 5%
- G (Smoke test): bundled with each

If you hit ~60% used and you're still on items C/D, **STOP** and write a fresh
handoff. Mia's dev needs whole, working slices, not partial work.
