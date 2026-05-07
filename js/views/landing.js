/* ============================================================
 *  views/landing.js — Phase 5 entry page
 * ============================================================
 *
 *  Phase 5 simplification:
 *  Self-signup is gone. Landing renders ONE of two forms:
 *
 *    1) First-run bootstrap (State.isFirstRun() === true)
 *       — collects display name + username + email + password
 *       — creates the platform owner super admin directly
 *       — auto-signs them in and routes to /app
 *
 *    2) Login (everything after first run)
 *       — username + password
 *       — Auth.tryLogin → Router.go('app') on success
 *
 *  No "Create Account" link. No role picker. No wizard.
 *  Self-service signup is gated by CONFIG.FEATURES.selfSignup
 *  (false in Phase 5). Laravel can flip it on later.
 *
 *  Dev backdoor (Shift+D / ?dev=1) is unchanged from Phase 4 —
 *  it calls State.bootstrapDev() and signs in as devadmin.
 *  The keypress listener attaches once per page lifetime.
 * ============================================================ */

const Landing = (() => {

  // Module-scoped flag — only attach the global Shift+D listener once.
  let _keysBound = false;

  function render() {
    const root = document.getElementById('landing');
    const company = State.get().company.name || 'Chargebacks911';

    const firstRun = State.isFirstRun();

    root.innerHTML = `
      <div class="land-wrap">
        <nav class="land-nav">
          <div class="brand">
            <div class="shield">${Utils.icon('shield', 22)}</div>
            <div class="brand-text">
              ProdLabs
              <small>by ${esc(company)}</small>
            </div>
          </div>
        </nav>

        <div class="land-hero land-hero-tight">
          ${firstRun ? renderBootstrapHero() : renderLoginHero()}
        </div>

        <div class="land-foot">
          <span>© 2026 ${esc(company)}® · Internal platform</span>
          <span>v0.5 prototype · Phase 5</span>
        </div>
      </div>
    `;

    if (firstRun) bindBootstrapForm(root);
    else          bindLoginForm(root);
    bindDevBackdoor();
    handleDevQueryParam();
  }

  // ---- First-run bootstrap card ----------------------------
  function renderBootstrapHero() {
    return `
      <span class="land-eyebrow">First-time setup</span>
      <h1>Welcome to <em>ProdLabs</em>.</h1>
      <p>Let's create the platform owner account. After this, all other accounts are added by super admins from inside the app.</p>

      <div class="land-form-card">
        <h3>Create platform owner</h3>
        <div id="bs-err" class="err-msg"></div>
        <div class="form-row">
          <label class="label">Display name</label>
          <input id="bs-display" type="text" placeholder="Mia Cardone" autocomplete="name" />
        </div>
        <div class="form-grid-2">
          <div class="form-row">
            <label class="label">Username</label>
            <input id="bs-username" type="text" placeholder="miac" autocomplete="username" />
          </div>
          <div class="form-row">
            <label class="label">Email</label>
            <input id="bs-email" type="email" placeholder="mia@chargebacks911.com" autocomplete="email" />
          </div>
        </div>
        <div class="form-row">
          <label class="label">Password</label>
          <input id="bs-password" type="password" placeholder="Min ${CONFIG.PASSWORD_MIN_LENGTH} characters" autocomplete="new-password" />
        </div>
        <button class="btn btn-primary btn-block" id="bs-submit">
          ${Utils.icon('arrow', 14)} Create owner account
        </button>
      </div>
    `;
  }

  // ---- Login card ------------------------------------------
  function renderLoginHero() {
    return `
      <span class="land-eyebrow">Sign in</span>
      <h1>Welcome back to <em>ProdLabs</em>.</h1>
      <p>Internal productivity platform for Chargebacks911 teams.</p>

      <div class="land-form-card">
        <h3>Sign in</h3>
        <div id="lg-err" class="err-msg"></div>
        <div class="form-row">
          <label class="label">Username</label>
          <input id="lg-username" type="text" placeholder="username" autocomplete="username" />
        </div>
        <div class="form-row">
          <label class="label">Password</label>
          <input id="lg-password" type="password" placeholder="••••••••" autocomplete="current-password" />
        </div>
        <button class="btn btn-primary btn-block" id="lg-submit">
          ${Utils.icon('arrow', 14)} Sign in
        </button>
      </div>
    `;
  }

  // ---- Bootstrap form behavior -----------------------------
  function bindBootstrapForm(root) {
    const err   = root.querySelector('#bs-err');
    const fName = root.querySelector('#bs-display');
    const fUser = root.querySelector('#bs-username');
    const fMail = root.querySelector('#bs-email');
    const fPass = root.querySelector('#bs-password');
    const btn   = root.querySelector('#bs-submit');

    const showErr = (m) => { err.textContent = m; err.classList.add('show'); };
    const clearErr = () => err.classList.remove('show');

    const submit = () => {
      clearErr();
      const displayName = (fName.value||'').trim();
      const username    = (fUser.value||'').trim();
      const email       = (fMail.value||'').trim().toLowerCase();
      const password    = fPass.value || '';
      if (!displayName || !username || !email || !password) {
        showErr('All fields are required.'); return;
      }
      if (!/^[a-z0-9_.-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
        showErr('Email looks invalid.'); return;
      }
      if (password.length < CONFIG.PASSWORD_MIN_LENGTH) {
        showErr(`Password must be at least ${CONFIG.PASSWORD_MIN_LENGTH} characters.`); return;
      }
      if (Auth.usernameInUse(username)) { showErr('Username already in use.'); return; }
      if (State.emailInUse(email))      { showErr('Email already in use.'); return; }

      // Direct create — no pending queue. This is the platform owner.
      State.addSuperAdmin({
        email, username, displayName, password,
        approvedBy: '__bootstrap__',
      });
      State.updateConfig({
        bootstrapped: true,
        superAdminApprovers: [email],
      });
      if (!State.get().company.name) State.updateCompany({ name: 'Chargebacks911' });
      State.setSession('super', email);
      Utils.toast('Platform owner created — welcome!', 'good');
      Router.go('app');
    };

    btn.addEventListener('click', submit);
    [fName, fUser, fMail, fPass].forEach(i => {
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });
  }

  // ---- Login form behavior ---------------------------------
  function bindLoginForm(root) {
    const err   = root.querySelector('#lg-err');
    const fUser = root.querySelector('#lg-username');
    const fPass = root.querySelector('#lg-password');
    const btn   = root.querySelector('#lg-submit');

    const showErr = (m) => { err.textContent = m; err.classList.add('show'); };
    const clearErr = () => err.classList.remove('show');

    const submit = () => {
      clearErr();
      const username = (fUser.value || '').trim();
      const password = fPass.value || '';
      if (!username || !password) { showErr('Username and password required.'); return; }
      const r = Auth.tryLogin(username, password);
      if (!r.ok) { showErr(r.error); return; }
      Utils.toast('Welcome back', 'good');
      Router.go('app');
    };

    btn.addEventListener('click', submit);
    [fUser, fPass].forEach(i => {
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });
  }

  // ---- Dev backdoor (unchanged from Phase 4) ----------------
  function bindDevBackdoor() {
    if (_keysBound) return;
    _keysBound = true;
    document.addEventListener('keydown', (e) => {
      const landing = document.getElementById('landing');
      if (!landing || !landing.classList.contains('active')) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.shiftKey && e.key === 'D') {
        e.preventDefault();
        runDevBackdoor();
      }
    });
  }

  function handleDevQueryParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('dev') === '1') runDevBackdoor();
    } catch (e) { /* old browser — Shift+D still works */ }
  }

  function runDevBackdoor() {
    const creds = State.bootstrapDev();
    // Phase 5: tryLogin takes username, not email
    const r = Auth.tryLogin(creds.username, creds.password);
    if (!r.ok) { Utils.toast('Dev login failed: ' + r.error, 'bad'); return; }
    Utils.toast('Dev login engaged', 'good');
    Router.go('app');
  }

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render };
})();
