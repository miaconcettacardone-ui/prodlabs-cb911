# PERMISSIONS.md — ProdLabs Permissions & Authorization

This document specifies the authorization model: who can do what, when, and under which conditions. Together with [SPEC.md](./SPEC.md) (what the app does) and [DATA_MODEL.md](./DATA_MODEL.md) (the data it acts on), this is the third pillar of the dev team's onboarding.

The dev team should implement these rules **server-side** with defense-in-depth client-side checks. The prototype's client-side gating is a UX nicety, not a security boundary.

---

## Table of contents

1. [The three roles](#1-the-three-roles)
2. [Permission matrix](#2-permission-matrix)
3. [Approval workflows](#3-approval-workflows)
4. [Visibility rules](#4-visibility-rules)
5. [Critical edge cases](#5-critical-edge-cases)
6. [Self-service vs administrative actions](#6-self-service-vs-administrative-actions)
7. [Implementation notes](#7-implementation-notes)

---

## 1. The three roles

| Role | Slug | Scope | Count |
|---|---|---|---|
| Super Admin | `super_admin` | Company-wide | ≥ 1 (the bootstrap super admin can never be deleted) |
| Manager | `manager` | One team | 1 per team |
| Member | `member` | Themselves | many per team |

A user has exactly one role. Roles are immutable after creation — to change a role, soft-delete the user and create a new one. (The dev team may revisit this if the company reports it as a pain point post-launch.)

### Why three roles and not more?

We considered: read-only viewers, auditors, finance roles, cross-team analysts. We rejected all of them for v1 because:
- The product is internal, not multi-tenant SaaS — most "roles" you'd add to a SaaS are unnecessary.
- Every additional role multiplies the permission matrix and slows shipping.
- The three-role model satisfies all of the use cases described in SPEC §2.

Future roles, if added, should subclass an existing role rather than start from scratch. For example, a "Read-Only Manager" should be the same as a Manager but with all write actions denied.

---

## 2. Permission matrix

`✅` = allowed. `❌` = denied. `⚠` = allowed under conditions (see notes).

### User management

| Action | Super Admin | Manager | Member |
|---|---|---|---|
| Create another super admin | ✅ | ❌ | ❌ |
| Approve manager signup | ⚠ (if listed in `config.superAdminApprovers`) | ❌ | ❌ |
| Approve member signup | ❌ | ⚠ (only for own team) | ❌ |
| Delete super admin (other than self) | ✅ | ❌ | ❌ |
| Delete super admin (self) | ⚠ (only if not the last one) | ❌ | ❌ |
| Delete manager | ✅ | ❌ | ❌ |
| Delete member | ⚠ (any team) | ⚠ (own team) | ❌ |
| View own profile | ✅ | ✅ | ✅ |
| Edit own display name | ✅ | ✅ | ✅ |
| Edit own password | ✅ | ✅ | ✅ |
| Reset another user's password | ✅ | ⚠ (own team members; production: probably no — link via email instead) | ❌ |

### Team management

| Action | Super Admin | Manager | Member |
|---|---|---|---|
| Create team | ⚠ (during manager-approval) | ⚠ (via wizard, post-approval) | ❌ |
| View any team's data | ✅ | ❌ | ❌ |
| View own team's data | ✅ | ✅ | ❌ |
| Edit team name / department | ✅ | ✅ (own team) | ❌ |
| Edit team work units | ✅ | ✅ (own team) | ❌ |
| Edit team tracked fields | ✅ | ✅ (own team) | ❌ |
| Edit team daily goals | ✅ | ✅ (own team) | ❌ |
| Delete team | ✅ | ❌ (production: maybe yes with confirmation) | ❌ |
| Reassign team to a different manager | ✅ | ❌ | ❌ |

### Record management

| Action | Super Admin | Manager | Member |
|---|---|---|---|
| View any record | ✅ | ⚠ (own team's records) | ❌ |
| View own records | ✅ | ✅ | ✅ |
| Create record (any member) | ✅ | ⚠ (own team) | ❌ |
| Create record (self) | ✅ | ✅ | ✅ |
| Edit any record | ✅ | ⚠ (own team's records) | ❌ |
| Edit own record | ✅ | ✅ | ⚠ (`CONFIG.FEATURES.editRecords`) |
| Delete any record | ✅ | ⚠ (own team's records, `CONFIG.FEATURES.deleteRecords`) | ❌ |
| Delete own record | ✅ | ✅ | ⚠ (`CONFIG.FEATURES.memberSelfDelete`, default OFF) |
| CSV bulk import | ✅ | ⚠ (own team, `CONFIG.FEATURES.csvImport`) | ❌ |

### Configuration

| Action | Super Admin | Manager | Member |
|---|---|---|---|
| Edit company branding | ✅ | ❌ | ❌ |
| Edit company timezone / week start | ✅ | ❌ | ❌ |
| Add/remove super admin approvers | ✅ | ❌ | ❌ |
| Toggle feature flags | ✅ | ❌ | ❌ |

### Reporting

| Action | Super Admin | Manager | Member |
|---|---|---|---|
| Cross-team analytics | ⚠ (`CONFIG.FEATURES.superCrossTeamReporting`) | ❌ | ❌ |
| Own-team analytics | ✅ | ✅ | ❌ |
| Own analytics (just me) | ✅ | ✅ | ✅ |

---

## 3. Approval workflows

### Manager approval

```
Anonymous user submits signup form
            ↓
PendingRequest { type: 'manager', status: 'pending' } is created
            ↓
Visible to: anyone in config.superAdminApprovers
            ↓
   ┌────────┴─────────┐
   ↓                  ↓
APPROVE           DENY
   ↓                  ↓
User row created   PendingRequest.status = 'denied'
PendingRequest.    decisionNote optional
status='approved'  
   ↓                  ↓
Manager runs       Anonymous user shown a
team setup wizard  "request denied" screen
                   on next sign-in attempt
```

#### Approver eligibility
- A super admin can approve manager signups if and only if their `id` (or email, in the prototype) is in `config.super_admin_approvers`.
- The bootstrap super admin is automatically added to `super_admin_approvers` at creation.
- Removing oneself from `super_admin_approvers` is allowed if at least one other approver remains.

#### After approval
- The newly-created manager has no team yet. They are routed to the team setup wizard on first login.
- The wizard's submission creates the `Team`, sets `users.team_id` for the manager, and routes them to the dashboard.

### Member approval

```
Anonymous user submits signup form (picks a team)
            ↓
PendingRequest { type: 'member', payload.teamId: T, status: 'pending' }
            ↓
Visible to: the manager of team T
            ↓
   ┌────────┴─────────┐
   ↓                  ↓
APPROVE           DENY
   ↓                  ↓
User row created   PendingRequest.status='denied'
with team_id=T     decisionNote optional
PendingRequest.   
status='approved'
```

#### Notes
- Only the **manager of team T** sees this request — not other managers, not super admins.
- If the team's manager is deleted before deciding, the request orphans (see [edge cases](#5-critical-edge-cases)).
- Super admins can override and approve a member request directly in production (not in the prototype). This handles the orphan case.

### Super admin signup (no approval needed)
- Only existing super admins can create new super admins. There's no "request to be a super admin" flow.
- The bootstrap super admin is the only super admin who is created without an approver — recorded with `approved_by = NULL` (or a sentinel value).

---

## 4. Visibility rules

These are the *read* rules — what you can see. They're separate from *write* rules above.

### Super Admin sees
- All companies' data — but the prototype is single-tenant so this is just "all teams in the company."
- All users (super admins, managers, members).
- All records across all teams.
- All pending requests of any type.
- Decision history for everyone.

### Manager sees
- Their own team only.
- Their team's members (incl. their own user record).
- Their team's records.
- Pending member requests for their team.
- Decision history for their team's member approvals.
- The manager dashboard analytics for their team.
- **Manager does NOT see:** other managers, other teams, other teams' records, super admins, super-admin-only config.

### Member sees
- Themselves only — the user record, the team they belong to (name + roles list, but not other members' records).
- Their own records.
- Their own goal progress.
- **Member does NOT see:** other members' records, leaderboards, manager-only views, anyone else's data, any approval queues.

### A note on "team roster" visibility for members
The prototype currently **does not** show members a roster of their own team. We considered it (it's the kind of "see who else is on the team" feature people expect) but rejected it for v1 because it leaks names of coworkers in a way that wasn't asked for. Easy to add later if the company wants it; would just be a new tab in the member view rendering `State.membersOfTeam(team.id)` (without records).

---

## 5. Critical edge cases

These are the gnarly cases that *will* come up in production. Each one needs a deliberate UI/server response.

### 5.1 The last super admin

**Problem:** super admins can delete super admins. If you delete the only one, no one can approve new managers ever again.

**Rule:** The system must refuse to delete the last remaining super admin. The UI shows a disabled delete button with an explanatory tooltip ("This is the only super admin. Add another before deleting this one.").

**Server enforcement:** count active (`deleted_at IS NULL`) super admins before any delete; if `count <= 1`, refuse with HTTP 409.

**Bootstrap super admin specifically:** the prototype additionally treats the bootstrap super admin (the one with `approved_by = NULL`) as undeletable, even if other super admins exist. This is a safety belt against the "accidentally locked out" case during early company adoption. **Production may relax this rule** since other recovery paths exist (root DB access).

### 5.2 The last super admin approver

**Problem:** even if multiple super admins exist, only those in `config.super_admin_approvers` can approve managers. Removing the last approver from that list freezes manager signups.

**Rule:** The system must refuse to remove the last entry from `super_admin_approvers`. UI tooltip: "At least one super admin must be designated as a manager-signup approver."

### 5.3 Deleting a manager who has a team

**Problem:** their team has members, records, and possibly pending requests.

**Rule:** Refuse to hard-delete the manager directly. Instead, the super admin must take one of:
- **Reassign the team to another manager**, then delete the original manager. The new manager's `team_id` is updated; old manager's `team_id` becomes null; manager soft-deleted.
- **Delete the team entirely**, which soft-deletes all members, soft-deletes all records, denies all pending requests for the team. Then the manager can be deleted.

Server: enforce as a transactional operation. Don't allow leaving a team without a manager.

### 5.4 Deleting a member who has records

**Problem:** their records still exist and are dashboarded.

**Rule:** Soft-delete the user. Records remain (with `member_id` pointing at the soft-deleted user). The dashboard shows the deleted user's display name with a strikethrough or a "(former member)" label. **Do not** delete the records — the team's totals shouldn't change retroactively.

For a hard-delete (e.g., GDPR right-to-erasure), the system should anonymize the member: replace `display_name` with "Former Member" and clear PII fields, but keep the `id` and the records. Anonymization is a separate flow with its own approval gate.

### 5.5 Pending requests for a deleted manager

**Problem:** members signed up for team T whose manager M was just deleted.

**Rule:** When the team is reassigned, pending requests follow — they become visible to the new manager. When the team is deleted, pending requests for that team are auto-denied with a system note ("Team no longer exists").

### 5.6 Member changing their email

**Problem:** email is the unique key; records reference `member_id`. In production, `member_id` is a UUID, so renaming email is fine. But in the prototype, email is the join column.

**Rule (prototype):** do not allow email change in the prototype. Show the email as immutable. Tooltip: "Email cannot be changed; contact your manager."

**Rule (production):** allow email change. Records reference `member_id` (UUID), not email, so nothing breaks. Email is just a login attribute.

### 5.7 Two managers on one team

**Problem:** the company asks for shared manager duties.

**Rule:** Not supported in v1. The data model has `teams.manager_id` as a single column. Future versions may pivot to a `team_managers` join table; for now, deliver one-manager-per-team and note this as a known limitation.

### 5.8 Member of two teams

**Problem:** someone splits time across two teams.

**Rule:** Not supported in v1. A member belongs to exactly one team. To work for two teams, they need two member accounts (different emails). Future versions may allow many-to-many; v1 keeps it simple.

### 5.9 Member trying to edit a record from before they joined the team

**Problem:** an old record's `member_id` points to them but they want to deny the value.

**Rule:** A member can only edit/delete records where they are the current `member_id`. The "before they joined" scenario shouldn't actually occur — if they have records, they had to be a team member at the time those records were written. Edge case worth thinking about during migration testing.

### 5.10 Bulk import resolving an ambiguous member

**Problem:** Two members named "Alex Smith" on the same team. CSV row says `member: Alex Smith`.

**Rule:** When ambiguous by display name, the row is rejected with an error: "Member name 'Alex Smith' matches more than one team member. Use email instead." This is rare in practice but the failure mode must be loud.

### 5.11 Bulk import of records dated in the future

**Problem:** typo on a row dated `2099-01-01`.

**Rule:** Future-dated records are accepted by the prototype. Future-dated records can mess up "today" / "this week" analytics depending on how they're computed. Production should warn (yellow notice) on rows dated more than 1 day in the future.

---

## 6. Self-service vs administrative actions

Some user-account changes can be self-service; others must be administrative.

| Change | Self-service | Reason |
|---|---|---|
| Display name | ✅ | No identity-verification implications |
| Password | ✅ (must confirm old password) | Standard self-service |
| Email | ❌ in v1 (admin-only) | Prototype uses email as join key; production should allow with verification |
| Role | ❌ (cannot change at all) | Roles immutable; create a new account |
| Team membership | ❌ (admin-only) | Manager approves member into team; super admin reassigns members |
| Account deletion | ❌ (admin-only) | Audit + records-retention concerns |

---

## 7. Implementation notes

### Session and authorization

Every authenticated request from the client must include a session token (cookie). The server resolves the token to a `users` row, then evaluates the requested action against that user's role and the resource being acted on.

A clean implementation pattern (Laravel/Node/whatever):

```
authorize(action, user, resource):
  if user.role == 'super_admin':
    return ALLOW for everything except the few "super admin self-deletion" cases
  if user.role == 'manager':
    return ALLOW iff resource.team_id == user.team_id (and action is in manager set)
  if user.role == 'member':
    return ALLOW iff resource.member_id == user.id (and action is in member set)
  return DENY
```

Decorate every endpoint or controller method with the action it represents, then run a single `authorize()` check before the handler executes.

### Defense-in-depth

The prototype gates UI affordances on `CONFIG.FEATURES.*` and on role checks at render time. **Production must additionally enforce all of these on the server.** A user editing the URL or sending hand-crafted requests must be blocked at the server layer regardless of what the UI showed.

### Audit logging

Every action listed in [section 2](#2-permission-matrix) should write an audit log entry:

```
{
  actor_user_id: uuid,
  action: 'records.delete' | 'users.approve_manager' | etc.,
  resource_type: 'record' | 'user' | 'team' | etc.,
  resource_id: uuid,
  before: jsonb,    // optional snapshot before mutation
  after:  jsonb,    // optional snapshot after mutation
  ip_address: text,
  user_agent: text,
  occurred_at: timestamptz
}
```

Audit logs should be append-only (no UPDATE / DELETE) and queryable by super admins.

### Rate limiting

Suggest:
- Login attempts: 5 per email per 15 minutes (then 15-minute lockout).
- CSV import: 1 in flight per user (no parallel imports).
- Generic API: 60 req/min per user, higher for read-heavy endpoints.

### Feature flags

`CONFIG.FEATURES` in the prototype is a static object. Production should:
- Store these in `company_config.feature_flags` so super admins can toggle.
- Expose them in the API per session (`GET /me`) so the client renders correctly.
- Document each flag's intent in code comments alongside its definition.

The flags currently defined:

| Flag | Default | Effect |
|---|---|---|
| `csvImport` | `true` | Show the Bulk Import button on the Activity tab |
| `editRecords` | `true` | Show edit (pencil) buttons on records |
| `deleteRecords` | `true` | Show delete (trash) buttons on records (manager) |
| `memberSelfDelete` | `false` | Allow members to delete their own records |
| `superCrossTeamReporting` | `true` | Show super admins cross-team analytics |

---

## Appendix: Quick reference card for the dev team

When implementing any new feature, ask these four questions:

1. **Who can do it?** — write the role check explicitly. Default to deny.
2. **What can they see?** — does this leak data across teams or roles?
3. **What's the audit trail?** — log it.
4. **What's the failure mode if the rule changes?** — feature flag it.

If you can't answer all four, the feature isn't ready to ship.
