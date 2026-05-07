# Phase 5 — Continuation handoff (after partial slice)

## Where we are right now

I'm Mia. The previous Claude shipped a working partial slice of Phase 5 to
GitHub today so my dev team could keep moving. **You're picking up the
remaining items.** The repo is at
`https://github.com/miaconcettacardone-ui/prodlabs-cb911`. I'm on a Mac.
Local dev is via MAMP at `/Applications/MAMP/htdocs/cb911-prodlabs/` served at
`http://localhost:8888/cb911-prodlabs/`. After a build, sync with:

```
rsync -a --delete ~/Projects/prodlabs-cb911/ /Applications/MAMP/htdocs/cb911-prodlabs/
```

The original Phase 5 spec is in `phase5-handoff.md` (also in this repo, at the
root) — read it for design tokens, decisions, and CB911 vocabulary. **Don't
re-derive those decisions.** This document tells you what's already done
versus what remains.

---

## What's already shipped (don't redo)

These items are committed on `main` and verified by `smoke-p5.js`:

- **Item 1** — `CONFIG.FEATURES` Phase 5 flags (`selfSignup: false`,
  `approvalQueue: false`, `showEmailInRoster: true`, `multiSuperAdmin: true`,
  `memberSelfDelete: true`).
- **Item 2** — `css/styles.css` `:root` palette swapped to the locked Phase 5
  red/burgundy/black palette. Non-color tokens (radii, fonts, shadows, motion)
  preserved. Back-compat aliases (`--cb-dark`, `--cb-orange`, `--cb-gold`,
  `--pu`, etc.) kept so chart code doesn't break. `.badge-mgr` is now burgundy;
  `.pill-burg` added.
- **Item 4** — `js/library.js` reseeded with CB911 vocabulary
  (7 departments, 11 work units, 6 roles, new `outcome` enum:
  Won / Lost / Pending / Settled / Refunded / No Action).
- **Item 5** — `js/state.js` has `addDepartment(name)` (idempotent,
  case-insensitive), `getDepartments()` (merged seeded + admin-added),
  `isFirstRun()`. `defaultState.config.departments = []` for migration safety.
  `bootstrapDev()` now sets `username: 'devadmin'` and backfills it on legacy
  records.
- **Item 6** — `js/auth.js`: `tryLogin(username, password)` is now
  username-based (case-insensitive). `usernameInUse(username)` added. Approval
  functions (`requestSuperAdmin/Manager/Member`, `approve`, `deny`,
  `canApprove`) are kept as code but tagged "Reserved for Laravel".
- **Item 7** — `js/views/landing.js` rewritten. First-run bootstrap form OR
  login form, no role-pick. Dev backdoor (Shift+D / `?dev=1`) preserved and
  fixed to pass `creds.username` instead of `creds.email`.
- **Item 8** — `js/views/auth.js` deleted entirely (folded into landing).
- **Item 9** — `js/views/wizard.js` and `js/views/stepper.js` deleted.
- **Item 13** — Topbar in `js/app.js` updated: shows display name **and email**
  stacked (decision #9), with the right badge per role.
- **Item 14** — `index.html` cleaned: removed `<div id="auth">`, `<div
  id="wizard">`, the three deleted script tags. `js/app.js` Router updated:
  `VIEWS = ['landing', 'app']`, refresh listener selector matches.
- **Item 15** — covered by item 5 (the `departments: []` default merges in
  cleanly via `load()`'s spread).
- **Item 3 (partial)** — topbar (black, 56px, 2px red stripe), tabs (burgundy
  active indicator), page-header, user-row, filter-bar styles all rewritten
  in `css/app.css`. Dead AUTH and WIZARD blocks deleted. Old stepper /
  role-pick / land-cta / auth-card-wide / auth-success blocks deleted from
  the Phase 4 additions section. Inbox / roster / member-card / mini-day /
  avatar-lg / topbar-tweaks selectors **kept** (still in use).
- **Item 16 (light touch)** — Phase 5 status banner added at top of `SPEC.md`
  and `PERMISSIONS.md`. The bodies of those docs were NOT rewritten — they
  still describe Phase 4. Banners point readers to `phase5-handoff.md`.
- **Item 17** — `smoke-p5.js` lives at `/home/claude/smoke-p5.js` (ALSO copied
  into the repo zip at root). Currently passes 47/47. JSDOM-based, uses
  `runScripts: 'dangerously'` to actually execute the injected scripts.

---

## What's left to do

### Item 10 — `js/views/super.js` user-creation modals (BIGGEST)

Tabs unchanged: `Stats | Teams & Goals | Users | Inbox | Settings`.

Three new modal-driven flows on the **Users** tab:

**A. "Add Super Admin" button** (top-right of users tab) → modal asks for:
- display name
- username
- email
- password

On submit: `State.addSuperAdmin({email, username, displayName, password,
approvedBy: session.user.email})`. Toast + re-render.

Validate: `Auth.usernameInUse(username)` and `State.emailInUse(email)`.
Password must meet `CONFIG.PASSWORD_MIN_LENGTH`.

**B. "Add Manager" button** → modal asks for display name, username, email,
password, plus team selection. Team selection has TWO options:

- **Pick existing team** (radio) — dropdown of teams that don't currently
  have a manager (filter: `!t.managerEmail`).
- **Create new team** (radio) — fields for team name + department (department
  is a dropdown of `State.getDepartments()` plus an "Other (type below)"
  option that reveals a text input). When "Other" is used, on submit call
  `State.addDepartment(typedName)` to add it to the global list, then create
  the team via `State.addTeam({name, department, managerEmail: email,
  workUnits: [], workUnitLabels: {}, fields: [], roles: [], goals: {}})`.

Then `State.addManager({email, username, displayName, password, teamId,
approvedBy: session.user.email})`.

**C. "Add Member" button** → modal asks for display name, username, email,
password, team (dropdown of all teams), role on team (dropdown of
`LIBRARY.roles`). On submit: `State.addMember({email, username, displayName,
password, teamId, role, approvedBy: session.user.email})`.

For each user row in the existing user list, add an **Edit** button that
opens a similar modal pre-filled, plus a **Delete** button (with the existing
safeguards — can't delete last super admin, etc.). Use `State.updateUser` and
`State.deleteUser`.

The Teams & Goals tab gets a **"+ New Team"** button at the top. Same dialog
as the manager-create's "create new team" sub-flow, but without forcing a
manager assignment (admin can create empty teams).

**Don't repaint the whole super.js** — additive edits via `str_replace` to
add the modal HTML/handlers and the new buttons. Reuse existing `.modal-overlay`
/ `.modal` styles in `styles.css` (already there, palette-aware).

### Item 11 — `js/views/manager.js` first-time experience

When a manager logs in and `session.team` is null OR the team has no work units
configured:

```
Empty card filling the main area:
  Icon (shield or settings)
  H2: "Welcome, [first name]!"
  P: "Your team isn't set up yet. Click below to configure your work units, fields, roles, and goals."
  Button: "Set up your team" → opens existing settings panel (Settings tab)
```

If team exists and is configured, show normal manager dashboard.

The "Set up your team" button just routes to the Settings tab. Verify that
panel can edit team name+department, work units, fields, roles, goals. If
the wizard had logic the settings panel doesn't, port it over (workUnitLabels
overrides especially).

### Item 12 — `js/views/member.js` light verify

Already in good shape from Phase 4. Just verify:
- Roster (Users tab) shows email next to display name (gated by
  `CONFIG.FEATURES.showEmailInRoster` — already true).
- Leaderboard (Stats tab) shows email next to display name.
- All visual classes match the new palette (mostly auto-handled).

If `member.js` references `--pu` or `--cb-gold` directly, those still resolve
via back-compat aliases in `styles.css`, so no action needed unless you want
to clean them up.

### Item 16 (full version, optional) — SPEC.md / PERMISSIONS.md rewrites

The current banners are good for "today shipping". If time permits, do the
proper rewrites the original handoff specifies (rewrite §2/§3/§4 of SPEC.md,
update §1/§2/§4 of PERMISSIONS.md). Brief edits — don't rewrite the whole
files.

### Item 17 — extend smoke-p5.js once items 10/11 land

Current test verifies items 1-9, 13-15. After item 10/11, add:
- "Add Manager / Add Member / Add Super Admin" button selectors present on
  super view's Users tab
- Manager view with `team=null` shows "Set up your team" button
- Manager view with configured team shows normal dashboard (no setup CTA)
- Member view renders with 6 tabs unchanged

The test runner pattern is solid — JSDOM with `runScripts: 'dangerously'`,
bundle all scripts as one big concatenated `<script>` so const declarations
are visible. Don't change that infrastructure.

### Item 18 — final zip + push

Same pattern as before:

```
cd ~/Projects/prodlabs-cb911 && \
rm -rf /tmp/p5 && \
unzip -o ~/Downloads/prodlabs-cb911-phase5*.zip -d /tmp/ && \
cp -r /tmp/p5/* . && \
git add -A && \
git commit -m "Phase 5 part 2: super-admin user creation, manager empty state, smoke test" && \
git push && \
rsync -a --delete ~/Projects/prodlabs-cb911/ /Applications/MAMP/htdocs/cb911-prodlabs/
```

---

## Things to know

- **Email is still stored on every user record.** Username is the login key,
  but email lives on for password reset / future Laravel auth + roster
  display (decision #9). Don't drop email anywhere.
- **`State.findUserByEmail` is still in the public API** and used by
  `super.js` and `manager.js` for record-author lookups. Don't remove it.
- **Phase 4 inbox / pending data may still be in users' localStorage.**
  That's fine — the inbox view will surface old approve/deny buttons but
  no new pending records can be created in Phase 5. Not a regression.
- **`CONFIG.CHART_PALETTE_VARS` still references `--cb-orange`, `--pu`,
  `--cb-gold`.** Those resolve via back-compat aliases (purple → burgundy).
  If you want chart colors to use the locked Phase 5 palette specifically,
  edit that array in `js/config.js`.
- **Run the smoke test before pushing:** `node smoke-p5.js`. It lives at
  the repo root in this zip. JSDOM is required (`npm install jsdom` if not
  already present).

## Critical budget plan

Items 10 and 11 are the meat. Item 10 alone is ~20% of total Phase 5 effort
in the original budget plan. Be disciplined:
- Read super.js ONCE, do all modal additions in one or two large
  `str_replace` blocks.
- Reuse the existing `.modal-overlay` / `.modal` infrastructure — don't
  invent new modal CSS.
- Item 11 should be small — empty-state card + button that switches to
  the existing Settings tab.

If you hit ~60% used and you're still on item 10, STOP and write another
fresh handoff. Don't push partial work.
