/* ============================================================
 *  views/auth.js — login + member signup
 * ============================================================ */

const AuthView = (() => {

  let mode = 'signin'; // 'signin' | 'signup-member'

  function render(opts={}) {
    mode = opts.mode || 'signin';
    const root = document.getElementById('auth');
    const company = State.get().company.name || 'Chargebacks911';

    if (mode === 'signin') {
      root.innerHTML = `
        <div class="auth-card">
          <button class="auth-back" data-action="back">${Utils.icon('back', 14)} Back</button>
          <div class="brand">
            <div class="shield">${Utils.icon('shield', 22)}</div>
            <div class="brand-text">
              ProdLabs
              <small>by ${company}</small>
            </div>
          </div>
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
            New here? <a data-action="back">Choose account type</a>
          </div>
        </div>
      `;
    } else {
      // member signup — needs to pick a team
      const teams = State.get().teams;
      root.innerHTML = `
        <div class="auth-card">
          <button class="auth-back" data-action="back">${Utils.icon('back', 14)} Back</button>
          <div class="brand">
            <div class="shield">${Utils.icon('shield', 22)}</div>
            <div class="brand-text">
              ProdLabs
              <small>by ${company}</small>
            </div>
          </div>
          <h1>Request team access</h1>
          <p class="auth-sub">Your manager will approve before you can sign in.</p>

          ${teams.length === 0 ? `
            <div class="notice warn">
              <strong>No teams yet.</strong> No managers have set up teams in ${company}.
              Ask your manager to set up the team first, then come back here.
            </div>
            <button class="btn btn-ghost btn-block" data-action="back">Back to home</button>
          ` : `
            <div class="form-row">
              <label class="label">Your full name</label>
              <input type="text" id="ms-name" placeholder="Jane Doe">
            </div>
            <div class="form-row">
              <label class="label">Work email</label>
              <input type="email" id="ms-email" placeholder="you@company.com" autocomplete="email">
            </div>
            <div class="form-row">
              <label class="label">Choose a password</label>
              <input type="password" id="ms-pass" placeholder="set a password" autocomplete="new-password">
            </div>
            <div class="form-row">
              <label class="label">Which team?</label>
              <select id="ms-team">
                <option value="">— Select your team —</option>
                ${teams.map(t => {
                  const mgr = State.get().managers.find(m => m.email === t.managerEmail);
                  return `<option value="${t.id}">${t.name}${t.department?' · '+t.department:''}${mgr?' · mgr: '+mgr.displayName:''}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="form-row">
              <label class="label">Your role on the team (optional)</label>
              <input type="text" id="ms-role" placeholder="e.g. Analyst, Coordinator">
            </div>
            <div id="ms-err" class="err-msg"></div>
            <button class="btn btn-primary btn-block btn-lg" data-action="signup">Submit Request ${Utils.icon('arrow', 14)}</button>

            <div class="auth-foot">
              Already have an account? <a data-action="signin">Sign in</a>
            </div>
          `}
        </div>
      `;
    }

    bind(root);
    setTimeout(() => {
      const first = root.querySelector('input');
      if (first) first.focus();
    }, 60);
  }

  function bind(root) {
    root.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const a = el.dataset.action;
        if (a === 'back') Router.go('landing');
        else if (a === 'signin') doSignin();
        else if (a === 'signup') doMemberSignup();
      });
    });
    // enter key
    root.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (mode === 'signin') doSignin();
          else doMemberSignup();
        }
      });
    });
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

  function doMemberSignup() {
    const name = document.getElementById('ms-name').value.trim();
    const email = document.getElementById('ms-email').value.trim();
    const pass = document.getElementById('ms-pass').value;
    const teamId = document.getElementById('ms-team').value;
    const role = document.getElementById('ms-role').value.trim();
    const errEl = document.getElementById('ms-err');

    if (!name || !email || !pass || !teamId) {
      errEl.textContent = 'Name, email, password and team are all required.';
      errEl.classList.add('show');
      return;
    }
    if (!Utils.validEmail(email)) {
      errEl.textContent = 'Please enter a valid email address.';
      errEl.classList.add('show');
      return;
    }
    const result = Auth.requestMember({
      email, displayName: name, password: pass, teamId, role
    });
    if (!result.ok) {
      errEl.textContent = result.error;
      errEl.classList.add('show');
      return;
    }
    // show success
    showSuccess(name, 'manager');
  }

  function showSuccess(name, who) {
    const root = document.getElementById('auth');
    const company = State.get().company.name || 'Chargebacks911';
    root.innerHTML = `
      <div class="auth-card">
        <div class="text-center">
          <div style="width:80px;height:80px;background:var(--grd);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;color:#065f46">
            ${Utils.icon('check', 40)}
          </div>
          <h1>Request submitted!</h1>
          <p class="auth-sub" style="margin-bottom:1.5rem">Thanks, ${name.split(' ')[0]}. Your access request is on its way to your ${who}.</p>
          <div class="notice">
            You'll be able to sign in as soon as your ${who} approves your request. Watch your email — in the prototype we don't send mail, but in production this would trigger a notification.
          </div>
          <button class="btn btn-primary btn-block btn-lg" data-action="back-home">Back to home</button>
        </div>
      </div>
    `;
    root.querySelector('[data-action=back-home]').addEventListener('click', () => Router.go('landing'));
  }

  return { render };

})();
