/* ============================================================
 *  state.js — central data model + persistence
 *  ============================================================
 *  PROTOTYPE: persists to localStorage.
 *  PRODUCTION: replace `loadState`/`saveState` with Supabase calls.
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
 *  Each entity uses email as the unique key (no separate username).
 *  Approvals: every signup creates a PendingRequest until approved.
 * ============================================================ */

const STORAGE_KEY = 'prodlabs_cb911_v2';

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
      session:     null, // {type, email}
      config: {
        superAdminApprovers: [], // emails of super admins who can approve new super admins
        bootstrapped: false,     // becomes true after the very first super admin is created
      }
    };
  }

  // ---- load / save ------------------------------------------
  let _cached = null;
  function load() {
    if (_cached) return _cached;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _cached = raw ? JSON.parse(raw) : defaultState();
      // make sure new fields exist when migrating
      const def = defaultState();
      _cached = { ...def, ..._cached, config: { ...def.config, ...(_cached.config||{}) } };
    } catch (e) {
      console.error('State load failed:', e);
      _cached = defaultState();
    }
    return _cached;
  }
  function save() {
    if (!_cached) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_cached));
    } catch (e) {
      console.error('State save failed:', e);
    }
  }
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
  function addRecord(data) {
    const s = load();
    const rec = { id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2,7), createdAt: Date.now(), ...data };
    s.records.push(rec);
    save();
    return rec;
  }
  function updateRecord(id, patch) {
    const s = load();
    const i = s.records.findIndex(r => r.id === id);
    if (i >= 0) { s.records[i] = { ...s.records[i], ...patch }; save(); return s.records[i]; }
    return null;
  }
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

  // public API
  return {
    get, load, save, reset,
    findUserByEmail, emailInUse,
    teamForManager, teamById, membersOfTeam, recordsOfTeam,
    setSession, clearSession, currentSession,
    addSuperAdmin, addManager, addMember,
    addTeam, addRecord, updateRecord, deleteRecord,
    updateCompany, updateConfig, updateUser, deleteUser,
    addPending, updatePending, pendingForUser,
  };

})();
