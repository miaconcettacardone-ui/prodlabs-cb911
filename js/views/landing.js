/* ============================================================
 *  views/landing.js — public entry page with 3 doorways
 * ============================================================ */

const Landing = (() => {

  function render() {
    const root = document.getElementById('landing');
    const isBootstrapped = Auth.isBootstrapped();
    const company = State.get().company.name || 'Chargebacks911';

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

        <div class="land-cards">
          ${renderCard('super', isBootstrapped)}
          ${renderCard('manager', isBootstrapped)}
          ${renderCard('member', isBootstrapped)}
        </div>

        <div class="land-foot">
          <span>© 2026 ${company}® · Internal platform</span>
          <span>v0.2 prototype · approval workflow enabled</span>
        </div>
      </div>
    `;

    // bind events
    root.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const a = el.dataset.action;
        if (a === 'signin') Router.go('auth', { mode: 'signin' });
        else if (a === 'signup-super')   Router.go('wizard', { type: 'super' });
        else if (a === 'signup-manager') Router.go('wizard', { type: 'manager' });
        else if (a === 'signup-member')  Router.go('auth',   { mode: 'signup-member' });
      });
    });
  }

  function renderCard(role, isBootstrapped) {
    if (role === 'super') {
      const label = isBootstrapped ? 'Request super admin access' : 'Set up the platform';
      const note = isBootstrapped
        ? 'Existing super admins must approve your request before you can sign in.'
        : "You're the first one here. Create the platform owner account.";
      return `
        <div class="land-card" data-action="signup-super">
          <div class="lc-icon">${Utils.icon('crown', 26)}</div>
          <h3>Super Admin</h3>
          <p>Full company access. See every team's performance, manage global settings, approve managers and other admins. ${note}</p>
          <span class="lc-arrow">${label}</span>
        </div>
      `;
    }
    if (role === 'manager') {
      return `
        <div class="land-card" data-action="signup-manager">
          <div class="lc-icon">${Utils.icon('mgr', 26)}</div>
          <h3>Team Manager</h3>
          <p>Run the setup wizard to configure your team — departments, roles, work units, goals. After super admin approval, your team gets a custom dashboard built for how <em>they</em> work.</p>
          <span class="lc-arrow">Set up your team</span>
        </div>
      `;
    }
    return `
      <div class="land-card" data-action="signup-member">
        <div class="lc-icon">${Utils.icon('user', 26)}</div>
        <h3>Team Member</h3>
        <p>Already have an invite from your manager? Sign in with your email. New here? Request access to your team — your manager will approve.</p>
        <span class="lc-arrow">Sign in or request access</span>
      </div>
    `;
  }

  return { render };
})();
