# Handoff: Phase 5 — CB911 redesign (visual + UX overhaul, drop self-signup)

## Context

I'm Mia, working on a vanilla HTML/CSS/JS prototype for Chargebacks911 that will be handed to a Laravel dev team. The repo is at `https://github.com/miaconcettacardone-ui/prodlabs-cb911`. I'm on a Mac. Local dev is via MAMP at `/Applications/MAMP/htdocs/cb911-prodlabs/` served at `http://localhost:8888/cb911-prodlabs/`. After a build, sync with:

```
rsync -a --delete ~/Projects/prodlabs-cb911/ /Applications/MAMP/htdocs/cb911-prodlabs/
```

Phases 1–4 are on `main`. Phase 4 added: 7-step manager signup wizard, role-pick screen, universal Inbox tab, Phase 4 visual additions, dev backdoor (Shift+D / `?dev=1` → devadmin@prodlabs.dev / d3ve1opment!).

**Phase 5 is a substantial redesign.** We're throwing out the self-signup flow entirely and restyling the whole app to look polished and professional. The reference design is the Intelihub HTML at `/mnt/user-data/uploads/Screenshot_2026-05-07_at_07_51_55.png` flow — internal productivity platform, dark topbar, clean cards, dense data display. The visual style we want is similar BUT with a CB911 red/burgundy palette, NOT Intelihub's purple.

## Architecture rule (non-negotiable)

**Keep the modular file structure.** Do NOT collapse into a single HTML file like the Intelihub reference. Each module stays an IIFE in its own file under `js/` or `js/views/`. AGENTS.md conventions still apply. CSS variables only. Heavy comments are NOT required — brief but clear comments are preferred. The Laravel team needs files they can navigate.

## Tech rules (from AGENTS.md, on `main`)

- Vanilla HTML/CSS/JS, no build step, no frameworks. CSS variables only.
- Every JS module is an IIFE: `const X = (() => { ... return {...}; })();`.
- All tunables in `js/config.js`. Feature flags under `CONFIG.FEATURES.*`.
- Email is the unique key for users. Members referenced by email everywhere.
- Brief comments — explain non-obvious decisions, not obvious ones.
- Run smoke test before declaring done.

---

## Design tokens (LOCKED — write these into css/styles.css :root)

Replace the existing `:root` color variables with these. Keep all non-color tokens (radii, shadows, font stacks) unchanged.

```css
:root {
  /* Brand */
  --cb-red:        #E8192C;  /* primary action, brand */
  --cb-red-dk:     #c0121f;  /* hover state on primary */
  --cb-red-lt:     #fff0f1;  /* tinted backgrounds, alerts */
  --cb-red-mid:    #ffd6d9;  /* borders on tinted areas */

  --cb-burgundy:   #8B1E2D;  /* secondary accent, active states, badges */
  --cb-burgundy-lt:#f5e6e9;  /* tinted bg for burgundy zones */
  --cb-burgundy-md:#d9b3ba;  /* borders */

  /* Structure */
  --ink:           #000000;  /* topbar bg, primary text */
  --ink-2:         #1a1a1a;  /* secondary dark surfaces */
  --ink-3:         #2a2a2a;  /* tertiary dark */
  --i2:            #4c4469;  /* secondary text */
  --i3:            #8b7db8;  /* tertiary/muted text */
  /* NOTE: i2/i3 are kept for backward compat; gradually migrate to --mut */
  --mut:           #6b6b78;  /* preferred muted text token going forward */

  --bg:            #fdf8f8;  /* page bg, very pale red-tinted neutral */
  --sur:           #ffffff;  /* card/surface bg */
  --s2:            #faeeef;  /* secondary surface (e.g. hover row) */
  --bor:           #ead8da;  /* default border */
  --bor-strong:    #d6b8bc;  /* emphasized border */

  /* Status */
  --gr:            #16a34a;  /* success */
  --grd:           #dcfce7;
  --am:            #d97706;  /* warning */
  --amd:           #fef3c7;
  --bl:            #2563eb;  /* info */
  --bld:           #dbeafe;

  /* Radii / shadows / type */
  --r-sm: 6px;
  --r:    10px;
  --r-md: 12px;
  --r-lg: 16px;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

**Topbar accent:** topbar bg = `var(--ink)` (pure black). Underline it with a 2px stripe of `var(--cb-red)`. NOT burgundy, NOT purple — bright red for the stripe.

**Active tab indicator:** `var(--cb-burgundy)` for the bottom border + text color of the active tab. Inactive tabs use `var(--mut)`.

**Primary buttons:** red. **Secondary/accent badges:** burgundy. **Brand badges (you/me/admin):** red.

---

## Decisions made (don't re-ask me)

1. **No self-signup.** Landing page = login form only. Plus a tiny first-run check: if no super admin exists, show a one-time "create the platform owner" form. After that, never shown again.
2. **Dev backdoor stays.** Shift+D / `?dev=1` → devadmin login. Same as Phase 4.
3. **Login: username + password.** Each account also has an email (for future password reset / Laravel auth). Username is what they type on the login screen. Email is shown next to display name everywhere.
4. **Multiple super admins, all equal.** No owner hierarchy. Any super admin can add/edit/remove any other.
5. **Departments: pre-seeded list with "Other" escape hatch.** When admin picks "Other," they type a new department name and it gets added to the global department list (so future teams can pick it from the dropdown).
6. **Pre-seeded departments:** Alerts, Disputes/Operations, Sales, Reporting/Analytics, Dev/Engineering, Finance, Customer Success.
7. **Super admin creates managers and members directly.** No approval queue. No pending records. The whole `state.pending` system can stay in code (Laravel will use it later) but no UI surfaces it for now.
8. **First-time manager experience:** empty dashboard with a prominent "Set up your team" button that opens a settings panel. Same panel admins use to edit teams. NOT a multi-step wizard.
9. **Member visibility:** display name + email visible to everyone (roster, leaderboard, etc.).
10. **Boundaries:** members log own work, edit own entries, see own stats/goals, edit own profile. Cannot reassign themselves, cannot see other members' individual records (only aggregate counts on leaderboard).

---

## CB911 vocabulary

The seed `LIBRARY` should ship with department-flavored work units and field defaults. Replace the medical-claims-flavored defaults with these.

### Pre-seeded departments (LIBRARY.departments)
```js
['Alerts', 'Disputes & Operations', 'Sales', 'Reporting & Analytics', 'Dev & Engineering', 'Finance', 'Customer Success']
```

### Pre-seeded work units (LIBRARY.workUnits)
```js
[
  { id: 'alert_handled',  label: 'Alert Handled',     hint: 'Verifi/Ethoca alerts processed' },
  { id: 'dispute_filed',  label: 'Dispute Filed',     hint: 'Chargeback responses submitted' },
  { id: 'case_resolved',  label: 'Case Resolved',     hint: 'Cases closed (won/lost/settled)' },
  { id: 'lead_contacted', label: 'Lead Contacted',    hint: 'Sales outreach' },
  { id: 'deal_closed',    label: 'Deal Closed',       hint: 'New client signed' },
  { id: 'report_built',   label: 'Report Built',      hint: 'Client report delivered' },
  { id: 'ticket_closed',  label: 'Ticket Closed',     hint: 'Engineering ticket completed' },
  { id: 'invoice_sent',   label: 'Invoice Sent',      hint: 'Billing record created' },
  { id: 'payment_processed', label: 'Payment Processed', hint: 'Payment recorded/applied' },
  { id: 'check_in',       label: 'Client Check-in',   hint: 'CS touchpoint completed' },
  { id: 'escalation',     label: 'Escalation Resolved', hint: 'Client escalation closed' },
]
```

### Pre-seeded fields (LIBRARY.fields)
Keep existing field definitions (amount, outcome, etc.) but change the default `outcome` enum options to:
```js
['Won', 'Lost', 'Pending', 'Settled', 'Refunded', 'No Action']
```

Add a new field:
```js
{ id: 'card_network', label: 'Card Network', type: 'enum', options: ['Visa', 'Mastercard', 'Amex', 'Discover', 'Other'], hint: 'Card brand' }
{ id: 'merchant',     label: 'Merchant',     type: 'text', hint: 'Merchant or client name' }
{ id: 'reason_code',  label: 'Reason Code',  type: 'text', hint: 'e.g. 4855, 10.4' }
```

### Pre-seeded roles per team (LIBRARY.roles)
```js
['Analyst', 'Senior Analyst', 'Coordinator', 'Specialist', 'Lead', 'Manager']
```

---

## Architecture changes

### Files to ADD
- None. All new functionality fits inside existing modules.

### Files to MODIFY (high level — exact changes specified per item below)
- `css/styles.css` — replace `:root` palette
- `css/app.css` — substantial restyle. Topbar, tabs, cards, metrics, tables, pills, modals.
- `js/config.js` — update FEATURES flags (new ones below)
- `js/state.js` — `bootstrapDev` already exists, keep. Add `addDepartment(name)`, `getDepartments()`. Add `firstRunComplete()` check.
- `js/library.js` — replace seed values with CB911 vocab above
- `js/auth.js` — keep `tryLogin` and `logout`. Lookup is now by USERNAME (case-insensitive) primarily, but email still stored for future. `requestSuperAdmin/Manager/Member` and `approve/deny` can stay as dead code (Laravel will reactivate). Just don't expose them in views.
- `js/views/landing.js` — strip everything. Landing = login form. If `!Auth.isBootstrapped()`, show first-run form instead.
- `js/views/auth.js` — collapse to one mode: `signin`. Drop `rolepick` and `signup-*` modes entirely (delete the code, keep the file lean).
- `js/views/wizard.js` — DELETE this file entirely. Team setup happens inside super.js settings.
- `js/views/stepper.js` — DELETE this file. Not needed without wizard.
- `js/views/super.js` — heavy edits. Add user creation modals (Add Manager, Add Member, Add Super Admin). Add team creation flow that lets you pick from pre-seeded departments OR type "Other." Settings tab adds department list management.
- `js/views/manager.js` — add empty-state "Set up your team" button when no team configured. Opens settings panel that lets manager configure work units / fields / roles / goals. Strip approvals tab (already done in Phase 4 — confirm Inbox stays as small surface).
- `js/views/member.js` — already in good shape from Phase 4. Light restyle only.
- `js/views/inbox.js` — simplify. With no approvals, this only shows system notifications. Optionally turn into a topbar bell dropdown instead of a tab. (For Phase 5: keep as a tab to minimize churn, but the Inbox shows fewer items and unread badge will usually be 0.)
- `js/app.js` — topbar restyle (see CSS section). Bell icon dropdown is a stretch goal; keep Inbox as tab for now.
- `index.html` — REMOVE script tags for `js/views/stepper.js` and `js/views/wizard.js`.

### Files to DELETE
- `js/views/stepper.js`
- `js/views/wizard.js`

---

## Items to do

### Item 1 — Update `js/config.js` FEATURES

Add/update these flags. Default values in parens.

```
CONFIG.FEATURES = {
  selfSignup: false,           // (false) — drives landing.js + AuthView; turning on re-enables old wizard if Laravel wants it
  approvalQueue: false,        // (false) — hides Inbox approvals UI; data layer stays
  memberSelfDelete: true,      // (existing)
  editRecords: true,           // (existing)
  showEmailInRoster: true,     // (true) — decision #9
  multiSuperAdmin: true,       // (true) — decision #4
}
```

### Item 2 — `css/styles.css` palette swap

Replace the entire `:root { ... }` block with the locked palette above. Keep everything else in styles.css unchanged for now.

### Item 3 — `css/app.css` Phase 5 visual overhaul

This is the biggest CSS task. Rewrite (or substantially edit) these sections:

- `.topbar` — bg `var(--ink)`, height 56px, 2px `var(--cb-red)` border-bottom, sticky top, z-index 200. White text. Brand on left with red shield icon.
- `.tabs` — white bg, 2px `var(--bor)` border-bottom, padding 0 1.5rem, flex layout. Inactive `.tab` = `var(--mut)`, hover = `var(--cb-burgundy)`. Active `.tab.on` = `var(--cb-burgundy)` text + 3px `var(--cb-burgundy)` border-bottom.
- `.card` — white bg, 1px `var(--bor)` border, `var(--r-md)` radius, overflow hidden. `.card-head` with bottom border, padding `0.9rem 1.25rem`.
- `.metric-grid` — auto-fit minmax(150px, 1fr). `.metric` cards with label (uppercase 11px), large value (26px bold), sub (11px muted). Variants: `.metric-r` red-tinted, `.metric-g` green-tinted, `.metric-b` blue-tinted, `.metric-burg` burgundy-tinted.
- `table` — clean, no excessive borders. Header bg `var(--bg)`, uppercase 11px labels in `--mut`. Rows hover `var(--s2)`.
- `.pill` — variants `.pill-r` red, `.pill-burg` burgundy (replaces .pill-pu purple), `.pill-g` green, `.pill-a` amber, `.pill-b` blue.
- `.btn` — primary = red bg `var(--cb-red)`, hover `var(--cb-red-dk)`. Ghost = transparent + bordered. Add `.btn-burg` variant if needed.
- `.modal-overlay` — backdrop blur, dark rgba, centered modal. Modal = white, `var(--r-md)` radius, max-width 440px, padding 2rem.
- `.empty` state — centered, large icon in muted, h3 + paragraph.
- Topbar user badge — `.badge-super` red, `.badge-mgr` burgundy, `.badge-mem` light grey/burgundy-tinted.
- Phase 4 additions block (stepper, role-pick, land-cta) at the END of app.css can be DELETED — those views are gone.

End result: when you open the app, the dark black topbar with red stripe under it, white card-based content area, burgundy tab indicator, red action buttons. Should feel similar to Intelihub but unmistakably CB911-branded.

### Item 4 — `js/library.js` reseed

Replace the `departments`, `workUnits`, `fields`, `roles` arrays with the CB911 vocabulary above. Keep the helper functions (`workUnitLabel`, `fieldDef`) unchanged.

### Item 5 — `js/state.js` additions

Add three new functions to the public API:
- `addDepartment(name)` — adds a name to a stored departments list (state.config.departments, default = LIBRARY.departments). Idempotent (no dupes).
- `getDepartments()` — returns merged list of LIBRARY.departments + state.config.departments.
- `isFirstRun()` — returns true iff state.superAdmins.length === 0 AND state.config.bootstrapped !== true.

`bootstrapDev()` already exists and is idempotent — leave alone.

### Item 6 — `js/auth.js` pruning

`tryLogin(username, password)` — change from email-based to username-based lookup. Search across `state.superAdmins`, `state.managers`, `state.members` for `u.username.toLowerCase() === norm`. Username is the new unique key for login. (Email stays on the user record but is not the login identifier.)

`requestSuperAdmin/Manager/Member`, `approve`, `deny`, `canApprove` — keep the functions but they're no longer called from any view. Add a comment at the top of each: `// Reserved for Laravel — not surfaced in Phase 5 UI.`

`isBootstrapped()` — unchanged.

Add a helper `usernameInUse(username)` that mirrors `emailInUse` but for usernames.

### Item 7 — `js/views/landing.js` rebuild

Strip the file down. Landing renders one of two things:

1. If `State.isFirstRun()`: show a "Welcome to CB911 ProdLabs — let's create the platform owner account" form. Fields: display name, username, email, password. On submit, create super admin directly (no pending), set bootstrapped flag, log them in, route to app.

2. Else: show the login form. Username + password fields. Submit calls `Auth.tryLogin`. On success → `Router.go('app')`. On failure → inline error.

Keep the dev backdoor (Shift+D / ?dev=1) untouched.

NO other CTAs on the landing page. NO "Create account" link. The whole role-pick / signup-* flow is gone.

### Item 8 — `js/views/auth.js` simplification

Delete most of this file. Keep only the `signin` mode logic. Delete `rolepick`, `signup-super`, `signup-manager`, `signup-member`, `showSuccess`. The remaining `render(opts)` only handles `signin` and the back-to-landing button.

Honestly: at this point, the auth view is so thin that the login form could move INTO landing.js and we delete `views/auth.js` entirely. Recommend doing this — one less file, simpler routing. If you do, also remove from `index.html` and from `js/app.js` Router VIEWS list.

### Item 9 — Delete wizard files

Delete:
- `js/views/wizard.js`
- `js/views/stepper.js`

Remove their `<script>` tags from `index.html`.

Remove `'wizard'` from `Router.VIEWS` in `js/app.js`.

Anywhere `Router.go('wizard', ...)` is called, replace with appropriate alternative (probably nowhere left after auth.js is simplified — verify with grep).

### Item 10 — `js/views/super.js` user-creation surfaces

Tabs stay as Phase 4: `Stats | Teams & Goals | Users | Inbox | Settings`.

Three new modal-driven flows on the **Users** tab:

A. **"Add Super Admin" button** (top-right of users tab) → modal asks for display name, username, email, password. On submit: `State.addSuperAdmin({email, username, displayName, password, approvedBy: session.user.email})`. Toast + re-render.

B. **"Add Manager" button** → modal asks for display name, username, email, password, plus team selection. Team selection has TWO options:
   - **Pick existing team** (radio) — dropdown of all teams that don't currently have a manager
   - **Create new team** (radio) — fields for team name + department (department is a dropdown of `State.getDepartments()` plus an "Other (type below)" option that reveals a text input). When "Other" is used, on submit call `State.addDepartment(typedName)` to add it to the global list, then create the team.
   On submit: create the team if needed, then `State.addManager({...})` linked to that team.

C. **"Add Member" button** → modal asks for display name, username, email, password, team (dropdown of all teams), role on team (dropdown of `LIBRARY.roles`). On submit: `State.addMember({...})`.

For each user row in the existing user list, add an "Edit" button that opens a similar modal pre-filled, plus a "Delete" button (with the existing safeguards — can't delete last super admin, etc.).

The Teams & Goals tab gets a "+ New Team" button at the top. Same dialog as the manager-create's "create new team" sub-flow, but without forcing a manager assignment (admin can create empty teams).

### Item 11 — `js/views/manager.js` first-time experience

When a manager logs in and `session.team` is null OR the team has no work units configured:

```
Empty card filling the main area:
  Icon (shield or settings)
  H2: "Welcome, [first name]!"
  P: "Your team isn't set up yet. Click below to configure your work units, fields, roles, and goals."
  Button: "Set up your team" → opens existing settings panel
```

If team exists and is configured, show normal manager dashboard.

The "Set up your team" button opens whatever settings panel currently lives in manager's Settings tab. Make sure that panel can edit:
- Team name + department
- Work units (which IDs from LIBRARY are active for this team, plus any custom ones)
- Fields (which custom fields are tracked)
- Roles (which roles team members can have)
- Goals (daily targets per work unit)

This panel mostly already exists from earlier phases — verify it's complete and reachable. If the wizard had logic the settings panel doesn't, port it over.

### Item 12 — Member view light polish

`js/views/member.js` is in good shape from Phase 4. Just verify:
- Roster (Users tab) shows email next to display name (because `CONFIG.FEATURES.showEmailInRoster === true`)
- Leaderboard (Stats tab) shows email next to display name
- All visual classes match the new palette (mostly auto-handled if app.css is updated)

### Item 13 — `js/app.js` topbar update

Topbar should match Intelihub's structural quality:
- Black bg, 56px height, sticky, z-index 200, 2px red border-bottom
- Brand on left: shield icon in red, "ProdLabs" + small "Chargebacks911" subtitle, white text
- Center spacer (flex)
- User badge (red for super, burgundy for manager, light for member)
- Display name + email in muted white
- Sign Out button (ghost-style on dark bg)

Keep the existing `roleLabel()` helper from Phase 4. Ensure email is visible alongside display name.

### Item 14 — `index.html` cleanup

- Remove `<script src="js/views/stepper.js"></script>`
- Remove `<script src="js/views/wizard.js"></script>`
- Remove `<div id="wizard"></div>` from the body
- If `views/auth.js` was deleted, remove its script tag too and remove `<div id="auth"></div>`

### Item 15 — `js/state.js` migration safety

When loading state, if it's an old Phase 4-shaped state (has pending records, no `state.config.departments`), the `defaultState` merge already handles missing fields — verify. Add `state.config.departments` as `[]` in defaultState so it merges in.

### Item 16 — SPEC.md and PERMISSIONS.md updates

SPEC.md:
- Replace §2 default flow with Phase 5 flow:
  1. First run: super admin bootstrap form
  2. Daily: log in
  3. Super admins create managers and members
  4. Managers configure their team via settings panel
  5. Members log work, see own stats
- §3: rewrite "Onboarding" entirely. Remove the old approval workflows from prose.
- §4 Approval workflow: mark as "Reserved for future. The Laravel build will re-enable signup + approval. Phase 5 ships with self-signup disabled."

PERMISSIONS.md:
- Update §1 to reflect: members visibility includes email of teammates (decision #9).
- Update §2 to remove approval-related permissions for now.
- Update §4 to confirm: super admins create users directly; no approval queue surfaced.

Brief edits — don't rewrite the whole files.

### Item 17 — Smoke test at `/home/claude/smoke-p5.js`

JSDOM-based smoke test similar to Phase 4 but updated for new shape. Must verify:

1. All JS files load without syntax errors
2. `State.isFirstRun()` returns true on fresh state, false after super admin created
3. `State.addDepartment('Underwriting')` adds to list; calling twice doesn't duplicate
4. `State.getDepartments()` includes both seeded and added departments
5. `Auth.tryLogin('devadmin', 'd3ve1opment!')` works after `State.bootstrapDev()` (NOTE: changed from email to username)
6. Landing renders without error (both first-run and login modes)
7. Super view renders and shows Add Manager / Add Member buttons (data-action selectors)
8. Manager view with empty team shows "Set up your team" button
9. Manager view with configured team shows normal dashboard (no setup CTA)
10. Member view renders with 6 tabs unchanged
11. No references to `Stepper`, `Wizard`, `rolepick`, or `signup-*` remain in any loaded file
12. Tab counts: Super=5, Manager=6, Member=6 (unchanged from Phase 4)

End with `console.log('ALL CLEAN')`.

### Item 18 — Zip + push

Build zip at `/mnt/user-data/outputs/prodlabs-cb911-phase5.zip` containing folder `p5/`.

Provide one-paragraph terminal command for me, same pattern as Phase 4 but with rsync to MAMP at the end:

```
cd ~/Projects/prodlabs-cb911 && \
rm -rf /tmp/p5 && \
unzip -o ~/Downloads/prodlabs-cb911-phase5*.zip -d /tmp/ && \
cp -r /tmp/p5/* . && \
git add -A && \
git commit -m "Phase 5: drop self-signup, restyle to CB911 palette, admin-creates-users flow" && \
git push && \
rsync -a --delete ~/Projects/prodlabs-cb911/ /Applications/MAMP/htdocs/cb911-prodlabs/
```

---

## Critical budget plan (READ BEFORE STARTING)

Phase 4 took 3 Claude attempts. Phase 5 has more files to delete than to write, so it should fit in one execution if you stay disciplined.

**Setup (≤5%):** ONE shallow clone, ONE copy. `git clone --depth 1 https://github.com/miaconcettacardone-ui/prodlabs-cb911.git /home/claude/work && cp -r /home/claude/work /home/claude/p5 && rm -rf /home/claude/p5/.git`.

**Items 1-6 (≤15%):** small edits to config.js, library.js, state.js, auth.js. Read each file ONCE, edit with `str_replace` blocks. Don't re-read after edits.

**Item 7 (≤10%):** rewrite landing.js. Single `create_file` after deleting the old.

**Item 8-9 (≤5%):** simplification + deletes. If you decide to delete views/auth.js entirely (recommended), do it now. Update index.html accordingly.

**Item 10 (≤20%):** super.js modals — biggest single item. Read the existing super.js ONCE, do all modal additions in one or two large `str_replace` blocks.

**Item 11 (≤10%):** manager.js empty-state + verify settings panel completeness.

**Item 3 (≤15%):** CSS rewrite — substantial but mechanical. ONE big `str_replace` adding/replacing the relevant blocks in app.css. Don't iterate piecemeal.

**Items 13-16 (≤10%):** topbar tweak, index.html cleanup, doc updates. All small.

**Item 17 (≤10%):** smoke test. Use Phase 4's smoke-p4.js as a template — copy and modify, don't reinvent.

**Item 18 (≤5%):** zip + summary.

If you hit ~60% used and you're still on items 1-9, STOP and write a fresh handoff. Don't push partial work.

**Don't ask Mia clarifying questions.** All decisions are above. If you genuinely hit something unspecified, make a sensible choice and note it inline.

**Don't add heavy comments.** Brief comments only — explain non-obvious decisions, not obvious code.

---

## How to deliver

When everything passes the smoke test, build the zip and give me the one-paragraph terminal command. Tell me to download the zip then run the command. Don't bother with VS Code GUI instructions — terminal is faster.

Paste this entire doc into a fresh Claude chat to execute Phase 5.
