/* ============================================================
 *  views/wizard.js — multi-step setup for super admins & managers
 * ============================================================
 *  Two flows:
 *  - super: company info + admin account (auto-approved if first)
 *  - manager: account + team + work units + fields + roles + members + goals
 *    Submitted as a pending request to be approved by super admin.
 * ============================================================ */

const Wizard = (() => {

  let WIZ = null;

  const SUPER_STEPS = [
    { key: 'company',    label: 'Company' },
    { key: 'admin',      label: 'Your Account' },
    { key: 'review',     label: 'Review & Submit' },
    { key: 'done',       label: 'Done' },
  ];

  const MANAGER_STEPS = [
    { key: 'account',    label: 'Account' },
    { key: 'team',       label: 'Team' },
    { key: 'workUnits',  label: 'Work Units', skippable: true },
    { key: 'fields',     label: 'Fields',     skippable: true },
    { key: 'roles',      label: 'Roles',      skippable: true },
    { key: 'goals',      label: 'Goals',      skippable: true },
    { key: 'review',     label: 'Review & Submit' },
    { key: 'done',       label: 'Done' },
  ];

  function render(opts = {}) {
    const type = opts.type === 'super' ? 'super' : 'manager';
    WIZ = {
      type,
      step: 0,
      steps: type === 'super' ? SUPER_STEPS : MANAGER_STEPS,
      data: {
        // shared
        email: '',
        displayName: '',
        password: '',
        // super only
        companyName: State.get().company.name || 'Chargebacks911',
        // manager only
        teamName: '',
        department: '',
        workUnits: [],
        customWorkUnits: [],
        workUnitLabels: {},
        fields: [],
        roles: [],
        goals: {},
      },
    };
    paint();
  }

  function paint() {
    const root = document.getElementById('wizard');
    const company = State.get().company.name || 'Chargebacks911';

    root.innerHTML = `
      <div class="wiz-top">
        <div class="brand">
          <div class="shield">${Utils.icon('shield', 20)}</div>
          <div class="brand-text">ProdLabs Setup</div>
        </div>
        <button class="wiz-exit" id="wiz-exit-btn">Exit setup</button>
      </div>

      <div class="wiz-progress">
        <div class="wiz-steps">
          ${WIZ.steps.map((s,i) => `
            <div class="wiz-step ${i===WIZ.step?'active':''} ${i<WIZ.step?'done':''}">
              <div class="wsn">${i<WIZ.step?'✓':(i+1)}</div>
              <div class="wsl">${s.label}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="wiz-body">
        <div class="wiz-panel">
          ${renderPanel()}
        </div>
      </div>
    `;
    bind();
  }

  function renderPanel() {
    const k = WIZ.steps[WIZ.step].key;
    const d = WIZ.data;

    if (k === 'company') {
      return `
        <h1 class="wiz-h1">Welcome to ProdLabs</h1>
        <p class="wiz-sub">Let's set up your company workspace. ${Auth.isBootstrapped() ? '' : "You're the first one here — your account becomes the platform owner."}</p>
        <div class="wiz-card">
          <div class="form-row">
            <label class="label">Company name</label>
            <input id="w-company" value="${escape(d.companyName)}" placeholder="e.g. Chargebacks911">
            <div class="helper">This appears in the dashboard header and in emails.</div>
          </div>
        </div>
        ${navButtons()}
      `;
    }

    if (k === 'admin') {
      return `
        <h1 class="wiz-h1">Your super admin account</h1>
        <p class="wiz-sub">${Auth.isBootstrapped()
          ? 'Your account will be queued for approval by an existing approver.'
          : "You're the first super admin — your account is created instantly and you become an approver for future super admins."}</p>
        <div class="wiz-card">
          <div class="form-grid-2">
            <div class="form-row">
              <label class="label">Display name</label>
              <input id="w-display" value="${escape(d.displayName)}" placeholder="e.g. Jane Smith">
            </div>
            <div class="form-row">
              <label class="label">Work email</label>
              <input type="email" id="w-email" value="${escape(d.email)}" placeholder="you@company.com">
            </div>
          </div>
          <div class="form-row">
            <label class="label">Password</label>
            <input type="password" id="w-pass" value="${escape(d.password)}" placeholder="set a strong password">
            <div class="helper">⚠️ Prototype: stored in localStorage. Production will use Supabase Auth with proper hashing.</div>
          </div>
        </div>
        ${navButtons()}
      `;
    }

    if (k === 'account') {
      return `
        <h1 class="wiz-h1">Create your manager account</h1>
        <p class="wiz-sub">You'll manage your team only — see your members, approve their access, log work. Other teams are private.</p>
        <div class="wiz-card">
          <div class="form-grid-2">
            <div class="form-row">
              <label class="label">Display name</label>
              <input id="w-display" value="${escape(d.displayName)}" placeholder="e.g. Alex Garcia">
            </div>
            <div class="form-row">
              <label class="label">Work email</label>
              <input type="email" id="w-email" value="${escape(d.email)}" placeholder="you@company.com">
            </div>
          </div>
          <div class="form-row">
            <label class="label">Password</label>
            <input type="password" id="w-pass" value="${escape(d.password)}" placeholder="set a password">
          </div>
          <div class="notice">
            Your request will be reviewed by a super admin before you can sign in.
          </div>
        </div>
        ${navButtons()}
      `;
    }

    if (k === 'team') {
      return `
        <h1 class="wiz-h1">About your team</h1>
        <p class="wiz-sub">Tell us which department you're in and what your team is called.</p>
        <div class="wiz-card">
          <div class="form-row">
            <label class="label">Department</label>
            <select id="w-dept">
              <option value="">— Select department —</option>
              ${LIBRARY.departments.map(dep => `<option ${d.department===dep?'selected':''}>${dep}</option>`).join('')}
              <option value="__other__" ${d.department && !LIBRARY.departments.includes(d.department) ? 'selected':''}>Other (type below)</option>
            </select>
          </div>
          <div class="form-row" id="dept-other-wrap" style="${(d.department && !LIBRARY.departments.includes(d.department)) ? '' : 'display:none'}">
            <label class="label">Custom department name</label>
            <input id="w-dept-other" value="${escape(d.department && !LIBRARY.departments.includes(d.department) ? d.department : '')}" placeholder="e.g. Underwriting">
          </div>
          <div class="form-row">
            <label class="label">Team name</label>
            <input id="w-team-name" value="${escape(d.teamName)}" placeholder="e.g. Alerts East, Sales West, Production Floor 2">
            <div class="helper">Use this if your department has multiple teams (otherwise just put your dept name).</div>
          </div>
        </div>
        ${navButtons()}
      `;
    }

    if (k === 'workUnits') {
      return `
        <h1 class="wiz-h1">What does your team do?</h1>
        <p class="wiz-sub">Pick the types of work your team handles. Your dashboard will be built around what you select. You can change this anytime.</p>
        <div class="wiz-card">
          <div class="pick-grid">
            ${LIBRARY.workUnits.map(w => `
              <div class="pick-chip ${d.workUnits.includes(w.id)?'on':''}" data-wu="${w.id}">
                <div class="pc-check"></div>
                <div>
                  <div class="pc-lbl">${w.label}</div>
                  <div class="pc-hint">${w.hint}</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px dashed var(--bor)">
            <label class="label">Add custom work unit</label>
            <div style="display:flex;gap:8px">
              <input id="w-custom-wu" placeholder="e.g. Compelling Evidence Package" style="flex:1">
              <button class="btn btn-primary btn-sm" id="w-add-cwu">Add</button>
            </div>
            ${d.customWorkUnits.length ? `
              <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
                ${d.customWorkUnits.map((c,i) => `
                  <span class="pill pill-r" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px">
                    ${escape(c)}
                    <button data-cwu-rm="${i}" style="background:none;border:none;color:var(--cb-red);cursor:pointer;font-size:14px;line-height:1;padding:0">×</button>
                  </span>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
        ${navButtons(true)}
      `;
    }

    if (k === 'fields') {
      return `
        <h1 class="wiz-h1">What data do you track?</h1>
        <p class="wiz-sub">Pick the fields that matter to your team. These become the columns in your records table and the form when logging work.</p>
        <div class="wiz-card">
          <div class="pick-grid">
            ${LIBRARY.fields.map(f => `
              <div class="pick-chip ${d.fields.includes(f.id)?'on':''}" data-field="${f.id}">
                <div class="pc-check"></div>
                <div>
                  <div class="pc-lbl">${f.label}</div>
                  <div class="pc-hint">${f.hint}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        ${navButtons(true)}
      `;
    }

    if (k === 'roles') {
      return `
        <h1 class="wiz-h1">Team roles</h1>
        <p class="wiz-sub">What roles exist on your team? Members will be assigned to these roles.</p>
        <div class="wiz-card">
          <div class="pick-grid">
            ${LIBRARY.roles.map(r => `
              <div class="pick-chip ${d.roles.includes(r)?'on':''}" data-role="${escape(r)}">
                <div class="pc-check"></div>
                <div class="pc-lbl">${r}</div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px dashed var(--bor);display:flex;gap:8px">
            <input id="w-custom-role" placeholder="Add custom role..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="w-add-crole">Add</button>
          </div>
          ${d.roles.filter(r => !LIBRARY.roles.includes(r)).length ? `
            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
              ${d.roles.filter(r => !LIBRARY.roles.includes(r)).map((c,i) => `
                <span class="pill pill-p" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px">
                  ${escape(c)}
                  <button data-crole-rm="${escape(c)}" style="background:none;border:none;color:#5b21b6;cursor:pointer;font-size:14px;line-height:1;padding:0">×</button>
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>
        ${navButtons(true)}
      `;
    }

    if (k === 'goals') {
      const allWUs = [
        ...d.workUnits.map(id => {
          const item = LIBRARY.workUnits.find(w => w.id === id);
          return item ? { id, label: item.label } : null;
        }).filter(Boolean),
        ...d.customWorkUnits.map(c => ({
          id: 'custom_' + c.toLowerCase().replace(/\s+/g,'_'),
          label: c
        }))
      ];
      return `
        <h1 class="wiz-h1">Daily goals</h1>
        <p class="wiz-sub">How many of each work unit should each team member complete per day? Leave at 0 to skip goal tracking for that type.</p>
        <div class="wiz-card">
          ${allWUs.length ? allWUs.map(wu => `
            <div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--bor)">
              <label style="flex:1;font-weight:600;font-size:14px">${escape(wu.label)}</label>
              <div style="display:flex;align-items:center;gap:8px">
                <input type="number" min="0" value="${d.goals[wu.id]||0}" data-goal="${wu.id}"
                  style="width:90px;padding:9px 12px;text-align:center">
                <span style="font-size:12px;color:var(--i3)">per day</span>
              </div>
            </div>
          `).join('') : `
            <p style="color:var(--i3);text-align:center;padding:1.5rem">
              No work units selected — go back to pick some, or skip goals.
            </p>
          `}
        </div>
        ${navButtons(true)}
      `;
    }

    if (k === 'review') {
      return renderReview();
    }

    if (k === 'done') {
      return renderDone();
    }

    return '<p>Unknown step</p>';
  }

  function renderReview() {
    const d = WIZ.data;
    const isSuper = WIZ.type === 'super';
    const isFirstSuper = isSuper && !Auth.isBootstrapped();

    if (isSuper) {
      return `
        <h1 class="wiz-h1">Review & submit</h1>
        <p class="wiz-sub">${isFirstSuper
          ? "Your account will be created and you'll be signed in immediately."
          : "Your request will be sent to existing super admin approvers."}</p>
        <div class="wiz-card">
          ${reviewRow('Company', d.companyName)}
          ${reviewRow('Display name', d.displayName)}
          ${reviewRow('Email', d.email)}
          ${reviewRow('Password', '••••••••')}
        </div>
        <div class="notice ${isFirstSuper?'success':''}">
          ${isFirstSuper
            ? "✓ Bootstrap signup — auto-approved as the first super admin."
            : "⏳ Pending approval — you'll be notified when approved."}
        </div>
        ${navButtons(false, true)}
      `;
    }

    // manager
    const wuLabels = d.workUnits.map(id => LIBRARY.workUnits.find(w => w.id===id)?.label || id);
    return `
      <h1 class="wiz-h1">Review & submit</h1>
      <p class="wiz-sub">Your request will be sent to a super admin for approval. Review your team setup before submitting.</p>
      <div class="wiz-card">
        ${reviewRow('Display name', d.displayName)}
        ${reviewRow('Email', d.email)}
        ${reviewRow('Department', d.department || '—')}
        ${reviewRow('Team name', d.teamName)}
        ${reviewRow('Work units', [...wuLabels, ...d.customWorkUnits].join(', ') || '—')}
        ${reviewRow('Fields tracked', d.fields.map(f => LIBRARY.fields.find(x=>x.id===f)?.label||f).join(', ') || '—')}
        ${reviewRow('Roles', d.roles.join(', ') || '—')}
        ${reviewRow('Goals', Object.keys(d.goals).filter(k=>d.goals[k]>0).length + ' configured' || 'none')}
      </div>
      <div class="notice">
        ⏳ Once submitted, your team setup is locked in. After a super admin approves, you'll be able to sign in and add team members.
      </div>
      ${navButtons(false, true)}
    `;
  }

  function reviewRow(label, value) {
    return `
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bor);font-size:14px">
        <span style="color:var(--i3);font-weight:600">${label}</span>
        <span style="text-align:right;max-width:60%">${escape(String(value||'—'))}</span>
      </div>
    `;
  }

  function renderDone() {
    const d = WIZ.data;
    if (WIZ.type === 'super') {
      const isFirst = WIZ.lastResult && WIZ.lastResult.autoApproved;
      return `
        <div class="wiz-done">
          <div class="wd-icon">${Utils.icon('check', 48)}</div>
          <h1 class="wiz-h1">${isFirst ? "You're all set!" : "Request submitted!"}</h1>
          <p class="wiz-sub" style="margin:0 auto 2rem">
            ${isFirst
              ? "Your super admin account is ready. Let's go to your dashboard."
              : "We've sent your request to existing approvers. You'll be notified when approved."}
          </p>
          <div class="wiz-summary">
            ${[
              ['Company', d.companyName],
              ['Account', `${d.displayName} (${d.email})`],
            ].map(([l,v]) => `
              <div class="wiz-summary-row">
                <span class="check">${Utils.icon('check', 14)}</span>
                <span><strong>${l}:</strong> ${escape(v)}</span>
              </div>
            `).join('')}
          </div>
          ${isFirst
            ? `<button class="btn btn-primary btn-lg" id="wiz-go-app">Go to Dashboard ${Utils.icon('arrow', 16)}</button>`
            : `<button class="btn btn-ghost btn-lg" id="wiz-go-home">Back to home</button>`}
        </div>
      `;
    }
    // manager done — always pending
    return `
      <div class="wiz-done">
        <div class="wd-icon">${Utils.icon('check', 48)}</div>
        <h1 class="wiz-h1">Request submitted!</h1>
        <p class="wiz-sub" style="margin:0 auto 2rem">
          We've sent your team setup to a super admin for approval. Once approved, you can sign in and start adding members.
        </p>
        <div class="wiz-summary">
          ${[
            ['Team', d.teamName + (d.department ? ' · ' + d.department : '')],
            ['Manager', `${d.displayName} (${d.email})`],
            ['Work units', `${d.workUnits.length + d.customWorkUnits.length} selected`],
            ['Fields', `${d.fields.length} selected`],
            ['Roles', `${d.roles.length} defined`],
          ].map(([l,v]) => `
            <div class="wiz-summary-row">
              <span class="check">${Utils.icon('check', 14)}</span>
              <span><strong>${l}:</strong> ${escape(v)}</span>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-ghost btn-lg" id="wiz-go-home">Back to home</button>
      </div>
    `;
  }

  function navButtons(canSkip = false, isReview = false) {
    return `
      <div class="wiz-nav">
        <div>
          ${WIZ.step > 0 ? `<button class="btn btn-ghost" id="wiz-back">${Utils.icon('back', 14)} Back</button>` : ''}
        </div>
        <div class="wiz-nav-right">
          ${canSkip ? `<button class="btn btn-ghost" id="wiz-skip">Skip for now</button>` : ''}
          ${isReview
            ? `<button class="btn btn-primary" id="wiz-submit">Submit ${Utils.icon('arrow', 14)}</button>`
            : `<button class="btn btn-primary" id="wiz-next">Next ${Utils.icon('arrow', 14)}</button>`
          }
        </div>
      </div>
    `;
  }

  // ----- BIND -----
  function bind() {
    const root = document.getElementById('wizard');

    // exit
    const exitBtn = document.getElementById('wiz-exit-btn');
    if (exitBtn) exitBtn.onclick = () => {
      if (WIZ.step >= WIZ.steps.length - 1) Router.go('landing');
      else if (Utils.confirm('Exit setup? Your progress will be lost.')) Router.go('landing');
    };

    // pick chips
    root.querySelectorAll('.pick-chip[data-wu]').forEach(el => {
      el.onclick = () => toggle('workUnits', el.dataset.wu);
    });
    root.querySelectorAll('.pick-chip[data-field]').forEach(el => {
      el.onclick = () => toggle('fields', el.dataset.field);
    });
    root.querySelectorAll('.pick-chip[data-role]').forEach(el => {
      el.onclick = () => toggle('roles', el.dataset.role);
    });

    // remove buttons for custom items
    root.querySelectorAll('[data-cwu-rm]').forEach(el => {
      el.onclick = () => { WIZ.data.customWorkUnits.splice(parseInt(el.dataset.cwuRm), 1); paint(); };
    });
    root.querySelectorAll('[data-crole-rm]').forEach(el => {
      el.onclick = () => {
        const r = el.dataset.croleRm;
        WIZ.data.roles = WIZ.data.roles.filter(x => x !== r);
        paint();
      };
    });

    // add custom buttons
    const addCwu = document.getElementById('w-add-cwu');
    if (addCwu) addCwu.onclick = () => {
      const inp = document.getElementById('w-custom-wu');
      const v = inp.value.trim();
      if (!v) return;
      if (WIZ.data.customWorkUnits.includes(v)) { Utils.toast('Already added','bad'); return; }
      WIZ.data.customWorkUnits.push(v);
      WIZ.data.workUnitLabels['custom_' + v.toLowerCase().replace(/\s+/g,'_')] = v;
      paint();
    };
    const addCrole = document.getElementById('w-add-crole');
    if (addCrole) addCrole.onclick = () => {
      const inp = document.getElementById('w-custom-role');
      const v = inp.value.trim();
      if (!v) return;
      if (WIZ.data.roles.includes(v)) { Utils.toast('Already added','bad'); return; }
      WIZ.data.roles.push(v);
      paint();
    };

    // department other toggle
    const deptSel = document.getElementById('w-dept');
    if (deptSel) deptSel.onchange = () => {
      const wrap = document.getElementById('dept-other-wrap');
      if (wrap) wrap.style.display = deptSel.value === '__other__' ? '' : 'none';
    };

    // goal inputs
    root.querySelectorAll('input[data-goal]').forEach(inp => {
      inp.onchange = () => { WIZ.data.goals[inp.dataset.goal] = parseInt(inp.value)||0; };
    });

    // nav buttons
    const back = document.getElementById('wiz-back');
    if (back) back.onclick = wizBack;
    const next = document.getElementById('wiz-next');
    if (next) next.onclick = wizNext;
    const skip = document.getElementById('wiz-skip');
    if (skip) skip.onclick = wizSkip;
    const submit = document.getElementById('wiz-submit');
    if (submit) submit.onclick = wizSubmit;
    const goApp = document.getElementById('wiz-go-app');
    if (goApp) goApp.onclick = () => Router.go('app');
    const goHome = document.getElementById('wiz-go-home');
    if (goHome) goHome.onclick = () => Router.go('landing');
  }

  function toggle(field, val) {
    const arr = WIZ.data[field];
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    paint();
  }

  function captureCurrent() {
    const k = WIZ.steps[WIZ.step].key;
    const d = WIZ.data;
    if (k === 'company') {
      d.companyName = (document.getElementById('w-company')?.value || '').trim();
    }
    if (k === 'admin' || k === 'account') {
      d.displayName = (document.getElementById('w-display')?.value || '').trim();
      d.email = (document.getElementById('w-email')?.value || '').trim().toLowerCase();
      d.password = document.getElementById('w-pass')?.value || '';
    }
    if (k === 'team') {
      const dept = document.getElementById('w-dept')?.value;
      if (dept === '__other__') {
        d.department = (document.getElementById('w-dept-other')?.value || '').trim();
      } else {
        d.department = dept || '';
      }
      d.teamName = (document.getElementById('w-team-name')?.value || '').trim();
    }
  }

  function validateCurrent() {
    captureCurrent();
    const k = WIZ.steps[WIZ.step].key;
    const d = WIZ.data;
    if (k === 'company') {
      if (!d.companyName) { Utils.toast('Company name required', 'bad'); return false; }
    }
    if (k === 'admin' || k === 'account') {
      if (!d.displayName) { Utils.toast('Display name required', 'bad'); return false; }
      if (!d.email) { Utils.toast('Email required', 'bad'); return false; }
      if (!Utils.validEmail(d.email)) { Utils.toast('Please enter a valid email', 'bad'); return false; }
      if (!d.password) { Utils.toast('Password required', 'bad'); return false; }
      if (State.emailInUse(d.email)) { Utils.toast('Email already in use', 'bad'); return false; }
    }
    if (k === 'team') {
      if (!d.teamName) { Utils.toast('Team name required', 'bad'); return false; }
    }
    return true;
  }

  function wizBack() {
    captureCurrent();
    if (WIZ.step > 0) { WIZ.step--; paint(); }
  }
  function wizNext() {
    if (!validateCurrent()) return;
    if (WIZ.step < WIZ.steps.length - 1) { WIZ.step++; paint(); }
  }
  function wizSkip() {
    captureCurrent();
    if (WIZ.step < WIZ.steps.length - 1) { WIZ.step++; paint(); }
  }

  function wizSubmit() {
    const d = WIZ.data;
    if (WIZ.type === 'super') {
      const result = Auth.requestSuperAdmin({
        email: d.email, displayName: d.displayName,
        password: d.password, companyName: d.companyName
      });
      if (!result.ok) { Utils.toast(result.error, 'bad'); return; }
      WIZ.lastResult = result;
      WIZ.step++; // to done
      paint();
      if (result.autoApproved) {
        // auto sign-in for first super admin
        State.setSession('super', d.email);
      }
    } else {
      // manager
      const result = Auth.requestManager({
        email: d.email, displayName: d.displayName,
        password: d.password,
        teamName: d.teamName, department: d.department,
        wizardData: {
          workUnits: [...d.workUnits, ...d.customWorkUnits.map(c => 'custom_' + c.toLowerCase().replace(/\s+/g,'_'))],
          workUnitLabels: {
            ...d.customWorkUnits.reduce((acc,c) => {
              acc['custom_' + c.toLowerCase().replace(/\s+/g,'_')] = c;
              return acc;
            }, {})
          },
          fields: d.fields,
          roles: d.roles,
          goals: d.goals,
        }
      });
      if (!result.ok) { Utils.toast(result.error, 'bad'); return; }
      WIZ.lastResult = result;
      WIZ.step++;
      paint();
    }
  }

  function escape(s) {
    return String(s||'')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { render };

})();
