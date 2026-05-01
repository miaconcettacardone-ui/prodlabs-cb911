/* ============================================================
 *  auth.js — authentication + approval workflow
 *  ============================================================
 *  PROTOTYPE: plaintext password compare in localStorage.
 *  PRODUCTION: replace with Supabase Auth (signInWithPassword,
 *  signUp, magic-link, etc). Approval workflow stays in DB.
 *
 *  Approval rules
 *  --------------
 *  - First super admin: created freely (bootstrap). Marks
 *    State.config.bootstrapped = true.
 *  - Subsequent super admins: must be approved by an existing
 *    super admin who is in State.config.superAdminApprovers.
 *  - Managers: must be approved by ANY super admin.
 *  - Members: must be approved by their team's manager.
 * ============================================================ */

const Auth = (() => {

  // ---- LOGIN ------------------------------------------------
  function tryLogin(email, password) {
    const norm = (email||'').trim().toLowerCase();
    const pwd  = password || '';
    if (!norm || !pwd) return { ok: false, error: 'Email and password required' };

    const found = State.findUserByEmail(norm);
    if (!found) {
      // Surface "pending approval" with friendlier message
      const pending = State.get().pending.find(p =>
        p.email.toLowerCase()===norm && p.status==='pending'
      );
      if (pending) return { ok: false, error: 'Your account is pending approval. Check back later.' };
      const denied = State.get().pending.find(p =>
        p.email.toLowerCase()===norm && p.status==='denied'
      );
      if (denied) return { ok: false, error: 'Your access request was denied.' };
      return { ok: false, error: 'No account found with that email.' };
    }
    if (found.user.password !== pwd) {
      return { ok: false, error: 'Incorrect password.' };
    }
    State.setSession(found.type, found.user.email);
    return { ok: true };
  }

  function logout() { State.clearSession(); }

  // ---- BOOTSTRAP CHECK --------------------------------------
  // Has a super admin ever been created? If not, the very first
  // super admin signup is auto-approved.
  function isBootstrapped() {
    return State.get().config.bootstrapped === true ||
           State.get().superAdmins.length > 0;
  }

  // ---- SIGNUP REQUESTS --------------------------------------
  // All return { ok, autoApproved?, error? }
  // If autoApproved=true, account exists & user can sign in immediately.
  // If autoApproved=false, request is pending.

  function requestSuperAdmin({ email, displayName, password, companyName }) {
    if (!email || !displayName || !password) return { ok:false, error:'All fields required' };
    if (State.emailInUse(email)) return { ok:false, error:'Email already in use' };

    const bootstrap = !isBootstrapped();
    if (bootstrap) {
      // first super admin — auto-create + auto-approver
      State.addSuperAdmin({
        email: email.toLowerCase(),
        displayName, password,
        approvedBy: '__bootstrap__',
      });
      State.updateCompany({ name: companyName || 'Chargebacks911' });
      State.updateConfig({
        bootstrapped: true,
        superAdminApprovers: [email.toLowerCase()],   // bootstrap super becomes the approver
      });
      return { ok:true, autoApproved:true };
    }
    // otherwise: queue for designated approvers
    State.addPending({
      type: 'super',
      email: email.toLowerCase(),
      displayName,
      password,
      payload: { companyName },
    });
    return { ok:true, autoApproved:false };
  }

  function requestManager({ email, displayName, password, teamName, department, wizardData }) {
    if (!email || !displayName || !password) return { ok:false, error:'All fields required' };
    if (State.emailInUse(email)) return { ok:false, error:'Email already in use' };
    if (!isBootstrapped()) {
      return { ok:false, error:'Platform not yet set up — a super admin must onboard first.' };
    }
    State.addPending({
      type: 'manager',
      email: email.toLowerCase(),
      displayName,
      password,
      payload: {
        teamName, department,
        wizardData: wizardData || {}, // workUnits, fields, roles, members, goals
      },
    });
    return { ok:true, autoApproved:false };
  }

  function requestMember({ email, displayName, password, teamId, role }) {
    if (!email || !displayName || !password) return { ok:false, error:'All fields required' };
    if (!teamId) return { ok:false, error:'Team is required' };
    if (State.emailInUse(email)) return { ok:false, error:'Email already in use' };
    State.addPending({
      type: 'member',
      email: email.toLowerCase(),
      displayName,
      password,
      payload: { teamId, role },
    });
    return { ok:true, autoApproved:false };
  }

  // ---- APPROVAL DECISIONS -----------------------------------
  function approve(pendingId, decidedByEmail) {
    const s = State.get();
    const p = s.pending.find(x => x.id === pendingId);
    if (!p || p.status !== 'pending') return { ok:false, error:'Request not found or already decided' };
    const decider = State.findUserByEmail(decidedByEmail);
    if (!decider) return { ok:false, error:'Decider not found' };

    // permission checks
    if (p.type === 'super') {
      if (decider.type !== 'super') return { ok:false, error:'Only super admins can approve super admins' };
      const approvers = (s.config.superAdminApprovers || []).map(e=>e.toLowerCase());
      if (!approvers.includes(decider.user.email.toLowerCase())) {
        return { ok:false, error:'You are not an approved super-admin approver' };
      }
      State.addSuperAdmin({
        email: p.email, displayName: p.displayName, password: p.password,
        approvedBy: decidedByEmail,
      });
    } else if (p.type === 'manager') {
      if (decider.type !== 'super') return { ok:false, error:'Only super admins can approve managers' };
      const wd = p.payload.wizardData || {};
      const team = State.addTeam({
        name: p.payload.teamName,
        department: p.payload.department,
        managerEmail: p.email,
        workUnits: wd.workUnits || [],
        workUnitLabels: wd.workUnitLabels || {},
        fields: wd.fields || [],
        roles: wd.roles || [],
        goals: wd.goals || {},
      });
      State.addManager({
        email: p.email, displayName: p.displayName, password: p.password,
        teamId: team.id, approvedBy: decidedByEmail,
      });
    } else if (p.type === 'member') {
      if (decider.type !== 'super' && decider.type !== 'manager')
        return { ok:false, error:'Only managers or super admins can approve members' };
      if (decider.type === 'manager') {
        const team = State.teamForManager(decider.user.email);
        if (!team || team.id !== p.payload.teamId)
          return { ok:false, error:'You can only approve members of your own team' };
      }
      State.addMember({
        email: p.email, displayName: p.displayName, password: p.password,
        teamId: p.payload.teamId, role: p.payload.role,
        approvedBy: decidedByEmail,
      });
    }

    State.updatePending(pendingId, {
      status: 'approved',
      decidedBy: decidedByEmail,
      decidedAt: Date.now(),
    });
    return { ok:true };
  }

  function deny(pendingId, decidedByEmail, note) {
    const s = State.get();
    const p = s.pending.find(x => x.id === pendingId);
    if (!p || p.status !== 'pending') return { ok:false, error:'Request not found or already decided' };
    State.updatePending(pendingId, {
      status: 'denied',
      decidedBy: decidedByEmail,
      decidedAt: Date.now(),
      decisionNote: note || '',
    });
    return { ok:true };
  }

  // ---- RBAC HELPERS -----------------------------------------
  function canApprove(session, pending) {
    if (!session || !pending || pending.status !== 'pending') return false;
    if (pending.type === 'super') {
      if (session.type !== 'super') return false;
      const approvers = (State.get().config.superAdminApprovers||[]).map(e=>e.toLowerCase());
      return approvers.includes(session.user.email.toLowerCase());
    }
    if (pending.type === 'manager') return session.type === 'super';
    if (pending.type === 'member') {
      if (session.type === 'super') return true;
      if (session.type === 'manager') {
        const team = State.teamForManager(session.user.email);
        return team && team.id === pending.payload.teamId;
      }
      return false;
    }
    return false;
  }

  return {
    tryLogin, logout, isBootstrapped,
    requestSuperAdmin, requestManager, requestMember,
    approve, deny, canApprove,
  };

})();
