/* ============================================================
 *  app.js — main router + boot
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  This is the "traffic cop" of the whole app. When you click
 *  "Sign In" or "Sign Up" or get bounced to the dashboard, the
 *  Router decides which big view to show.
 *
 *  THE ROUTER MODEL:
 *  Most modern web apps use URL-based routing (#/dashboard).
 *  This prototype uses simpler "view-based" routing — there are
 *  exactly 4 named views, and Router.go(viewName) switches between
 *  them by toggling CSS classes.
 *
 *  Views:
 *    'landing' - the logged-out home page
 *    'auth'    - sign-in / sign-up forms
 *    'wizard'  - team setup (newly-approved managers go here)
 *    'app'     - the dashboard. Routes BY ROLE to:
 *                  - SuperView (super_admin)
 *                  - ManagerView (manager)
 *                  - MemberView (member)
 *
 *  WHY THIS PATTERN?
 *  - No URL routing means we don't have to deal with browser
 *    history, deep links, or the back button. Simpler for a
 *    prototype.
 *  - The Laravel rebuild will use real URL routes, but the
 *    "by role" dispatch in the dashboard still applies.
 *
 *  Globals exposed:
 *    Router.go(view, opts)  - swap to a view
 * ============================================================ */

const Router = (() => {

  // Phase 5: only landing + app remain. Self-signup wizard and the
  // standalone auth view are gone — landing handles login + first-run
  // bootstrap, super.js handles user creation in-app.
  const VIEWS = ['landing', 'app'];

  function go(view, opts = {}) {
    if (!VIEWS.includes(view)) view = 'landing';

    // for 'app' route, must have a session
    if (view === 'app') {
      const session = State.currentSession();
      if (!session) { go('landing'); return; }
    }

    // hide all
    VIEWS.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.classList.remove('active');
    });

    // kill splash if present
    const sp = document.getElementById('splash');
    if (sp) sp.style.display = 'none';

    // show target
    const target = document.getElementById(view);
    if (target) target.classList.add('active');

    // dispatch
    if (view === 'landing') Landing.render();
    else if (view === 'app') renderApp();

    window.scrollTo(0, 0);
  }

  function renderApp() {
    const session = State.currentSession();
    if (!session) { go('landing'); return; }

    const root = document.getElementById('app');
    const company = State.get().company.name || 'Chargebacks911';

    // Map the internal session.type to a friendlier label so
    // the topbar reads "Super Admin · Mia C." instead of "super".
    const roleLabel = (t) => t === 'super' ? 'Super Admin' : t === 'manager' ? 'Manager' : 'Member';
    const badgeClass = session.type === 'super' ? 'badge-super'
                     : session.type === 'manager' ? 'badge-mgr'
                     : 'badge-mem';

    // Phase 5 topbar: black bg, 2px red stripe (in app.css), email
    // visible next to display name (per decision #9).
    root.innerHTML = `
      <div class="topbar">
        <div class="brand">
          <div class="shield">${Utils.icon('shield', 20)}</div>
          <div class="brand-text">
            ProdLabs
            <small>${escape(company)}</small>
          </div>
        </div>
        <div class="topbar-spacer"></div>
        <div class="tbu">
          <span class="badge ${badgeClass}">${roleLabel(session.type)}</span>
          <div class="tbu-id">
            <span class="tbu-name">${escape(session.user.displayName)}</span>
            <span class="tbu-email">${escape(session.user.email)}</span>
          </div>
        </div>
        <div class="tb-actions">
          <button class="topbar-btn" id="tb-logout">${Utils.icon('logout',14)} Sign Out</button>
        </div>
      </div>
      <div class="tabs" id="app-tabs"></div>
      <div class="main" id="app-main"></div>
    `;

    document.getElementById('tb-logout').onclick = () => {
      Auth.logout();
      Utils.toast('Signed out');
      go('landing');
    };

    if (session.type === 'super') SuperView.render(session);
    else if (session.type === 'manager') ManagerView.render(session);
    else if (session.type === 'member') MemberView.render(session);
  }

  function escape(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { go };

})();

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
  const session = State.currentSession();
  if (session) Router.go('app');
  else Router.go('landing');
});

// listen for refresh events from anywhere
document.addEventListener('app:refresh', () => {
  const active = document.querySelector('#landing.active, #app.active');
  if (active) Router.go(active.id);
});
