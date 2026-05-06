# ProdLabs · Chargebacks911

Internal team productivity platform — managers track work-unit output (chargebacks worked, alerts resolved, sales calls, etc.) for their teams, see real-time goal progress, and review historical trends.

This repository is a **vanilla HTML/CSS/JS prototype** built to validate the product, design system, and user flows before the production rebuild. It is fully functional with `localStorage` persistence and is meant to run by opening `index.html` directly or via any static file server.

## Table of contents

- [Status](#status)
- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [The three roles](#the-three-roles)
- [Companion docs](#companion-docs)
- [What is prototype-only](#what-is-prototype-only)
- [Conventions](#conventions)

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Auth, wizard, super admin view, basic manager/member views | ✅ Shipped |
| 2 | Manager view polish: charts, leaderboards, drill-down, filters | ✅ Shipped |
| 3 | Refactor for handoff + CSV import + edit/delete + member view polish + docs | ✅ Shipped (this commit) |
| 4 | Production rebuild on real backend | 🚧 Dev team |

## Quick start

```bash
git clone https://github.com/miaconcettacardone-ui/prodlabs-cb911.git
cd prodlabs-cb911
open index.html         # macOS — opens in default browser
# or:
python3 -m http.server  # then visit http://localhost:8000
```

No build step. No `npm install`. The only external dependency is Chart.js, loaded from cdnjs. Everything else is plain ES2017 JavaScript.

The first time you load the app it will walk you through creating a super admin (the bootstrap flow). After that, sign out and try signing up as a manager — the request will appear in the super admin's Approvals queue.

## Project layout

```
prodlabs-cb911/
├── index.html                # entry point; loads scripts in dep order
├── README.md                 # you are here
├── SPEC.md                   # feature spec, business rules, decisions
├── DATA_MODEL.md             # entities, relationships, schema
├── PERMISSIONS.md            # 3-tier auth matrix, approval flows
│
├── css/
│   ├── styles.css            # design tokens (CSS variables) + base components
│   └── app.css               # page-specific styles (wizard, topbar, tabs, etc.)
│
└── js/
    ├── config.js             # ⭐ ALL TUNABLES — change values here, not in views
    ├── utils.js              # tiny helpers: toast, modal, icons, dates, formatting
    ├── library.js            # static config: work units, fields, departments, roles
    ├── state.js              # data model + localStorage persistence
    ├── auth.js               # auth/approval logic (Auth.approve, Auth.deny, etc.)
    ├── charts.js             # Chart.js builders (trend, byWorkUnit, byMember, dayOfWeek)
    ├── analytics.js          # pure data helpers: leaderboards, period bucketing, filters, sort
    ├── csv.js                # CSV/TSV paste-import: parse + validate + commit
    ├── app.js                # router (routes between landing/auth/wizard/app)
    └── views/
        ├── landing.js        # logged-out landing page
        ├── auth.js           # sign in / sign up
        ├── wizard.js         # team setup wizard (manager flow)
        ├── super.js          # super admin dashboard
        ├── manager.js        # manager dashboard (Phase 2 polished)
        └── member.js         # team member dashboard (Phase 3 polished)
```

### Module dependency order

The scripts in `index.html` are loaded in this order. Modules are IIFEs that depend on globals defined by earlier modules:

```
config.js
  ↓
utils.js → library.js → state.js → auth.js
  ↓
charts.js → analytics.js → csv.js
  ↓
views/landing.js → views/auth.js → views/wizard.js
  → views/super.js → views/manager.js → views/member.js
  ↓
app.js                 (router, depends on all views)
```

When the dev team rebuilds, this dependency tree maps cleanly onto modules / packages / services.

## The three roles

| Role | What they see | What they can do |
|---|---|---|
| **Super Admin** | Company-wide: all teams, all managers, all members, all records | Approve manager signups; manage other super admins; configure approval flow |
| **Manager** | Their team only: members, records, goals, analytics | Approve member signups; log work for any member; bulk import records; edit/delete records; set team config |
| **Member** | Their own data only: own records, own goals | Log own work; edit own records (delete only if `CONFIG.FEATURES.memberSelfDelete` is enabled) |

Full role × action × condition matrix is in [PERMISSIONS.md](./PERMISSIONS.md).

## Companion docs

- **[SPEC.md](./SPEC.md)** — features, screens, user flows, business rules, edge cases, decisions made and why, what's deliberately out of scope
- **[DATA_MODEL.md](./DATA_MODEL.md)** — every entity, every field, relationships, the suggested Postgres schema, indices, migration path from `localStorage` JSON
- **[PERMISSIONS.md](./PERMISSIONS.md)** — the auth/permission matrix, approval workflows, edge cases (last super admin, orphaned teams, team transfer, member email change, etc.)

## What is prototype-only

These exist for the prototype and **must be replaced** before production:

| Concern | Prototype | Production |
|---|---|---|
| Persistence | `localStorage` (single-browser) | Postgres (or whatever the dev team picks) |
| Auth | passwords stored in plaintext in `state.js` | bcrypt/argon2 hashes; sessions; CSRF |
| Approvals | inline mutation of `state.pending` array | event log + transactional state machine |
| File I/O | none (CSV is paste-only) | upload + parse server-side; large file streaming |
| Email | none (approvals never send notifications) | transactional email (e.g. Postmark, SES) |
| Multi-company | hardcoded to one company in `CONFIG.BRAND` | proper tenant isolation |
| Time zones | local browser TZ via `Utils.todayISO()` | per-company TZ + per-user TZ; week-start configurable |
| Audit trail | none | who-did-what-when on every mutation |

The prototype is intentionally permissive about these so it can demonstrate the user flows. **Do not ship the prototype.** It exists to communicate the design.

## Conventions

### Files & modules
- Each module is an IIFE returning a public object: `const Foo = (() => { ... return { publicFn }; })();`
- One module per concern: state, auth, charts, analytics, csv, etc.
- Views never reach into each other — they navigate via the router (`Router.go(...)`).

### Styling
- Use CSS variables (`var(--cb-red)`, `var(--ink)`) — never hard-code colors in JS or CSS rules.
- Define new utilities in `css/app.css` under the appropriate section header.
- Avoid inline `style="..."` for static values. Inline is fine for **dynamic** values like progress-bar widths.

### Data
- All record fields go through `LIBRARY.fieldDef(id)` so types and labels are consistent.
- Member references are by **email** (the unique key). Display names are denormalized for UI.

### CONFIG
- Any "magic number" you'd want to tune later goes in `js/config.js`. Examples: trend chart days, leaderboard size, table row caps, debounce ms.

### Feature flags
- `CONFIG.FEATURES.X` toggles features. Useful for soft-launching changes or hiding partially-built things from production.
