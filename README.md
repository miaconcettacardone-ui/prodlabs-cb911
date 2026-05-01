# ProdLabs · Chargebacks911

**Phase 1 prototype** — internal productivity platform for CB911.

## What this is

A configurable team productivity dashboard. Managers run a setup wizard to define their team's work units, fields, roles, and goals. Members log work against those. Super admins see everything across the whole company.

## How to run it

Open `index.html` in any modern browser. That's it. All data is stored in your browser's localStorage.

```
open index.html        # macOS
start index.html       # Windows
```

For development, you may want to serve it locally to avoid browser quirks with `file://`:

```
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Then visit http://localhost:8000

## What works in Phase 1

- 3-tier auth: Super Admin / Manager / Member with email + password
- **Approval workflow:**
  - First super admin: bootstraps automatically (becomes default approver)
  - More super admins: must be approved by designated approvers
  - Managers: approved by any super admin
  - Members: approved by their team's manager
- Full setup wizard for managers (work units, fields, roles, goals)
- Polished super-admin dashboard with overview, approvals, teams, admins, settings
- Working manager and member views (basic — Phase 2 will fully polish)
- CB911 brand styling: deep navy + signature red, Sora + Inter fonts

## File structure

```
prodlabs-cb911/
├── index.html              # entry point
├── css/
│   ├── styles.css         # design system (CSS variables, components)
│   └── app.css            # page-level styles (landing, wizard, app shell)
└── js/
    ├── utils.js           # toast, modal, icons, formatting helpers
    ├── library.js         # pre-built work units, fields, roles, departments
    ├── state.js           # central data model + localStorage persistence
    ├── auth.js            # login, signup requests, approval logic
    ├── app.js             # router + boot
    └── views/
        ├── landing.js     # public entry page (3 doorways)
        ├── auth.js        # login + member signup
        ├── wizard.js      # multi-step setup for super/manager
        ├── super.js       # super admin dashboard (POLISHED)
        ├── manager.js     # team manager dashboard (Phase 2 to polish)
        └── member.js      # team member dashboard (Phase 2 to polish)
```

## What's coming in later phases

- **Phase 2:** Manager polish — Chart.js charts, leaderboards, daily goal tracking, etc.
- **Phase 3:** CSV paste import, edit/delete records, filters & search, member view polish.
- **Phase 4:** Full developer handoff docs (SPEC.md, DATA_MODEL.md, PERMISSIONS.md).

## Notes for the dev team

This is a **prototype** intended to demonstrate the structure, flows, and design. Production version should:

- Replace localStorage with a real database (Supabase recommended — same shape).
- Replace plaintext password compare with proper auth (Supabase Auth).
- Add real email notifications for approvals.
- Add server-side enforcement of all RBAC rules (currently client-side only).
- Audit log all sensitive actions (approvals, deletions, role changes).

The data model in `state.js` and the permission rules in `auth.js` are designed to map cleanly onto a Supabase schema.

---

© 2026 Chargebacks911 · Internal use
