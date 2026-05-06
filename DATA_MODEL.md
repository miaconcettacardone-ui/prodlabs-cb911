# DATA_MODEL.md — ProdLabs Data Model

This document specifies the data model for the production rebuild. The prototype stores a single JSON object in `localStorage` (see [Section 7 — Migration from prototype](#7-migration-from-prototype) for the prototype's exact shape). The dev team should design the production schema to match the entities and relationships described here, optimized for Postgres.

---

## Table of contents

1. [Entity overview](#1-entity-overview)
2. [Entities — fields & rules](#2-entities--fields--rules)
3. [Relationships diagram](#3-relationships-diagram)
4. [Suggested Postgres schema](#4-suggested-postgres-schema)
5. [Indices](#5-indices)
6. [Data integrity rules](#6-data-integrity-rules)
7. [Migration from prototype](#7-migration-from-prototype)

---

## 1. Entity overview

| Entity | Description | Cardinality |
|---|---|---|
| `Company` | The customer (Chargebacks911 in our case). | 1 (single-tenant prototype) |
| `User` | Anyone with credentials. Has exactly one role. | many |
| `Team` | A working unit owned by one manager. | many per company |
| `Record` | One unit of completed work (a logged item). | many per team |
| `WorkUnit` (lookup) | Catalog of work-unit types (chargeback case, alert, call, etc.). | global |
| `Field` (lookup) | Catalog of field definitions (amount, outcome, notes, etc.). | global |
| `PendingRequest` | A signup awaiting approval. | many |
| `Session` | A logged-in user's active session. | one per user |
| `Config` | Company-level settings. | 1 per company |

Roles a `User` can have: `super_admin`, `manager`, `member`. In the prototype these are split across three arrays (`superAdmins`, `managers`, `members`); in production they should be a single `users` table with a `role` column (or a polymorphic role design — either works).

---

## 2. Entities — fields & rules

### Company

The company owning the deployment. Single-tenant in the prototype; multi-tenant-ready in production.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | "Chargebacks911" |
| `brand` | jsonb | Display config: `{ productName, tagline, logoUrl, primaryColor }` |
| `timezone` | text | IANA TZ name, e.g. "America/New_York". Currently hardcoded; **production must store this and use it for all date logic.** |
| `weekStart` | int | 0 (Sun) or 1 (Mon). Default 1. |
| `createdAt` | timestamptz | |

### User

Anyone with credentials. Replaces the prototype's three separate arrays.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `companyId` | uuid | FK → companies |
| `email` | citext | UNIQUE within company. Lowercased on write. |
| `displayName` | text | Free text, 1–100 chars |
| `passwordHash` | text | bcrypt or argon2. **NEVER plaintext.** |
| `role` | enum | `super_admin` \| `manager` \| `member` |
| `teamId` | uuid \| null | FK → teams. Required for managers and members; null for super admins. |
| `roleTitle` | text \| null | Member-only, free text or pick from `team.roles`. Display only ("Senior Analyst"). |
| `approvedBy` | uuid \| null | FK → users. The bootstrap super admin's `approvedBy` is null (or a sentinel). |
| `createdAt` | timestamptz | |
| `deletedAt` | timestamptz \| null | Soft delete |

#### Constraints
- `email` unique per `companyId`.
- A `manager`'s `teamId` should be unique (one team per manager) — enforce with a partial unique index.
- A `member`'s `teamId` is required; soft-deletion of a team should cascade to soft-delete its members or block the deletion.

### Team

A working unit. One manager owns a team; many members belong to it.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `companyId` | uuid | FK → companies |
| `name` | text | 2–50 chars |
| `department` | text | Free text or pick from library |
| `managerId` | uuid | FK → users (the user with role=manager) |
| `workUnits` | text[] | Array of work-unit ids. Order matters (display order). |
| `workUnitLabels` | jsonb | Override map: `{ chargeback_case: "Dispute" }`. Empty by default. |
| `fields` | text[] | Array of field ids tracked by this team. |
| `roles` | text[] | Member-facing job titles. |
| `goals` | jsonb | `{ workUnitId: dailyTargetPerPerson }`. 0 / missing = no goal. |
| `createdAt` | timestamptz | |
| `deletedAt` | timestamptz \| null | |

#### Notes
- Work units, fields, and roles are stored as ID arrays referencing global lookup tables. Custom labels live on the team.
- Goals are a flat JSONB map keyed by work-unit id. Don't normalize to a separate `team_goals` table unless you need per-day or per-role goals later.
- A team without records and without members can be hard-deleted; otherwise soft-delete only.

### Record

One unit of completed work. The high-volume table. This is what actually gets dashboarded.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `teamId` | uuid | FK → teams |
| `memberId` | uuid | FK → users (role=member, or the manager themselves). Indexed. |
| `date` | date | Local-calendar date. **Not a timestamp** — granularity is the day. Indexed. |
| `workUnit` | text | Work unit id (e.g. `chargeback_case`). FK against the lookup. Indexed. |
| `fields` | jsonb | Map of field id → value. Schemaless on purpose; field set is per-team. |
| `createdBy` | uuid | FK → users. Who logged this record (could be the member themselves OR their manager). |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |
| `deletedAt` | timestamptz \| null | |

#### Notes
- `date` and `createdAt` are intentionally separate. You can log a record retroactively (record dated 2026-04-01, created on 2026-05-01). All analytics use `date`.
- `fields` is JSONB so each team can track different fields without schema migrations. Production should still validate field types on write — see [validation rules](#6-data-integrity-rules).
- `memberId` vs. `createdBy`: in the prototype, the manager can log work for any member, so `memberId` may differ from `createdBy`. The dashboard always credits `memberId`.

### WorkUnit (lookup)

Catalog of work-unit types. Global.

| Field | Type | Notes |
|---|---|---|
| `id` | text | PK. Slug like `chargeback_case`, `alert_resolved`, `sales_call`. |
| `defaultLabel` | text | "Chargeback Case" |
| `defaultDepartments` | text[] | Department slugs that get this by default in the wizard |
| `description` | text | Optional copy shown in the wizard |

The prototype keeps these in `js/library.js`. In production, this is a small table seeded at deploy.

### Field (lookup)

Catalog of field definitions. Global.

| Field | Type | Notes |
|---|---|---|
| `id` | text | PK. Slug like `amount`, `outcome`, `notes`, `cardNetwork` |
| `label` | text | "Amount" |
| `type` | enum | `number` \| `enum` \| `text` |
| `options` | text[] \| null | For `enum` only |
| `hint` | text \| null | Placeholder text shown in inputs |
| `format` | text \| null | For `number` — `currency`, `percent`, etc. |

Same setup as WorkUnit — lookup table, seeded.

### PendingRequest

A signup awaiting approval. Persists even after decision (for history).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `companyId` | uuid | FK → companies |
| `type` | enum | `manager` \| `member` |
| `email` | citext | Lowercased |
| `displayName` | text | |
| `passwordHash` | text | Same hashing as User. Created here pre-approval. |
| `payload` | jsonb | `manager`: `{ proposedTeamName, department }`. `member`: `{ teamId, role }`. |
| `status` | enum | `pending` \| `approved` \| `denied` |
| `requestedAt` | timestamptz | |
| `decidedAt` | timestamptz \| null | |
| `decidedBy` | uuid \| null | FK → users |
| `decisionNote` | text \| null | Optional reason on deny |
| `resultUserId` | uuid \| null | FK → users — set on approval. Lets you trace approved request → created user. |

### Session

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `userId` | uuid | FK → users |
| `token` | text | UNIQUE. Hashed in DB; raw value in cookie. |
| `expiresAt` | timestamptz | |
| `createdAt` | timestamptz | |
| `lastSeenAt` | timestamptz | |

(The prototype uses an in-memory session, not a session table. Production must implement proper sessions.)

### Config

Company-level config (one row per company).

| Field | Type | Notes |
|---|---|---|
| `companyId` | uuid | PK / FK |
| `bootstrapped` | bool | True after the first super admin is created. |
| `superAdminApprovers` | uuid[] | Subset of super admins who can approve managers. |
| `featureFlags` | jsonb | Per-company overrides of `CONFIG.FEATURES`. |
| `updatedAt` | timestamptz | |

---

## 3. Relationships diagram

```
                    Company
                   /        \
                  /          \
            Config            Users
                              /  |  \
              role=super  role=manager  role=member
                                |              |
                                v              v
                              Team  <----------+
                                |
                                v
                            Records
                              ^
                              |
                            (memberId, createdBy → Users)


  PendingRequest -- (after approval) --> User
                 -- (decidedBy)       --> User
                 -- (payload.teamId)  --> Team   [member type only]
```

---

## 4. Suggested Postgres schema

This is a *suggestion*, not a mandate — the dev team is welcome to change it. Migrations and production-grade defaults (NOT NULLs, foreign keys, etc.) are omitted for readability.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('super_admin', 'manager', 'member');
CREATE TYPE pending_type AS ENUM ('manager', 'member');
CREATE TYPE pending_status AS ENUM ('pending', 'approved', 'denied');

CREATE TABLE companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  brand       jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone    text NOT NULL DEFAULT 'UTC',
  week_start  smallint NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id),
  email           citext NOT NULL,
  display_name    text NOT NULL,
  password_hash   text NOT NULL,
  role            user_role NOT NULL,
  team_id         uuid REFERENCES teams(id),
  role_title      text,
  approved_by     uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (company_id, email)
);

CREATE TABLE teams (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id),
  name               text NOT NULL,
  department         text,
  manager_id         uuid NOT NULL REFERENCES users(id),
  work_units         text[] NOT NULL DEFAULT '{}',
  work_unit_labels   jsonb NOT NULL DEFAULT '{}'::jsonb,
  fields             text[] NOT NULL DEFAULT '{}',
  roles              text[] NOT NULL DEFAULT '{}',
  goals              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

-- One team per manager
CREATE UNIQUE INDEX one_team_per_manager
  ON teams(manager_id) WHERE deleted_at IS NULL;

CREATE TABLE records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES teams(id),
  member_id   uuid NOT NULL REFERENCES users(id),
  date        date NOT NULL,
  work_unit   text NOT NULL,
  fields      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE work_units_lookup (
  id                  text PRIMARY KEY,
  default_label       text NOT NULL,
  default_departments text[] NOT NULL DEFAULT '{}',
  description         text
);

CREATE TABLE fields_lookup (
  id      text PRIMARY KEY,
  label   text NOT NULL,
  type    text NOT NULL CHECK (type IN ('number','enum','text')),
  options text[],
  hint    text,
  format  text
);

CREATE TABLE pending_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id),
  type            pending_type NOT NULL,
  email           citext NOT NULL,
  display_name    text NOT NULL,
  password_hash   text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          pending_status NOT NULL DEFAULT 'pending',
  requested_at    timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  decided_by      uuid REFERENCES users(id),
  decision_note   text,
  result_user_id  uuid REFERENCES users(id)
);

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE company_config (
  company_id              uuid PRIMARY KEY REFERENCES companies(id),
  bootstrapped            boolean NOT NULL DEFAULT false,
  super_admin_approvers   uuid[] NOT NULL DEFAULT '{}',
  feature_flags           jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
```

---

## 5. Indices

The high-cardinality entity is `records`. These indices cover the bulk of the query patterns the dashboards use:

```sql
-- "Show me records for team T, optionally filtered by date range"
CREATE INDEX records_team_date ON records(team_id, date DESC) WHERE deleted_at IS NULL;

-- "Show me records for member M, ordered by date"
CREATE INDEX records_member_date ON records(member_id, date DESC) WHERE deleted_at IS NULL;

-- "Records for team T grouped by work unit" — covered by team_date partially,
-- add a dedicated one if the dashboard needs it for fast aggregation:
CREATE INDEX records_team_unit_date ON records(team_id, work_unit, date) WHERE deleted_at IS NULL;

-- Pending request queue (fast "what's pending for approver X")
CREATE INDEX pending_status_type ON pending_requests(status, type) WHERE status = 'pending';

-- Sessions (token lookup is the hot path)
-- token_hash is already UNIQUE so it has an index for free.

-- Soft-delete pattern: most queries should add WHERE deleted_at IS NULL.
-- A partial index on deleted_at IS NULL keeps these fast even with lots of soft-deletes.
```

For analytics workloads above ~1M records, consider a daily summary materialized view: `(team_id, member_id, date, work_unit, count)` — refreshed nightly or on-write.

---

## 6. Data integrity rules

### Application-level invariants
1. A user's `role` is immutable. To change roles, soft-delete the old user and create a new one.
2. A `manager` always has a non-null `team_id`. A `super_admin` always has a null `team_id`. A `member` always has a non-null `team_id`.
3. A `team`'s `manager_id` always points to a user with `role = 'manager'`.
4. A `record`'s `member_id` points to a user whose `team_id` matches the record's `team_id` — OR to a manager whose team owns the record.
5. `record.work_unit` ∈ `team.work_units`.
6. `record.fields` keys ⊆ `team.fields`.
7. Field values match the type defined in `fields_lookup`:
   - `type = 'number'` → value is a JSON number
   - `type = 'enum'` → value is a string in `options`
   - `type = 'text'` → value is a string ≤ N chars (configurable)
8. A `pending_request` with `type = 'member'` has `payload.teamId` set.
9. The bootstrap super admin's `approved_by` is null (or a sentinel value).
10. `company_config.super_admin_approvers` is a non-empty subset of the company's `super_admin` users — or empty, in which case manager signups freeze (UI should warn).

### Things to enforce at the database level (cheap insurance)
- Foreign keys with appropriate `ON DELETE` rules (mostly `RESTRICT` or `SET NULL`, never `CASCADE` — soft-delete instead).
- `CHECK` constraint on `users.role` and conditional team_id requirement.
- `CHECK` constraint on `records.fields` if you want strict JSON shape validation (Postgres 12+).

### Things to enforce in application code
- Role transitions (refuse to change a user's role).
- Cross-entity validation (a record's work_unit must be in the team's work_units).
- Approval workflow state machine (pending → approved/denied; no other transitions).

---

## 7. Migration from prototype

The prototype stores **one JSON blob** in `localStorage` under the key `CONFIG.STORAGE_KEY` (currently `prodlabs_cb911_v2`).

### Prototype JSON shape

```js
{
  company: { name: "Chargebacks911", brand: { ... } },

  superAdmins: [
    { email, displayName, password, approvedBy, createdAt }
  ],

  managers: [
    { email, displayName, password, teamId, approvedBy, createdAt }
  ],

  members: [
    { email, displayName, password, teamId, role, approvedBy, createdAt }
  ],

  teams: [
    {
      id, name, department, managerEmail,
      workUnits: ["chargeback_case", "representment"],
      workUnitLabels: { chargeback_case: "Dispute" },  // optional overrides
      fields: ["amount", "outcome"],
      roles: ["Analyst", "Senior Analyst"],
      goals: { chargeback_case: 5, representment: 3 },
      createdAt
    }
  ],

  records: [
    {
      id, teamId, memberEmail, date,         // date is "YYYY-MM-DD"
      workUnit,                              // work-unit id
      fields: { amount: 1234.56, outcome: "Win", notes: "..." },
      createdAt
    }
  ],

  pending: [
    {
      id, type: "manager"|"member",
      email, displayName, password,
      payload: { ... type-specific ... },
      status: "pending"|"approved"|"denied",
      requestedAt, decidedAt, decidedBy, decisionNote
    }
  ],

  session: { type: "super"|"manager"|"member", email } | null,

  config: {
    bootstrapped: true,
    superAdminApprovers: ["admin@example.com"]
  }
}
```

### Migration script outline

A migration script should walk the JSON in this order:

1. Insert `companies` row (one company).
2. Insert `users` rows from `superAdmins`, `managers`, `members`. Hash passwords during migration. Build an `email → user_id` lookup map.
3. Insert `teams` rows. Resolve `managerEmail` → `managerId` via the lookup.
4. Update `users` for managers/members to set their `team_id`.
5. Insert `records` rows. Resolve `memberEmail` → `member_id`. For prototype-era records `created_by = member_id` (we don't have that data; this is a benign loss).
6. Insert `pending_requests` rows. Resolve `decidedBy` email → `decided_by` id where present.
7. Insert `company_config` row from `config`.

The `id` fields in the prototype JSON (e.g. team ids like `t_1234567890_abc`) should NOT be reused — generate fresh UUIDs and rebuild references.

### What you lose in migration

- **Time data**: `createdAt` is a JS millisecond timestamp; convert to timestamptz, fine.
- **Created-by on records**: prototype doesn't track it; default to `memberId`.
- **Audit history**: prototype has no event log. The migration is a "snapshot" only.

After migration, write tests asserting row counts match: `users.count == prototype.superAdmins.length + managers.length + members.length`, etc.

---

For permission rules between these entities, see [PERMISSIONS.md](./PERMISSIONS.md).
