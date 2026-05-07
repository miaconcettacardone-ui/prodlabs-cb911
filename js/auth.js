/* ============================================================
 *  auth.js — authentication + approval workflow
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  Handles sign-in, sign-up, and the approval flow. When someone
 *  tries to sign up as a manager or member, this module creates
 *  a "PendingRequest" that has to be approved before they can
 *  actually log in.
 *
 *  THE APPROVAL FLOW:
 *  1. User submits signup form
 *  2. Auth.requestSignup() creates a PendingRequest
 *  3. Approver (super admin or manager) sees it in their queue
 *  4. Approver clicks Approve or Deny
 *  5. On approve: Auth.approve() creates the actual user record
 *  6. User can now sign in
 *
 *  WHY APPROVAL MATTERS:
 *  - Members aren't supposed to add themselves to teams without
 *    their manager knowing.
 *  - Managers aren't supposed to claim a manager role without a
 *    super admin signing off.
 *  - This is a tiny "least privilege" feature that keeps the
 *    system tidy.
 *
 *  PROTOTYPE behavior: plaintext passwords compared in localStorage.
 *  PRODUCTION rebuild: replace with proper auth (bcrypt + sessions).
 *  See PERMISSIONS.md for the full role × action × condition matrix.
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
  // Phase 5: login is by USERNAME, not email. Email is still stored
  // on every user record (for password reset / future Laravel auth)
  // but the username is what users type at the login form.
  function tryLogin(username, password) {
    const norm = (username||'').trim().toLowerCase();
    const pwd  = password || '';
    if (!norm || !pwd) return { ok: false, error: 'Username and password required' };

    const s = State.get();
    const matchUser = (u) => (u.username || '').toLowerCase() === norm;
    let found = null;
    const sa = s.superAdmins.find(matchUser); if (sa) found = { type: 'super',   user: sa };
    if (!found) { const mg = s.managers.find(matchUser); if (mg) found = { type: 'manager', user: mg }; }
    if (!found) { const mb = s.members.find(matchUser);  if (mb) found = { type: 'member',  user: mb }; }

    if (!found) {
      // Self-signup is disabled in Phase 5, so the "pending approval"
      // path is unreachable from any current view. We still surface a
      // clear message in case Laravel re-enables the flow later and
      // someone hits this code path.
      const pending = s.pending.find(p =>
        ((p.username && p.username.toLowerCase() === norm) ||
         (p.email && p.email.toLowerCase() === norm))
        && p.status === 'pending'
      );
      if (pending) return { ok: false, error: 'Your account is pending approval. Check back later.' };
      return { ok: false, error: 'No account found with that username.' };
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

  // Phase 5: usernames are the login key, so we need a unique-check
  // that mirrors State.emailInUse. Case-insensitive, scans all three
  // user lists plus pending requests (in case Laravel re-enables them).
  function usernameInUse(username) {
    const s = State.get();
    const norm = (username || '').trim().toLowerCase();
    if (!norm) return false;
    const hit = (u) => (u.username || '').toLowerCase() === norm;
    if (s.superAdmins.some(hit)) return true;
    if (s.managers.some(hit))    return true;
    if (s.members.some(hit))     return true;
    if (s.pending.some(p => p.status === 'pending' && (p.username || '').toLowerCase() === norm)) return true;
    return false;
  }

  // ---- SIGNUP REQUESTS --------------------------------------
  // Reserved for Laravel — not surfaced in Phase 5 UI.
  // Self-signup is gated by CONFIG.FEATURES.selfSignup (false in P5).
  // Code is kept intact so the Laravel team can re-enable the flow
  // without rebuilding the data model.
  // All return { ok, autoApproved?, error? }

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
  // Reserved for Laravel — not surfaced in Phase 5 UI (no approval
  // queue). Phase 5 admins create users directly via super.js modals.
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
    // Notify the requester so they see the good news in their Inbox
    // the next time they sign in. The body text is role-aware so it
    // matches what they signed up for.
    const roleWord = p.type === 'super' ? 'super admin' : p.type;
    State.addNotification({
      recipientEmail: p.email,
      kind: 'access-approved',
      title: 'Your access has been approved',
      body: `Welcome aboard! You can now sign in as a ${roleWord}.`,
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
    // Same idea — notify the requester so the denial shows up in
    // their inbox if they ever try to sign in (the auth screen also
    // surfaces the denial, but the notification is a backup channel
    // and matches the inbox UX).
    State.addNotification({
      recipientEmail: p.email,
      kind: 'access-denied',
      title: 'Your access request was denied',
      body: note ? note : 'No reason was provided.',
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
    tryLogin, logout, isBootstrapped, usernameInUse,
    requestSuperAdmin, requestManager, requestMember,
    approve, deny, canApprove,
  };

})();
