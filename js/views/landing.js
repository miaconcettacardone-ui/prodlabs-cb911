/* ============================================================
 *  views/landing.js — public entry page (Phase 4)
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  The first screen anyone sees when they hit the app. It used
 *  to have 3 role cards (Super / Manager / Member). In Phase 4
 *  Mia stripped it down to two big CTAs:
 *    - Sign In        → goes to AuthView in 'signin' mode
 *    - Create Account → goes to AuthView in 'rolepick' mode
 *
 *  WHY THE CHANGE?
 *  Before Phase 4, the landing forced people to declare their
 *  role before they'd even seen the app. The new flow is more
 *  familiar: you sign up, then pick what kind of account you're
 *  setting up. Role-pick is now Step 2 of the global stepper.
 *
 *  THE HIDDEN DEV BACKDOOR:
 *  Mia (and devs) can skip the whole signup/approval dance by:
 *    - Pressing Shift+D anywhere on the landing page, OR
 *    - Loading the page with `?dev=1` in the URL.
 *  Either path calls State.bootstrapDev() (idempotent) to
 *  pre-seed `devadmin@prodlabs.dev` / `d3ve1opment!` and then
 *  signs in as that super admin and routes to the app.
 *
 *  This is INTENTIONALLY HIDDEN — there's no button, no hint
 *  in the UI. It exists for prototype iteration speed.
 *
 *  KEYBOARD BINDING NOTE:
 *  The Shift+D listener is attached to `document` (NOT the
 *  landing root) because the landing root gets blown away and
 *  rebuilt by render(). We use a module-scoped `_keysBound`
 *  flag to make sure we only attach the listener ONCE — re-
 *  attaching would fire bootstrapDev() N times per keypress.
 * ============================================================ */

const Landing = (() => {

  // Module-scoped flag so we only attach the global Shift+D
  // listener once across multiple render() calls.
  let _keysBound = false;

  function render() {
    const root = document.getElementById('landing');
    const company = State.get().company.name || 'Chargebacks911';

    // Same chrome as before (nav, hero, foot) — just swap the
    // 3-card section for two CTA cards.
    root.innerHTML = `
      <div class="land-wrap">
        <nav class="land-nav">
          <div class="brand">
            <div class="shield">${Utils.icon('shield', 22)}</div>
            <div class="brand-text">
              ProdLabs
              <small>by ${company}</small>
            </div>
          </div>
          <button class="topbar-btn" data-action="signin">
            ${Utils.icon('arrow', 14)} Sign in
          </button>
        </nav>

        <div class="land-hero">
          <span class="land-eyebrow">Internal Productivity Platform</span>
          <h1>Every team. Every metric. <em>One platform.</em></h1>
          <p>Configure your team in minutes. Track what matters to <strong>your</strong> department — sales, alerts, production, client relations, finance, anywhere. Custom dashboards, real goals, real visibility.</p>
        </div>

        <div class="land-cta">
          <div class="land-cta-card" data-action="signin">
            <div class="lcc-icon">${Utils.icon('arrow', 28)}</div>
            <div class="lcc-text">
              <h3>Sign In</h3>
              <p>Already have an account? Welcome back.</p>
            </div>
          </div>
          <div class="land-cta-card lcc-primary" data-action="create">
            <div class="lcc-icon">${Utils.icon('plus', 28)}</div>
            <div class="lcc-text">
              <h3>Create Account</h3>
              <p>New here? Pick your role and get set up in minutes.</p>
            </div>
          </div>
        </div>

        <div class="land-foot">
          <span>© 2026 ${company}® · Internal platform</span>
          <span>v0.4 prototype · Phase 4 redesign</span>
        </div>
      </div>
    `;

    bindActions(root);
    bindDevBackdoor();
    handleDevQueryParam();
  }

  // ---- Click bindings on the two CTA cards / nav -----------
  function bindActions(root) {
    root.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const a = el.dataset.action;
        if (a === 'signin')      Router.go('auth', { mode: 'signin' });
        else if (a === 'create') Router.go('auth', { mode: 'rolepick' });
      });
    });
  }

  // ---- Hidden Shift+D dev backdoor --------------------------
  function bindDevBackdoor() {
    if (_keysBound) return;
    _keysBound = true;
    document.addEventListener('keydown', (e) => {
      // Only fire when the LANDING view is currently active so
      // we don't accidentally trigger from inside a wizard form.
      const landing = document.getElementById('landing');
      if (!landing || !landing.classList.contains('active')) return;

      // Don't hijack key combos when the user is typing in a
      // form field — would be unfriendly + risk false positives.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                t.tagName === 'SELECT' || t.isContentEditable)) return;

      // Capital "D" only fires when Shift is held. Checking
      // shiftKey explicitly + key === 'D' is the most reliable
      // cross-browser combo.
      if (e.shiftKey && e.key === 'D') {
        e.preventDefault();
        runDevBackdoor();
      }
    });
  }

  // ---- ?dev=1 URL flag --------------------------------------
  function handleDevQueryParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('dev') === '1') {
        runDevBackdoor();
      }
    } catch (e) {
      // URL APIs not available (very old browser / weird env) —
      // silently skip. The Shift+D path still works.
    }
  }

  // The actual backdoor work, shared by both keypress and URL.
  function runDevBackdoor() {
    const creds = State.bootstrapDev();
    const r = Auth.tryLogin(creds.email, creds.password);
    if (!r.ok) {
      Utils.toast('Dev login failed: ' + r.error, 'bad');
      return;
    }
    Utils.toast('Dev login engaged', 'good');
    Router.go('app');
  }

  return { render };
})();
