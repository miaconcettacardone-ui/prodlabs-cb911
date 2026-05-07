# SPEC.md — ProdLabs Feature Specification

> **Phase 5 status (May 2026):** The prototype no longer exposes self-signup or
> the approval queue. New flow:
>   1. **First run:** the landing page shows a "create platform owner" form. Submitting it creates the first super admin directly.
>   2. **Daily:** users sign in with **username + password** (email is stored on every record but is no longer the login key).
>   3. **Super admins create managers and members directly** via in-app modals (no approval queue surfaced).
>   4. **Managers configure their team** via the Settings tab on the manager dashboard (no multi-step wizard).
>   5. **Members log work and see their own stats.**
>
> Sections 3 (Onboarding) and 4 (Approval workflow) below describe the **legacy
> Phase 4 design**. The data-layer plumbing for approvals (`state.pending`,
> `Auth.requestSuperAdmin/Manager/Member`, `Auth.approve/deny`) is intentionally
> kept in code so the Laravel rebuild can re-enable signup. In Phase 5 these
> code paths are not reachable from any view; the relevant feature flags are
> `CONFIG.FEATURES.selfSignup = false` and `CONFIG.FEATURES.approvalQueue = false`.
>
> See `phase5-handoff.md` for the full rationale.

This document specifies what the production app should do. The prototype in this repo is a working reference implementation — when behavior in this doc and the prototype disagree, **this doc wins** (the prototype may have rough edges; this doc is what we want).

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [Roles & high-level flows](#2-roles--high-level-flows)
3. [Onboarding & bootstrap](#3-onboarding--bootstrap)
4. [Approval workflow](#4-approval-workflow)
5. [Team configuration (the wizard)](#5-team-configuration-the-wizard)
6. [Logging work](#6-logging-work)
7. [CSV bulk import](#7-csv-bulk-import)
8. [Editing & deleting records](#8-editing--deleting-records)
9. [Analytics & reporting](#9-analytics--reporting)
10. [Goals](#10-goals)
11. [Search, filter, sort](#11-search-filter-sort)
12. [Cross-cutting decisions](#12-cross-cutting-decisions)
13. [Out of scope](#13-out-of-scope)

---

## 1. Product overview

**Who it's for:** Chargebacks911 internal teams. Each team has a manager and a set of members doing repetitive work-unit-tracked tasks (working chargebacks, resolving alerts, making sales calls, etc.).

**What it does:**
- Each team member logs the work they finish (one record per item).
- The manager sees real-time dashboards: today's count, week, month, by-person leaderboards, goal hit rate, trends.
- Super admins oversee the whole company: who's a manager, who's a member, all teams.

**What it replaces:** spreadsheets. The whole product is "the spreadsheet, but with goals, structure, and a UI everyone can use."

---

## 2. Roles & high-level flows

| Role | Primary use case |
|---|---|
| **Super Admin** | Approves new manager signups; oversees all teams; manages other super admins |
| **Manager** | Owns one team; approves member signups; sets team config (work units, fields, goals); reviews analytics |
| **Member** | Logs their own work; sees their own progress against today's goals |

A user has exactly one role. A manager runs one team. A member belongs to one team.

### Default top-level flow

1. **Opening page:** two CTAs only — **Sign In** and **Create Account**. (Phase 4: replaced the 3 role cards.)
2. **Create Account → Role pick (Step 2 of the global stepper):** three role cards — Admin, Manager, Member.
3. **Step 1 form (signup-{role}):** display name, email, password.
   - **Super Admin:** if no users exist, the account is created instantly (bootstrap). Otherwise queued for approval by an existing super admin.
   - **Manager:** form data is handed off to the wizard as a `seed`. The wizard skips its own account step and walks the manager through Team → Units → Fields → Roles → Goals (steps 3–7 of the global stepper). Submission creates a single pending request for super admin approval.
   - **Member:** picks a team + optional role. Queued for the team's manager to approve.
4. **Daily use:** members log work; manager dashboard updates in real time.

### Global signup stepper

Every signup screen (except sign-in) shows a 7-step indicator at the top:

| Step | Label   | Where it shows |
|------|---------|----------------|
| 1    | Sign up | The signup-{role} form |
| 2    | Role    | The role-pick screen |
| 3    | Team    | Wizard (manager only) |
| 4    | Units   | Wizard (manager only) |
| 5    | Fields  | Wizard (manager only) |
| 6    | Roles   | Wizard (manager only) |
| 7    | Goals   | Wizard (manager only; also covers review + done) |

Members and super admins only ever see steps 1–2. The full 7 steps only complete for managers.

---

## 3. Onboarding & bootstrap

### Dev backdoor (prototype only)

A hidden shortcut for fast iteration:

- **Trigger:** press **Shift+D** on the landing page, OR load any page with `?dev=1` in the URL.
- **Effect:** calls `State.bootstrapDev()` (idempotent), then signs in as the pre-seeded super admin.
- **Credentials:** `devadmin@prodlabs.dev` / `d3ve1opment!`.
- **Why it exists:** lets Mia and engineers skip the full signup/approval dance during prototype iteration.
- **Visibility:** intentionally hidden — no UI affordance. Will not ship to production; the Laravel rebuild should drop this entirely.

### Bootstrap super admin (first run)
- If `state.config.bootstrapped !== true`, the landing page funnels into a one-time "Create your super admin" form.
- Fields required: display name, email, password (min `CONFIG.PASSWORD_MIN_LENGTH = 8`).
- On submit: create `SuperAdmin`, set `config.bootstrapped = true`, set `config.superAdminApprovers = [thisEmail]`, log them in, route to the super admin dashboard.

### Manager signup
- Landing → "Sign up as manager" → form with name, email, password, optional team name preview.
- Creates a `PendingRequest` of type `manager` with status `pending`. The user cannot log in until approved.
- Routed to a "Pending approval" screen with their email; they can sign in with the same credentials once approved.

### Member signup
- Landing → "Sign up as member" → picks team from a dropdown (lists only teams whose manager has been approved).
- Form: name, email, password, optional role pick from `team.roles`.
- Creates `PendingRequest` of type `member` with `payload.teamId` set. Status `pending`.
- Member sees a "Pending approval" screen, can't access the app until approved.

### Sign-in
- Email + password. The system finds the user across `superAdmins`, `managers`, `members` (in that order).
- Mismatched password → generic error ("Invalid credentials"). Don't leak whether the email exists.
- Successful sign-in sets `state.session = { type, email }`.
- Sign-out clears `state.session`.

---

## 4. Approval workflow

All signups (except the bootstrap super admin) go through approval.

### Universal Inbox (Phase 4)

Every role has an **Inbox tab**. It replaces the role-specific Approvals tab from earlier phases. The inbox merges two streams into one chronological list:

- **Action items:** pending approval requests this user can act on (Approve / Deny buttons inline).
- **Notifications:** read-only system messages addressed to this user (e.g. "your access was approved", "your request was denied" + optional reason). Unread notifications get a "Mark read" button.

What each role sees in their inbox:
- **Admin (super admin):** manager signup requests + super-admin signup requests (if they're an approver).
- **Manager:** member signup requests for their team.
- **Member:** account-status notifications (approved / denied).

The tab badge shows the unread count (action items always count as unread).

### Manager approvals
- **Approver:** any super admin in `config.superAdminApprovers`.
- **Visible to approver:** Super Admin dashboard → Inbox tab.
- **On approve:** the `PendingRequest` becomes `approved`; the corresponding user record is created in `state.managers`; pending entry retained for history. A `notification` is added for the requester (kind `access-approved`).
- **On deny:** status `denied`; optional `decisionNote`; user is *not* created; a `notification` is added for the requester (kind `access-denied`, body = note or "No reason was provided.").

### Member approvals
- **Approver:** the manager of the requested team.
- **Visible to approver:** Manager dashboard → Inbox tab.
- **On approve:** user record created in `state.members` with `teamId` from the pending payload. Notification sent.
- **On deny:** same as manager flow. Notification sent.

### Decision history
- Both Manager and Super views show the last 20 decided requests for context. Production: paginate.
- Decisions are immutable — there's no "un-approve" button. To revoke access, delete the user.

### Approval policy edge cases
- A super admin can approve their own subsequent re-signup (they're the only super admin) — by design, since the alternative locks the company out.
- A manager cannot approve their own member request (they shouldn't have one — managers aren't members).
- If the only approving super admin is deleted, the manager-approval queue effectively freezes. The system warns before deleting the last approver.

---

## 5. Team configuration (the wizard)

After a manager is approved, they are routed into the team setup wizard. This is a 5-step flow:

1. **Team identity** — name (2–50 chars), department (free text or pick from `LIBRARY.departments`).
2. **Work units** — pick which work units this team tracks. Library suggests defaults per department; custom labels can be set per work unit (so "Chargeback Case" can become "Dispute" if a team prefers).
3. **Tracked fields** — pick the additional fields recorded with each work unit. Examples: `amount` (currency), `outcome` (Win/Loss/Pending), `notes` (free text), `cardNetwork` (enum). Field metadata lives in `LIBRARY.fields`.
4. **Roles** — define member-facing job titles (e.g. Analyst, Senior Analyst, Lead). These show up as a dropdown when members sign up.
5. **Daily goals** — per-person, per-work-unit numeric targets. `0` or empty = no goal for that work unit.

Wizard creates the `Team` record on submit and routes the manager to the dashboard.

### Editing the team afterwards
- Manager → Settings tab can rename the team and change the department.
- Work units, fields, roles, and goals are all editable post-creation in production. (Prototype shows them but doesn't expose full editors — flagged as P0 for the dev team to build.)

---

## 6. Logging work

### Manager log flow
- Manager dashboard → "Log Work" tab.
- Form: date (defaults to today), member dropdown (all team members; falls back to manager-as-self if no members), work unit (required), then one input per tracked field.
- On submit: a `Record` is created with `teamId`, `memberEmail`, `date`, `workUnit`, `fields {}`. Manager is bounced back to Overview.

### Member log flow
- Member dashboard → "Log Work" tab.
- Same form **except**: the member field is implicit (always themselves) and not shown.

### Validation
- `date` and `workUnit` always required.
- Numeric fields (`amount`, etc.) parsed via `parseFloat` and coerced to 0 if NaN.
- Enum fields (`outcome`, etc.) constrained to `LIBRARY.fields[fieldId].options`.
- Free-text fields trimmed but otherwise unvalidated. Production: length limits, XSS protection (the prototype `escape()`s everything on render but a real backend should validate at write time too).

### Bulk logging
- See [section 7 — CSV bulk import](#7-csv-bulk-import).

---

## 7. CSV bulk import

This is the Phase 3 addition that lets managers move data in bulk.

### UX
- Manager → Activity tab → "Bulk Import" button (gated by `CONFIG.FEATURES.csvImport`).
- Modal with: explanation, collapsible template preview, large textarea, validate button, commit button (disabled until validation passes).
- Paste content → click Validate (or just type, debounced) → see a preview block with green / red / yellow notices.
- Click "Import N rows" → records are written, modal closes, dashboard refreshes with toast confirmation.

### Format
- Comma OR tab delimited (Google Sheets / Excel paste both work).
- Header row required (first line).
- Required columns (case-insensitive): `date`, `member`, `workUnit`. Defined in `CONFIG.CSV_REQUIRED_COLUMNS`.
- Other columns are matched against the team's tracked fields (case-insensitive against either field id like `amount` or label like `Amount`).
- Max rows per import: `CONFIG.CSV_MAX_ROWS = 5000`.

### Resolution rules (forgiving on purpose — managers paste from spreadsheets, not databases)

**Date** accepts:
- ISO `YYYY-MM-DD` (e.g. `2026-04-15`)
- US `M/D/YYYY` (e.g. `4/15/2026`)
- US 2-digit-year `M/D/YY` — years < 50 → 2000s, ≥ 50 → 1900s

**Member** accepts:
- Email (case-insensitive match against team members)
- Display name (case-insensitive exact match)

**Work unit** accepts:
- Work-unit id (e.g. `chargeback_case`)
- Work-unit label (e.g. `Chargeback Case` — uses team's `workUnitLabels` overrides if any)

**Field values:**
- Number fields: parsed via `parseFloat`. NaN → warning, value omitted.
- Enum fields: case-insensitive match against options. Unknown → warning, value omitted.
- Other fields: stored as-is.

### Error vs warning vs row-passes
- **Error**: row is rejected. Caused by missing/invalid date, unknown member, unknown work unit. Errors prevent that row from being imported but other rows continue.
- **Warning**: row is accepted but a non-required field was dropped (bad number, unknown enum option).
- **Row passes**: it shows up in the green "X valid rows ready to import" notice.

The commit button is enabled when at least one valid row exists. Errors and warnings are listed in the preview panel (capped at 10 visible with "+N more" overflow).

### Production considerations
- Server should re-validate everything (don't trust client-validated rows).
- For large imports (>1000 rows), stream parse on the server and surface progress to the client.
- Bulk insert should be transactional — partial imports cause data weirdness.

---

## 8. Editing & deleting records

### Manager editing
- Activity tab and member detail tables show edit (pencil) and delete (trash) icons in each row.
- Edit modal lets the manager change: date, member assignment, work unit, all tracked fields. Useful for fixing mis-attribution ("I logged this against Alice but it was Bob's").
- Delete prompts for confirmation. No undo. Production should soft-delete.

### Member editing
- Member's own history table shows edit and delete icons.
- They can only edit/delete records where `memberEmail === session.user.email` — enforced both in UI (only shows their own records) and in the action handlers (defense in depth).
- **Member self-delete is OFF by default** (`CONFIG.FEATURES.memberSelfDelete = false`). Clicking delete shows a toast: "Ask your manager to delete this record." Easy to flip on if the company changes its mind.

### Why?
- Members can fix their own typos (good UX) but can't make their numbers look better by deleting bad days (bad incentive).

### Feature flags
- `CONFIG.FEATURES.editRecords` — turn off to hide all edit affordances.
- `CONFIG.FEATURES.deleteRecords` — turn off to hide manager delete buttons.
- `CONFIG.FEATURES.memberSelfDelete` — turn on to let members delete their own records.

---

## 9. Analytics & reporting

All analytics math is in `js/analytics.js` — pure functions, no DOM, easy to port to SQL.

### Manager Overview dashboard
| Block | Source |
|---|---|
| Today / Week / Month / All Time metric tiles | `Analytics.periodCounts(records)` |
| Today's Team Goals progress bars | sum across team vs. (per-person target × team size) |
| Records — Last 30 Days line chart | `Charts.trend()` over `CONFIG.TREND_CHART_DAYS` |
| By Work Unit — This Month bar chart | `Charts.byWorkUnit()` over month-to-date records |
| Top Performers leaderboard | `Analytics.buildTopByTotal()`, top `CONFIG.LEADERBOARD_SIZE` |
| Goal Hit Rate leaderboard | `Analytics.buildGoalHitRate()`, last `CONFIG.GOAL_HIT_RATE_DAYS` days |
| Recent Activity table | last `CONFIG.RECENT_ACTIVITY_SIZE` records, reverse chrono |

### Manager Activity tab
- Two charts: Records by Member, Day of Week pattern.
- Filterable, sortable, paginated table (cap = `CONFIG.ACTIVITY_TABLE_CAP = 200`; refine filters to narrow).

### Manager Team tab
- Member roster grid: each card shows today's count, this month's count, today's goal hit %.
- Click any card to drill into a per-member detail page with their own metric tiles, today's goal progress, last-30-days trend, by-work-unit chart, and full record history (capped at `CONFIG.MEMBER_DETAIL_HISTORY = 50` rows; "View more" expands in production).

### Member dashboard
- Same 4 metric tiles (today/week/month/all-time) but for the member only.
- Today's goal progress.
- Last-30-days trend chart of own work.
- By-work-unit breakdown of own work.
- Filterable, sortable history.

### Time-window definitions (consistent everywhere)
- **Today** = `Utils.todayISO()` — local browser date.
- **This week** = `Analytics.startOfWeekISO()` to today, inclusive. Week-start is `CONFIG.WEEK_START` (Mon = 1, Sun = 0). Default Mon.
- **This month** = same calendar month as today, in local TZ.
- **Last N days** = `Analytics.lastNDays(N)` — N consecutive days ending today, inclusive.

### Goal hit rate definition
For each (member, day, goal) cell across the trailing window:
- A "hit" = member logged ≥ target records of that work unit on that day.
- Hit rate = hits / total cells × 100.

This is intentionally strict: missed days are misses, not skipped. If a member is on PTO, that's a problem with how the company tracks PTO, not with the metric. Production should let managers exclude approved leave days.

---

## 10. Goals

- Goals are **per-team, per-work-unit, per-person, per-day**: one number meaning "each member should do at least N of this work unit per day."
- Set during the wizard, editable in Settings.
- A goal of `0` or unset = no goal for that work unit.
- Team-level goal display = per-person target × team size. Team hits the goal when the team's total for the day ≥ that.
- Goals do not vary by day-of-week (no "lower goals on Friday"). Future enhancement.
- Goals do not include weekends/holidays handling. Future enhancement.

---

## 11. Search, filter, sort

### Activity table (manager)
- **Search**: substring match against member display name, email, work unit id, and any field value. Case-insensitive. Debounced `CONFIG.DEBOUNCE_MS_INPUT = 200ms`.
- **Member filter**: dropdown of team members.
- **Work unit filter**: dropdown of team's configured units.
- **Date range**: from / to (inclusive on both ends).
- **Sort**: click column headers — date (default desc), member, work unit, amount.
- **Pagination**: cap at 200 rows displayed; warning banner shows "Showing first 200 of N. Refine filters to narrow."

### Member history table
- Same filters minus member dropdown.
- Same sort behavior.

---

## 12. Cross-cutting decisions

These are calls we made early. Listed so the dev team understands the "why" before they consider changing.

| Decision | Rationale |
|---|---|
| Email is the unique key (not a UUID) | Internal company tool; emails are unique within the company; simpler URLs and references. **Production: still use a UUID PK; email is unique constraint.** |
| Plaintext passwords in prototype | Prototype is single-browser; passwords never leave localStorage. **Production: bcrypt.** |
| Single company hardcoded in CONFIG.BRAND | Company is buying for themselves; multi-tenancy not in scope. Dev team should still build with a `companies` table for future-proofing. |
| Local timezone for all dates | Company is US-based, single TZ. Dev team should make this configurable per-company. Records store ISO date strings (no time). |
| Week starts Monday | ISO 8601 / business-week convention. Configurable via `CONFIG.WEEK_START`. |
| Records have no time component | Granularity is the day. If finer granularity needed later, add a `loggedAt` timestamp separate from `date`. |
| Soft-delete is NOT in the prototype | Prototype is throwaway. **Production: every entity should soft-delete (`deletedAt` column).** |
| No event log / audit trail in prototype | See above. **Production: event log on every mutation, queryable.** |
| Member can edit own records but not delete (default) | Lets people fix typos; prevents gaming numbers. Toggleable via feature flag. |
| Approvers configurable for super admin | Currently `config.superAdminApprovers` is an array of emails. Some companies want one designated approver, some want any super admin. |
| Records cap at 200 in views | Performance. Real solution is server-side pagination. |
| CSV is paste-only, not file upload | No backend exists in the prototype. Production should support both. |
| Charts use Chart.js 4.x | Mature, no build step, looks decent out of the box. Easy to swap later. |

---

## 13. Out of scope

These are explicitly *not* in this prototype and not requested for the initial production release:

- Mobile app (web is responsive but not native)
- Real-time multi-user updates (no websockets; refresh to see new data)
- Notifications (email, in-app, push)
- File attachments on records
- Comments / discussion threads on records
- Rich text or markdown anywhere
- Custom report builder
- Data export beyond CSV (no PDF, no XLSX)
- Integrations (Salesforce, Zendesk, Stripe, etc.)
- Multi-tenancy (multiple companies in one deployment)
- Permissions beyond the three-role model (no per-team RBAC, no read-only viewers, no auditors)
- Holiday / PTO / weekend handling for goals
- Calendar week vs. business week customization beyond Mon/Sun start
- 2FA / SSO / SAML / OAuth
- API keys / programmatic access
- Webhooks
- Time-tracking (clock in / clock out)
- Per-record locking / concurrent edit conflict resolution

If any of these come back as scope additions, this doc gets updated first and the dev team plans from the new version.
