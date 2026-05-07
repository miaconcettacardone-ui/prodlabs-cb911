/* ============================================================
 *  state.js — central data model + persistence
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  This is the "database" for the prototype. It holds every
 *  piece of business data — users, teams, records, approvals —
 *  in one big in-memory object, and saves that object to the
 *  browser's localStorage so it survives page refreshes.
 *
 *  WHY ONE FILE FOR ALL DATA?
 *  In a real app you'd have a separate database table for each
 *  entity (users, teams, records, etc.). Here we use one big
 *  JSON object because:
 *    - localStorage only holds strings, so we serialize/deserialize
 *      one object instead of juggling dozens of keys.
 *    - The whole prototype is small enough to fit in memory.
 *    - The Laravel rebuild will normalize this into proper tables
 *      (see DATA_MODEL.md for the migration plan).
 *
 *  THE PUBLIC API:
 *  Other modules NEVER touch the `state` object directly. They
 *  call State.X functions (State.addMember, State.deleteRecord,
 *  etc.). Why? Because direct mutation could:
 *    - Forget to call save() and lose data
 *    - Skip validation
 *    - Bypass the audit log we'll need to add later
 *
 *  Centralizing all writes through State.* makes it possible to
 *  add cross-cutting features (audit, undo, server sync) in ONE
 *  place when the rebuild happens.
 *
 *  Data model overview
 *  -------------------
 *  state = {
 *    company:        { name, brand },
 *    superAdmins:    SuperAdmin[],
 *    managers:       Manager[],
 *    members:        Member[],
 *    teams:          Team[],
 *    records:        Record[],
 *    pending:        PendingRequest[],
 *    session:        { type:'super'|'manager'|'member', email } | null,
 *    config:         { superAdminApprovers: email[] }
 *  }
 *
 *  Each entity uses EMAIL as the unique key (no separate user IDs).
 *  This is a prototype simplification — production should use UUIDs
 *  with email as a unique constraint. See DATA_MODEL.md.
 *
 *  PROTOTYPE behavior: persists to localStorage.
 *  PRODUCTION rebuild: replace loadState/saveState with API calls.
 *
 *  Storage key comes from CONFIG.STORAGE_KEY.
 * ============================================================ */

// Read the storage key from CONFIG so we have a single source of truth.
// If we ever need to "version-bump" the data shape, we change it
// in CONFIG and existing browsers reset cleanly.
const STORAGE_KEY = CONFIG.STORAGE_KEY;

const State = (() => {

  // ---- defaults ---------------------------------------------
  function defaultState() {
    return {
      company: { name: '', brand: 'Chargebacks911' },
      superAdmins: [],   // {email, displayName, password, createdAt, approvedBy}
      managers:    [],   // {email, displayName, password, teamId, createdAt, approvedBy}
      members:     [],   // {email, displayName, password, teamId, role, createdAt, approvedBy}
      teams:       [],   // {id, name, department, managerEmail, workUnits[], workUnitLabels{}, fields[], roles[], goals{}}
      records:     [],   // {id, teamId, memberEmail, date, workUnit, fields{}, createdAt}
      pending:     [],   // {id, type, email, displayName, password, payload{}, requestedAt, status, decidedBy?, decidedAt?, decisionNote?}
      // Notifications are read-only system messages sent to a specific user.
      // Used to tell users when their access was approved/denied, etc.
      // Lives alongside `pending` (action items) — together they make up the
      // user's "Inbox" (see js/inbox.js for the merge logic).
      notifications: [],   // {id, recipientEmail, kind, title, body, createdAt, readAt|null}
      session:     null, // {type, email}
      config: {
        superAdminApprovers: [], // emails of super admins who can approve new super admins
        bootstrapped: false,     // becomes true after the very first super admin is created
        departments: [],         // Phase 5: admin-added departments (merged with LIBRARY.departments)
      }
    };
  }

  // ---- load / save ------------------------------------------
  // We cache the loaded state in `_cached` so we don't re-parse
  // JSON on every call. The cache is updated when we save and
  // wiped when we reset.
  let _cached = null;

  // Load the entire state from localStorage. First call parses
  // the JSON; subsequent calls return the cached object.
  function load() {
    if (_cached) return _cached;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // If localStorage is empty (first run), use the default state.
      _cached = raw ? JSON.parse(raw) : defaultState();

      // MIGRATION SAFETY: if we add a new top-level field to the
      // state shape later, old saved data won't have it. We merge
      // defaults onto loaded data so missing fields appear with
      // sensible defaults instead of `undefined`.
      const def = defaultState();
      _cached = {
        ...def,
        ..._cached,
        // Special-case `config` so its nested fields also merge.
        config: { ...def.config, ...(_cached.config || {}) }
      };
    } catch (e) {
      // If JSON.parse blew up (corrupted localStorage somehow),
      // fall back to defaults rather than crashing the app.
      console.error('State load failed:', e);
      _cached = defaultState();
    }
    return _cached;
  }

  // Persist the in-memory state back to localStorage. Called by
  // every State.* mutation function after it changes data.
  function save() {
    if (!_cached) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_cached));
    } catch (e) {
      // Could happen if localStorage is full (5-10MB limit) or
      // disabled (private browsing on some browsers).
      console.error('State save failed:', e);
    }
  }

  // Wipe everything. Used by the "reset prototype" flow and tests.
  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    _cached = null;
  }

  // ---- accessors --------------------------------------------
  function get() { return load(); }

  function findUserByEmail(email) {
    const s = load();
    const norm = (email||'').trim().toLowerCase();
    if (!norm) return null;
    const sa = s.superAdmins.find(u => u.email.toLowerCase() === norm);
    if (sa) return { type: 'super', user: sa };
    const mg = s.managers.find(u => u.email.toLowerCase() === norm);
    if (mg) return { type: 'manager', user: mg };
    const mb = s.members.find(u => u.email.toLowerCase() === norm);
    if (mb) return { type: 'member', user: mb };
    return null;
  }

  function emailInUse(email) {
    const s = load();
    const norm = (email||'').trim().toLowerCase();
    if (!norm) return false;
    if (findUserByEmail(norm)) return true;
    if (s.pending.some(p => p.status==='pending' && p.email.toLowerCase()===norm)) return true;
    return false;
  }

  function teamForManager(email) {
    const s = load();
    return s.teams.find(t => t.managerEmail && t.managerEmail.toLowerCase()===email.toLowerCase());
  }

  function teamById(id) {
    return load().teams.find(t => t.id === id);
  }

  function membersOfTeam(teamId) {
    return load().members.filter(m => m.teamId === teamId);
  }

  function recordsOfTeam(teamId) {
    return load().records.filter(r => r.teamId === teamId);
  }

  // ---- session ----------------------------------------------
  function setSession(type, email) {
    const s = load();
    s.session = { type, email };
    save();
  }
  function clearSession() {
    const s = load();
    s.session = null;
    save();
  }
  function currentSession() {
    const s = load();
    if (!s.session) return null;
    const result = findUserByEmail(s.session.email);
    if (!result) { clearSession(); return null; }
    if (result.type === 'member') {
      const team = teamById(result.user.teamId);
      return { type: 'member', user: result.user, team };
    }
    if (result.type === 'manager') {
      const team = teamForManager(result.user.email);
      return { type: 'manager', user: result.user, team };
    }
    return result; // super
  }

  // ---- mutations --------------------------------------------
  function addSuperAdmin(data) {
    const s = load();
    s.superAdmins.push({ ...data, createdAt: Date.now() });
    save();
  }
  function addManager(data) {
    const s = load();
    s.managers.push({ ...data, createdAt: Date.now() });
    save();
  }
  function addMember(data) {
    const s = load();
    s.members.push({ ...data, createdAt: Date.now() });
    save();
  }
  function addTeam(data) {
    const s = load();
    const team = { id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2,7), ...data };
    s.teams.push(team);
    save();
    return team;
  }
  // Add a single record. Used when the user logs work via the
  // "Log Work" tab — one record at a time.
  //
  // The record gets a generated `id` like "r_1709123456789_x7k2j"
  // — a timestamp + 5 random base-36 chars. This is unique enough
  // for our prototype scale and fast to generate. Production will
  // use proper UUIDs.
  function addRecord(data) {
    const s = load();
    const rec = {
      id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
      ...data
    };
    s.records.push(rec);
    save();  // persist after every single record
    return rec;
  }

  // Bulk insert — used by CSV import. The KEY DIFFERENCE from
  // addRecord is we call save() ONCE at the end, not after each
  // record. localStorage.setItem is slow (~5-10ms per call), so
  // 5000 individual saves = 25-50 SECONDS of frozen UI. One
  // bulk save = a few milliseconds total.
  //
  // The id format includes the row index (`_${i}_`) to guarantee
  // uniqueness even when many records get the same Date.now().
  function addRecords(dataArray) {
    const s = load();
    const out = [];
    const t0 = Date.now();
    dataArray.forEach((data, i) => {
      const rec = {
        id: 'r_' + t0 + '_' + i + '_' + Math.random().toString(36).slice(2, 7),
        createdAt: t0,
        ...data
      };
      s.records.push(rec);
      out.push(rec);
    });
    save();  // ONE save for the whole batch — this is the optimization
    return out;
  }

  // Update one record by id. The `patch` object is merged into
  // the existing record (so you can pass just the fields you
  // want to change). Returns the updated record, or null if
  // the id wasn't found.
  function updateRecord(id, patch) {
    const s = load();
    const i = s.records.findIndex(r => r.id === id);
    if (i >= 0) {
      s.records[i] = { ...s.records[i], ...patch };
      save();
      return s.records[i];
    }
    return null;
  }

  // Delete a record by id. Hard delete in the prototype —
  // production should soft-delete (set a deletedAt timestamp)
  // so we keep history and can support undo.
  function deleteRecord(id) {
    const s = load();
    s.records = s.records.filter(r => r.id !== id);
    save();
  }
  function updateCompany(patch) {
    const s = load();
    s.company = { ...s.company, ...patch };
    save();
  }
  function updateConfig(patch) {
    const s = load();
    s.config = { ...s.config, ...patch };
    save();
  }
  function updateUser(email, type, patch) {
    const s = load();
    const list = type==='super' ? s.superAdmins : type==='manager' ? s.managers : s.members;
    const i = list.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (i >= 0) { list[i] = { ...list[i], ...patch }; save(); return list[i]; }
    return null;
  }
  function deleteUser(email, type) {
    const s = load();
    const norm = email.toLowerCase();
    if (type==='super')   s.superAdmins = s.superAdmins.filter(u => u.email.toLowerCase()!==norm);
    if (type==='manager') s.managers    = s.managers.filter(u => u.email.toLowerCase()!==norm);
    if (type==='member')  s.members     = s.members.filter(u => u.email.toLowerCase()!==norm);
    save();
  }

  // ---- pending requests -------------------------------------
  function addPending(req) {
    const s = load();
    const r = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      requestedAt: Date.now(),
      status: 'pending',
      ...req
    };
    s.pending.push(r);
    save();
    return r;
  }
  function updatePending(id, patch) {
    const s = load();
    const i = s.pending.findIndex(r => r.id === id);
    if (i >= 0) { s.pending[i] = { ...s.pending[i], ...patch }; save(); return s.pending[i]; }
    return null;
  }
  function pendingForUser(session) {
    // returns pending requests this user is allowed to act on
    const s = load();
    if (!session) return [];
    const open = s.pending.filter(p => p.status === 'pending');
    if (session.type === 'super') {
      // super admins see all manager requests, AND super admin requests if they're an approver
      const approvers = s.config.superAdminApprovers || [];
      const isApprover = approvers.map(e=>e.toLowerCase()).includes(session.user.email.toLowerCase());
      return open.filter(p =>
        p.type === 'manager' ||
        (p.type === 'super' && isApprover)
      );
    }
    if (session.type === 'manager') {
      // managers approve members for their own team
      const team = teamForManager(session.user.email);
      if (!team) return [];
      return open.filter(p => p.type === 'member' && p.payload && p.payload.teamId === team.id);
    }
    return [];
  }

  // ---- notifications ----------------------------------------
  // Notifications are read-only messages directed at a specific
  // user — e.g. "your access was approved". They sit in the same
  // inbox as pending action items but require no decision; the
  // recipient just reads (and optionally marks read).
  function addNotification({ recipientEmail, kind, title, body }) {
    const s = load();
    const n = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      recipientEmail: (recipientEmail || '').toLowerCase(),
      kind: kind || 'info',
      title: title || '',
      body: body || '',
      createdAt: Date.now(),
      readAt: null,
    };
    s.notifications.push(n);
    save();
    return n;
  }

  function notificationsForUser(email) {
    const s = load();
    const norm = (email || '').toLowerCase();
    if (!norm) return [];
    return s.notifications.filter(n => (n.recipientEmail || '').toLowerCase() === norm);
  }

  function markNotificationRead(id) {
    const s = load();
    const i = s.notifications.findIndex(n => n.id === id);
    if (i >= 0 && !s.notifications[i].readAt) {
      s.notifications[i].readAt = Date.now();
      save();
      return s.notifications[i];
    }
    return s.notifications[i] || null;
  }

  // ---- Phase 5: departments + first-run --------------------
  // The pre-seeded list lives in LIBRARY.departments (read-only).
  // Anything an admin types via the "Other" escape hatch goes into
  // state.config.departments. getDepartments() returns the merged
  // view that the UI dropdowns should render.
  function addDepartment(name) {
    const clean = (name || '').trim();
    if (!clean) return;
    const s = load();
    s.config.departments = s.config.departments || [];
    // Idempotent — case-insensitive dupe check across both lists
    const seen = new Set([
      ...(LIBRARY.departments || []),
      ...s.config.departments,
    ].map(d => d.toLowerCase()));
    if (seen.has(clean.toLowerCase())) return;
    s.config.departments.push(clean);
    save();
  }

  function getDepartments() {
    const s = load();
    const seeded = LIBRARY.departments || [];
    const added = s.config.departments || [];
    // De-dupe defensively (case-insensitive); preserve seeded order first.
    const out = [...seeded];
    const lower = new Set(seeded.map(d => d.toLowerCase()));
    for (const d of added) {
      if (!lower.has(d.toLowerCase())) { out.push(d); lower.add(d.toLowerCase()); }
    }
    return out;
  }

  // Phase 5 first-run check. True when no super admin exists AND the
  // platform was never bootstrapped — drives landing.js's "create
  // platform owner" form. After bootstrap, never returns true again.
  function isFirstRun() {
    const s = load();
    return (s.superAdmins || []).length === 0 && s.config.bootstrapped !== true;
  }

  // ---- dev backdoor -----------------------------------------
  // Pre-seed a known super admin so devs (and Mia) can bypass
  // the full signup/approval flow when iterating on the prototype.
  // IDEMPOTENT: safe to call any number of times; only does work
  // if the devadmin account doesn't already exist.
  //
  // The Shift+D shortcut and ?dev=1 URL param both call this and
  // then sign in with the returned creds.
  function bootstrapDev() {
    const s = load();
    const email = 'devadmin@prodlabs.dev';
    const username = 'devadmin';
    const password = 'd3ve1opment!';
    const existing = s.superAdmins.find(u => u.email.toLowerCase() === email);
    if (!existing) {
      s.superAdmins.push({
        email,
        username,
        displayName: 'Dev Admin',
        password,
        approvedBy: '__bootstrap__',
        createdAt: Date.now(),
      });
    } else if (!existing.username) {
      // Backfill username on legacy bootstrap records (Phase 4 → 5).
      existing.username = username;
    }
    // Mark platform as bootstrapped so first-run logic doesn't
    // fire again later. Default the company name if blank.
    s.config.bootstrapped = true;
    if (!s.company.name) s.company.name = 'Chargebacks911';
    // Make sure devadmin can approve future super admins.
    const approvers = (s.config.superAdminApprovers || []).map(e => e.toLowerCase());
    if (!approvers.includes(email)) {
      s.config.superAdminApprovers = [...(s.config.superAdminApprovers || []), email];
    }
    save();
    return { email, username, password };
  }

  // public API
  return {
    get, load, save, reset,
    findUserByEmail, emailInUse,
    teamForManager, teamById, membersOfTeam, recordsOfTeam,
    setSession, clearSession, currentSession,
    addSuperAdmin, addManager, addMember,
    addTeam, addRecord, addRecords, updateRecord, deleteRecord,
    updateCompany, updateConfig, updateUser, deleteUser,
    addPending, updatePending, pendingForUser,
    addNotification, notificationsForUser, markNotificationRead,
    addDepartment, getDepartments, isFirstRun,
    bootstrapDev,
  };

})();
