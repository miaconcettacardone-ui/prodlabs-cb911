/* ============================================================
 *  views/auth.js — sign in + signup flows (Phase 4)
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  Handles every "outside the app" form: sign in, role pick,
 *  and the three signup forms (super / manager / member).
 *
 *  THE FIVE MODES:
 *    'signin'         - Welcome back form (no stepper)
 *    'rolepick'       - Step 2: pick your role (3 cards)
 *    'signup-super'   - Step 1 form for super admin signup
 *    'signup-manager' - Step 1 form for manager signup (then
 *                       hands off to wizard for steps 3-7)
 *    'signup-member'  - Step 1 form for member signup
 *
 *  THE STEPPER:
 *  We always show the global stepper above the form (except
 *  on signin). The signup-* modes are step 1; rolepick is
 *  step 2; the wizard renders steps 3-7 itself.
 *
 *  WHY rolepick LIVES HERE (not in landing):
 *  Two reasons:
 *    - It needs the same back-button + stepper chrome as the
 *      signup forms (visual consistency).
 *    - It hands off to OTHER auth modes via Router.go('auth',
 *      {mode: ...}) — simpler if it's all in one file.
 *
 *  THE MANAGER HANDOFF:
 *  When a manager fills out the signup form, we DON'T submit
 *  a pending request directly — we hand off to the wizard with
 *  the form data as a `seed`. The wizard pre-fills its account
 *  step from the seed (and skips it) and lets the manager
 *  configure team/units/fields/roles/goals BEFORE submitting
 *  the whole bundle as one approval request.
 * ============================================================ */

const AuthView = (() => {

  let mode = 'signin';

  function render(opts={}) {
    mode = opts.mode || 'signin';
    const root = document.getElementById('auth');
    const company = State.get().company.name || 'Chargebacks911';

    // The stepper sits ABOVE the card on all signup-related
    // modes. Sign in doesn't show it (passes 0).
    const step = stepForMode(mode);
    const stepperHTML = Stepper.render(step);

    // Role pick gets a wider card to fit 3 role cards side by
    // side. The other modes use the regular .auth-card width.
    const cardClass = mode === 'rolepick' ? 'auth-card auth-card-wide' : 'auth-card';

    root.innerHTML = `
      ${stepperHTML}
      <div class="${cardClass}">
        <button class="auth-back" data-action="back">${Utils.icon('back', 14)} Back</button>
        <div class="brand">
          <div class="shield">${Utils.icon('shield', 22)}</div>
          <div class="brand-text">
            ProdLabs
            <small>by ${company}</small>
          </div>
        </div>
        ${renderInner(mode, company)}
      </div>
    `;

    bind(root);
    setTimeout(() => {
      const first = root.querySelector('input');
      if (first) first.focus();
    }, 60);
  }

  // ---- Map mode → which step of the global stepper to show
  function stepForMode(m) {
    if (m === 'signin')   return 0;            // hidden
    if (m === 'rolepick') return 2;            // step 2
    return 1;                                   // signup-* = step 1
  }

  // ---- Inner HTML per mode --------------------------------
  function renderInner(m, company) {
    if (m === 'signin')         return renderSignin();
    if (m === 'rolepick')       return renderRolePick();
    if (m === 'signup-super')   return renderSignupSuper();
    if (m === 'signup-manager') return renderSignupManager();
    if (m === 'signup-member')  return renderSignupMember(company);
    return '<p>Unknown mode</p>';
  }

  // ----- SIGNIN -----
  function renderSignin() {
    return `
      <h1>Welcome back</h1>
      <p class="auth-sub">Sign in to your dashboard</p>

      <div class="form-row">
        <label class="label">Email</label>
        <input type="email" id="li-email" placeholder="you@company.com" autocomplete="email">
      </div>
      <div class="form-row">
        <label class="label">Password</label>
        <input type="password" id="li-pass" placeholder="your password" autocomplete="current-password">
      </div>
      <div id="li-err" class="err-msg"></div>
      <button class="btn btn-primary btn-block btn-lg" data-action="signin">Sign In ${Utils.icon('arrow', 14)}</button>

      <div class="auth-foot">
        New here? <a data-action="rolepick">Create an account</a>
      </div>
    `;
  }

  // ----- ROLE PICK -----
  function renderRolePick() {
    return `
      <h1>What kind of account?</h1>
      <p class="auth-sub">Pick the role that matches what you'll be doing.</p>

      <div class="role-pick-grid">
        <div class="role-pick-card" data-role="super">
          <div class="rpc-icon">${Utils.icon('crown', 26)}</div>
          <div class="rpc-title">Super Admin</div>
          <div class="rpc-body">Full access. Approve managers, manage company-wide settings, see every team.</div>
          <div class="rpc-arrow">${Utils.icon('arrow', 14)}</div>
        </div>
        <div class="role-pick-card" data-role="manager">
          <div class="rpc-icon">${Utils.icon('mgr', 26)}</div>
          <div class="rpc-title">Manager</div>
          <div class="rpc-body">Run the setup wizard to configure your team. After approval, your team gets a custom dashboard.</div>
          <div class="rpc-arrow">${Utils.icon('arrow', 14)}</div>
        </div>
        <div class="role-pick-card" data-role="member">
          <div class="rpc-icon">${Utils.icon('user', 26)}</div>
          <div class="rpc-title">Team Member</div>
          <div class="rpc-body">Join your team. Your manager will approve before you can sign in.</div>
          <div class="rpc-arrow">${Utils.icon('arrow', 14)}</div>
        </div>
      </div>

      <div class="auth-foot">
        Already have an account? <a data-action="signin">Sign in</a>
      </div>
    `;
  }

  // ----- SIGNUP: SUPER -----
  function renderSignupSuper() {
    const bootstrap = !Auth.isBootstrapped();
    return `
      <h1>Super admin signup</h1>
      <p class="auth-sub">${bootstrap
        ? "You're the first one here — your account becomes the platform owner instantly."
        : "Your request will be queued for an existing super admin to approve."}</p>

      <div class="form-row">
        <label class="label">Display name</label>
        <input type="text" id="su-name" placeholder="Jane Doe">
      </div>
      <div class="form-row">
        <label class="label">Work email</label>
        <input type="email" id="su-email" placeholder="you@company.com" autocomplete="email">
      </div>
      <div class="form-row">
        <label class="label">Password</label>
        <input type="password" id="su-pass" placeholder="set a password" autocomplete="new-password">
      </div>
      <div id="su-err" class="err-msg"></div>
      <button class="btn btn-primary btn-block btn-lg" data-action="submit-super">Create account ${Utils.icon('arrow', 14)}</button>
    `;
  }

  // ----- SIGNUP: MANAGER -----
  function renderSignupManager() {
    return `
      <h1>Manager signup</h1>
      <p class="auth-sub">First, basic info. Then we'll walk you through configuring your team.</p>

      <div class="form-row">
        <label class="label">Display name</label>
        <input type="text" id="su-name" placeholder="Alex Garcia">
      </div>
      <div class="form-row">
        <label class="label">Work email</label>
        <input type="email" id="su-email" placeholder="you@company.com" autocomplete="email">
      </div>
      <div class="form-row">
        <label class="label">Password</label>
        <input type="password" id="su-pass" placeholder="set a password" autocomplete="new-password">
      </div>
      <div id="su-err" class="err-msg"></div>
      <button class="btn btn-primary btn-block btn-lg" data-action="submit-manager">Continue to setup ${Utils.icon('arrow', 14)}</button>
    `;
  }

  // ----- SIGNUP: MEMBER -----
  function renderSignupMember(company) {
    const teams = State.get().teams;
    if (teams.length === 0) {
      return `
        <h1>Request team access</h1>
        <div class="notice warn">
          <strong>No teams yet.</strong> No managers have set up teams in ${company}.
          Ask your manager to set up the team first, then come back here.
        </div>
        <button class="btn btn-ghost btn-block" data-action="back">Back</button>
      `;
    }
    return `
      <h1>Request team access</h1>
      <p class="auth-sub">Your manager will approve before you can sign in.</p>

      <div class="form-row">
        <label class="label">Your full name</label>
        <input type="text" id="su-name" placeholder="Jane Doe">
      </div>
      <div class="form-row">
        <label class="label">Work email</label>
        <input type="email" id="su-email" placeholder="you@company.com" autocomplete="email">
      </div>
      <div class="form-row">
        <label class="label">Choose a password</label>
        <input type="password" id="su-pass" placeholder="set a password" autocomplete="new-password">
      </div>
      <div class="form-row">
        <label class="label">Which team?</label>
        <select id="su-team">
          <option value="">— Select your team —</option>
          ${teams.map(t => {
            const mgr = State.get().managers.find(m => m.email === t.managerEmail);
            return `<option value="${t.id}">${t.name}${t.department?' · '+t.department:''}${mgr?' · mgr: '+mgr.displayName:''}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-row">
        <label class="label">Your role on the team (optional)</label>
        <input type="text" id="su-role" placeholder="e.g. Analyst, Coordinator">
      </div>
      <div id="su-err" class="err-msg"></div>
      <button class="btn btn-primary btn-block btn-lg" data-action="submit-member">Submit Request ${Utils.icon('arrow', 14)}</button>
    `;
  }

  // ---- BIND -----------------------------------------------
  function bind(root) {
    root.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        handleAction(el.dataset.action);
      });
    });
    root.querySelectorAll('[data-role]').forEach(el => {
      el.addEventListener('click', () => {
        const r = el.dataset.role;
        if (r === 'super')   Router.go('auth', { mode: 'signup-super' });
        if (r === 'manager') Router.go('auth', { mode: 'signup-manager' });
        if (r === 'member')  Router.go('auth', { mode: 'signup-member' });
      });
    });
    // Enter-key submit on the active form
    root.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (mode === 'signin')         doSignin();
          else if (mode === 'signup-super')   doSubmitSuper();
          else if (mode === 'signup-manager') doSubmitManager();
          else if (mode === 'signup-member')  doSubmitMember();
        }
      });
    });
  }

  function handleAction(a) {
    if (a === 'back') {
      // From signup-* go back to role pick. From rolepick or
      // signin go back to the landing page.
      if (mode === 'signup-super' || mode === 'signup-manager' || mode === 'signup-member') {
        Router.go('auth', { mode: 'rolepick' });
      } else {
        Router.go('landing');
      }
    } else if (a === 'signin')          Router.go('auth', { mode: 'signin' });
    else if (a === 'rolepick')          Router.go('auth', { mode: 'rolepick' });
    else if (a === 'submit-super')      doSubmitSuper();
    else if (a === 'submit-manager')    doSubmitManager();
    else if (a === 'submit-member')     doSubmitMember();
  }

  function doSignin() {
    const email = document.getElementById('li-email').value;
    const pass  = document.getElementById('li-pass').value;
    const errEl = document.getElementById('li-err');
    const result = Auth.tryLogin(email, pass);
    if (!result.ok) {
      errEl.textContent = result.error;
      errEl.classList.add('show');
      return;
    }
    Router.go('app');
  }

  // ---- shared field reading helpers -----------------------
  function readSignupFields() {
    return {
      name:  (document.getElementById('su-name')?.value || '').trim(),
      email: (document.getElementById('su-email')?.value || '').trim(),
      pass:  document.getElementById('su-pass')?.value || '',
    };
  }

  function showErr(msg) {
    const errEl = document.getElementById('su-err');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.add('show');
  }

  function validateBasic({ name, email, pass }) {
    if (!name || !email || !pass) { showErr('Name, email, and password are all required.'); return false; }
    if (!Utils.validEmail(email)) { showErr('Please enter a valid email address.'); return false; }
    return true;
  }

  // ---- super signup --------------------------------------
  function doSubmitSuper() {
    const f = readSignupFields();
    if (!validateBasic(f)) return;
    const result = Auth.requestSuperAdmin({
      email: f.email, displayName: f.name, password: f.pass,
    });
    if (!result.ok) { showErr(result.error); return; }
    if (result.autoApproved) {
      // First super admin: log them right in.
      State.setSession('super', f.email);
      Router.go('app');
    } else {
      // Queued for approval — show success card.
      showSuccess(f.name, 'super admin');
    }
  }

  // ---- manager signup → hand off to wizard ----------------
  function doSubmitManager() {
    const f = readSignupFields();
    if (!validateBasic(f)) return;
    if (State.emailInUse(f.email)) { showErr('Email already in use'); return; }
    // Pass the form data as a SEED to the wizard. The wizard
    // pre-fills its account step from the seed and skips that
    // step (since we already collected it here).
    Router.go('wizard', {
      type: 'manager',
      seed: { email: f.email, displayName: f.name, password: f.pass }
    });
  }

  // ---- member signup -------------------------------------
  function doSubmitMember() {
    const f = readSignupFields();
    if (!validateBasic(f)) return;
    const teamId = document.getElementById('su-team')?.value || '';
    const role   = (document.getElementById('su-role')?.value || '').trim();
    if (!teamId) { showErr('Please pick a team.'); return; }
    const result = Auth.requestMember({
      email: f.email, displayName: f.name, password: f.pass, teamId, role,
    });
    if (!result.ok) { showErr(result.error); return; }
    showSuccess(f.name, 'manager');
  }

  // ---- success card --------------------------------------
  function showSuccess(name, who) {
    const root = document.getElementById('auth');
    root.innerHTML = `
      <div class="auth-card">
        <div class="auth-success text-center">
          <div class="auth-check-circle">
            ${Utils.icon('check', 40)}
          </div>
          <h1>Request submitted!</h1>
          <p class="auth-sub" style="margin-bottom:1.5rem">Thanks, ${escape(name.split(' ')[0])}. Your access request is on its way to your ${escape(who)}.</p>
          <div class="notice">
            You'll be able to sign in as soon as your ${escape(who)} approves your request. Watch your email — in the prototype we don't send mail, but in production this would trigger a notification.
          </div>
          <button class="btn btn-primary btn-block btn-lg" data-action="back-home">Back to home</button>
        </div>
      </div>
    `;
    root.querySelector('[data-action=back-home]').addEventListener('click', () => Router.go('landing'));
  }

  function escape(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render };

})();
