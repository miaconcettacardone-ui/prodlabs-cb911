/* ============================================================
 *  views/super.js — Super Admin dashboard
 * ============================================================
 *  Phase 6 tabs (per sketch):
 *    Dashboard | Stats | Teams & Goals | Import | History | Users | Messages | Settings
 *
 *  Admin sees all 8 tabs. Dashboard, Import, History are stubbed
 *  (real implementations come in Phase 6 part 2).
 *  Stats, Teams & Goals, Users, Messages, Settings reuse existing
 *  Phase 5 renderers under their new tab keys.
 * ============================================================ */

const SuperView = (() => {

  // Default tab — Dashboard is the new entry point per sketch.
  let tab = 'dashboard';

  function render(session) {
    const main = document.getElementById('app-main');
    const tabsEl = document.getElementById('app-tabs');
    const inboxUnread = Inbox.unreadCountForUser(session);

    tabsEl.innerHTML = `
      ${tabBtn('dashboard', 'Dashboard',     'dashboard')}
      ${tabBtn('stats',     'Stats',         'chart')}
      ${tabBtn('teams',     'Teams & Goals', 'flag')}
      ${tabBtn('import',    'Import',        'upload')}
      ${tabBtn('history',   'History',       'history')}
      ${tabBtn('users',     'Users',         'users')}
      ${tabBtn('messages',  'Messages',      'message', inboxUnread)}
      ${tabBtn('settings',  'Settings',      'settings')}
    `;
    tabsEl.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => { tab = t.dataset.tab; render(session); };
    });

    if      (tab === 'dashboard') renderDashboardStub(main, session);
    else if (tab === 'stats')     renderOverview(main, session);
    else if (tab === 'teams')     renderTeams(main, session);
    else if (tab === 'import')    renderImportStub(main, session);
    else if (tab === 'history')   renderHistoryStub(main, session);
    else if (tab === 'users')     renderAdmins(main, session);
    else if (tab === 'messages')  InboxView.render(main, session, () => render(session));
    else if (tab === 'settings')  renderSettings(main, session);
  }

  function tabBtn(key, label, icon, count) {
    return `<button class="tab ${tab===key?'on':''}" data-tab="${key}">
      ${Utils.icon(icon, 14)} ${label}
      ${count ? `<span class="tab-badge">${count}</span>` : ''}
    </button>`;
  }

  // ===== PHASE 6 STUBS =======================================
  // These tabs exist in the IA but their full implementations
  // ship in Phase 6 part 2. The stubs explain WHY they're empty
  // so Mia's dev knows the IA placement is intentional.

  function renderDashboardStub(main, session) {
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Dashboard</h2>
          <div class="ph-sub">Company-wide productivity overview</div>
        </div>
      </div>
      <div class="empty-stub">
        ${Utils.icon('dashboard', 48)}
        <h3>Dashboard coming in Phase 6</h3>
        <p>This will be the company-wide productivity overview — top metrics, leaderboards across teams, and filterable views by department / team / user. Modeled on Intelihub's prod dashboard.</p>
        <p class="empty-stub-hint">For now, the <strong>Stats</strong> tab shows the existing overview metrics.</p>
      </div>
    `;
  }

  function renderImportStub(main, session) {
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Import</h2>
          <div class="ph-sub">Bulk upload of records, users, or team data</div>
        </div>
      </div>
      <div class="empty-stub">
        ${Utils.icon('upload', 48)}
        <h3>Import area coming in Phase 6</h3>
        <p>Bulk import will live here — paste-CSV records, user roster uploads, and team configuration imports. Like Intelihub's pellbs import area.</p>
        <p class="empty-stub-hint">CSV record import is currently available inside Manager → Activity.</p>
      </div>
    `;
  }

  function renderHistoryStub(main, session) {
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>History</h2>
          <div class="ph-sub">Reports and historical activity</div>
        </div>
      </div>
      <div class="empty-stub">
        ${Utils.icon('history', 48)}
        <h3>History &amp; Reports coming in Phase 6</h3>
        <p>Monthly, bi-monthly, and yearly PDF reports will generate here. Admin sees full company; managers see their team(s); users see their own report history.</p>
      </div>
    `;
  }

  // ===== OVERVIEW =====
  function renderOverview(main, session) {
    const s = State.get();
    const totalRecords = s.records.length;
    const today = Utils.todayISO();
    const todayRecs = s.records.filter(r => r.date === today).length;
    const thisMonth = today.slice(0,7);
    const monthRecs = s.records.filter(r => r.date.startsWith(thisMonth)).length;
    const pendingCount = State.pendingForUser(session).length;

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Hi ${session.user.displayName.split(' ')[0]} 👋</h2>
          <div class="ph-sub">Company-wide view · ${s.company.name || 'Chargebacks911'}</div>
        </div>
        <div class="flex gap-8">
          ${pendingCount ? `<button class="btn btn-primary" data-go="inbox">${Utils.icon('bell',14)} ${pendingCount} pending</button>` : ''}
        </div>
      </div>

      <div class="metric-grid">
        ${metric('Teams',     s.teams.length,    'departments configured', 'r')}
        ${metric('Managers',  s.managers.length, 'team leads',             'b')}
        ${metric('Members',   s.members.length,  'employees',              'g')}
        ${metric('Today',     todayRecs,         'records logged',         'a')}
        ${metric('This Month',monthRecs,         'month-to-date',          'p')}
        ${metric('All Time',  totalRecords.toLocaleString(), 'total records', '')}
      </div>

      <div class="split-2">
        <div class="card">
          <div class="card-head">
            <span class="card-title">All Teams</span>
            <button class="btn btn-ghost btn-sm" data-go="teams">View all ${Utils.icon('arrow', 12)}</button>
          </div>
          ${s.teams.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Team</th><th>Manager</th><th>Members</th><th>Records</th></tr></thead>
                <tbody>
                  ${s.teams.slice(0, 8).map(t => {
                    const mgr = s.managers.find(m => m.email === t.managerEmail);
                    const mems = s.members.filter(m => m.teamId === t.id).length;
                    const recs = s.records.filter(r => r.teamId === t.id).length;
                    return `<tr>
                      <td><strong>${escape(t.name)}</strong>${t.department?`<div class="muted" style="font-size:11px">${escape(t.department)}</div>`:''}</td>
                      <td>${mgr ? escape(mgr.displayName) : '<span class="muted">—</span>'}</td>
                      <td>${mems}</td>
                      <td>${recs}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : emptyState('No teams yet', 'Managers create teams via the wizard. Approve their requests in the Inbox tab.')}
        </div>

        <div class="card">
          <div class="card-head">
            <span class="card-title">Recent Activity</span>
          </div>
          ${s.records.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Member</th><th>Team</th><th>Work</th></tr></thead>
                <tbody>
                  ${s.records.slice(-8).reverse().map(r => {
                    const m = s.members.find(x => x.email === r.memberEmail);
                    const t = s.teams.find(x => x.id === r.teamId);
                    return `<tr>
                      <td>${r.date}</td>
                      <td>${m ? escape(m.displayName) : '<span class="muted">—</span>'}</td>
                      <td>${t ? escape(t.name) : '<span class="muted">—</span>'}</td>
                      <td>${escape(LIBRARY.workUnitLabel(r.workUnit, t?.workUnitLabels))}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : emptyState('No activity yet', 'Records will show up here as members log work.')}
        </div>
      </div>
    `;
    bindLinks(main, session);
  }

  // ===== APPROVALS =====
  function renderApprovals(main, session) {
    const pending = State.pendingForUser(session);
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Approvals</h2>
          <div class="ph-sub">Review and approve signup requests for managers and super admins.</div>
        </div>
      </div>

      ${pending.length ? `
        <div class="card">
          <div class="card-head">
            <span class="card-title">Pending Requests · ${pending.length}</span>
          </div>
          <div class="card-body">
            ${pending.map(p => renderPendingCard(p)).join('')}
          </div>
        </div>
      ` : `
        <div class="card">
          ${emptyState('Nothing to approve', 'When managers or super admins sign up, their requests appear here.', 'check')}
        </div>
      `}

      <div class="card">
        <div class="card-head">
          <span class="card-title">Decision History</span>
        </div>
        ${renderHistory()}
      </div>
    `;
    bindApprovalActions(main, session);
  }

  function renderPendingCard(p) {
    const typeLabel = { super: 'Super Admin', manager: 'Manager', member: 'Member' }[p.type];
    const typeColor = p.type === 'super' ? 'pill-r' : p.type === 'manager' ? 'pill-a' : 'pill-b';
    const extra = p.type === 'manager' ? `
      <div class="pc-meta" style="margin-top:6px">
        Team: <strong>${escape(p.payload.teamName)}</strong>${p.payload.department?' · '+escape(p.payload.department):''}
        ${p.payload.wizardData ? ` · ${p.payload.wizardData.workUnits?.length||0} work units · ${p.payload.wizardData.fields?.length||0} fields` : ''}
      </div>
    ` : '';
    return `
      <div class="pending-card" data-pid="${p.id}">
        <div class="avatar avatar-lg">${Utils.initials(p.displayName)}</div>
        <div class="pc-info">
          <div class="pc-name">${escape(p.displayName)} <span class="pill ${typeColor}">${typeLabel}</span></div>
          <div class="pc-meta">${escape(p.email)} · requested ${Utils.fmtRelative(p.requestedAt)}</div>
          ${extra}
        </div>
        <div class="pc-actions">
          <button class="btn btn-success btn-sm" data-pact="approve">${Utils.icon('check', 12)} Approve</button>
          <button class="btn btn-danger btn-sm" data-pact="deny">${Utils.icon('x', 12)} Deny</button>
        </div>
      </div>
    `;
  }

  function renderHistory() {
    const hist = State.get().pending
      .filter(p => p.status !== 'pending')
      .sort((a,b) => (b.decidedAt||0) - (a.decidedAt||0))
      .slice(0, 20);
    if (!hist.length) return emptyState('No history yet', 'Approved and denied requests will be logged here.');
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Decided</th><th>By</th></tr></thead>
          <tbody>
            ${hist.map(p => {
              const decider = State.findUserByEmail(p.decidedBy||'');
              return `<tr>
                <td><strong>${escape(p.displayName)}</strong><div class="muted" style="font-size:11px">${escape(p.email)}</div></td>
                <td><span class="pill ${p.type==='super'?'pill-r':p.type==='manager'?'pill-a':'pill-b'}">${p.type}</span></td>
                <td><span class="pill ${p.status==='approved'?'pill-g':'pill-r'}">${p.status}</span></td>
                <td>${Utils.fmtRelative(p.decidedAt)}</td>
                <td>${decider ? escape(decider.user.displayName) : '<span class="muted">—</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function bindApprovalActions(main, session) {
    main.querySelectorAll('[data-pid]').forEach(card => {
      const pid = card.dataset.pid;
      card.querySelectorAll('[data-pact]').forEach(btn => {
        btn.onclick = () => {
          const a = btn.dataset.pact;
          if (a === 'approve') {
            const r = Auth.approve(pid, session.user.email);
            if (!r.ok) Utils.toast(r.error, 'bad');
            else { Utils.toast('Approved!', 'good'); render(session); }
          } else {
            const note = prompt('Optional reason for denying:') || '';
            if (note === null) return;
            Auth.deny(pid, session.user.email, note);
            Utils.toast('Denied', 'warn');
            render(session);
          }
        };
      });
    });
  }

  // ===== TEAMS & GOALS =====
  function renderTeams(main, session) {
    const s = State.get();
    // Goals-by-team summary: one row per team showing how many
    // goals are configured. Helps super admins see at a glance
    // which teams have set up tracking.
    const goalsSummary = s.teams.map(t => {
      const goalCount = t.goals ? Object.values(t.goals).filter(v => v && v > 0).length : 0;
      return { team: t, goalCount };
    });

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Teams &amp; Goals</h2>
          <div class="ph-sub">All teams across ${s.company.name}. Click a team to see details.</div>
        </div>
      </div>

      ${s.teams.length ? `
        <div class="card">
          <div class="card-head">
            <span class="card-title">Goals by Team</span>
            <span class="muted text-xs">${s.teams.length} team${s.teams.length!==1?'s':''}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Team</th><th>Department</th><th>Goals configured</th></tr></thead>
              <tbody>
                ${goalsSummary.map(({team, goalCount}) => `
                  <tr>
                    <td>${escape(team.name)}</td>
                    <td>${escape(team.department || '—')}</td>
                    <td>${goalCount}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${s.teams.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1.25rem">
          ${s.teams.map(t => {
            const mgr = s.managers.find(m => m.email === t.managerEmail);
            const mems = s.members.filter(m => m.teamId === t.id);
            const recs = s.records.filter(r => r.teamId === t.id);
            return `
              <div class="card" style="margin-bottom:0">
                <div class="card-head" style="background:var(--cb-dark);color:#fff;border-color:transparent">
                  <div>
                    <div class="card-title" style="color:#fff">${escape(t.name)}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:2px">${escape(t.department || 'No department')}</div>
                  </div>
                  <span class="pill pill-r">${mems.length} member${mems.length!==1?'s':''}</span>
                </div>
                <div class="card-body">
                  <div class="label">MANAGER</div>
                  <div style="font-weight:600;margin-bottom:1rem">${mgr ? escape(mgr.displayName) : '<span class="muted">—</span>'}</div>
                  <div class="label">WORK UNITS</div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:1rem">
                    ${(t.workUnits||[]).slice(0,4).map(id => `<span class="pill pill-r" style="font-size:10px">${escape(LIBRARY.workUnitLabel(id, t.workUnitLabels))}</span>`).join('')}
                    ${(t.workUnits||[]).length>4 ? `<span class="pill pill-a" style="font-size:10px">+${t.workUnits.length-4}</span>`:''}
                  </div>
                  <div class="label">RECORDS</div>
                  <div><strong>${recs.length.toLocaleString()}</strong> total</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `<div class="card">${emptyState('No teams yet','Approve a manager request to create the first team.', 'users')}</div>`}
    `;
  }

  // ===== ADMINS =====
  function renderAdmins(main, session) {
    const s = State.get();
    const approvers = (s.config.superAdminApprovers || []).map(e => e.toLowerCase());
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Admins & Approvers</h2>
          <div class="ph-sub">Manage who has full platform access and who can approve new super admins.</div>
        </div>
        <button class="btn btn-primary" id="add-super">${Utils.icon('plus',14)} Add Super Admin</button>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Super Admins</span>
          <span class="muted" style="font-size:12px">${s.superAdmins.length}</span>
        </div>
        ${s.superAdmins.map(a => {
          const isApprover = approvers.includes(a.email.toLowerCase());
          const isMe = a.email === session.user.email;
          const lastOne = s.superAdmins.length === 1;
          return `
            <div class="user-row">
              <div class="avatar">${Utils.initials(a.displayName)}</div>
              <div class="u-main">
                <div class="u-name">${escape(a.displayName)}
                  ${isMe ? '<span class="pill pill-y" style="margin-left:6px;font-size:10px">you</span>':''}
                  ${isApprover ? '<span class="pill pill-r" style="margin-left:6px;font-size:10px">approver</span>':''}
                </div>
                <div class="u-sub">${escape(a.email)}${a.approvedBy?' · approved by '+(a.approvedBy==='__bootstrap__'?'(bootstrap)':escape(a.approvedBy)):''}</div>
              </div>
              <div class="u-actions">
                <button class="btn btn-ghost btn-sm" data-toggle-approver="${escape(a.email)}">
                  ${isApprover ? 'Remove approver' : 'Make approver'}
                </button>
                ${!isMe && !lastOne ? `<button class="btn btn-danger btn-sm" data-rm-super="${escape(a.email)}">${Utils.icon('trash',12)}</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Team Managers</span>
          <span class="muted" style="font-size:12px">${s.managers.length}</span>
        </div>
        ${s.managers.length ? s.managers.map(m => {
          const team = State.teamForManager(m.email);
          return `
            <div class="user-row">
              <div class="avatar">${Utils.initials(m.displayName)}</div>
              <div class="u-main">
                <div class="u-name">${escape(m.displayName)}</div>
                <div class="u-sub">${escape(m.email)} · ${team ? escape(team.name) : '<span class="muted">no team</span>'}</div>
              </div>
            </div>
          `;
        }).join('') : `<div class="card-body">${emptyState('No managers yet', 'Approve a manager request to add the first one.')}</div>`}
      </div>
    `;
    bindAdminActions(main, session);
  }

  function bindAdminActions(main, session) {
    main.querySelectorAll('[data-toggle-approver]').forEach(btn => {
      btn.onclick = () => {
        const email = btn.dataset.toggleApprover.toLowerCase();
        const cfg = State.get().config;
        const list = (cfg.superAdminApprovers || []).map(e => e.toLowerCase());
        const i = list.indexOf(email);
        if (i >= 0) list.splice(i, 1); else list.push(email);
        State.updateConfig({ superAdminApprovers: list });
        Utils.toast(i>=0 ? 'Approver removed' : 'Approver added', 'good');
        render(session);
      };
    });
    main.querySelectorAll('[data-rm-super]').forEach(btn => {
      btn.onclick = () => {
        const email = btn.dataset.rmSuper;
        if (!Utils.confirm('Remove super admin '+email+'?')) return;
        State.deleteUser(email, 'super');
        // also remove from approvers
        const list = (State.get().config.superAdminApprovers || []).filter(e => e.toLowerCase() !== email.toLowerCase());
        State.updateConfig({ superAdminApprovers: list });
        Utils.toast('Removed', 'good');
        render(session);
      };
    });
    const addBtn = document.getElementById('add-super');
    if (addBtn) addBtn.onclick = () => {
      Utils.openModal(`
        <h3>Add Super Admin</h3>
        <p class="helper" style="margin-bottom:1rem">This bypasses the approval flow. Use only for emergency access.</p>
        <div class="form-row"><label class="label">Display name</label><input id="aa-name" placeholder="Jane Doe"></div>
        <div class="form-row"><label class="label">Email</label><input type="email" id="aa-email" placeholder="jane@company.com"></div>
        <div class="form-row"><label class="label">Password</label><input type="text" id="aa-pass" placeholder="temp password"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost btn-sm" id="aa-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="aa-confirm">Add</button>
        </div>
      `);
      document.getElementById('aa-cancel').onclick = () => Utils.closeModal();
      document.getElementById('aa-confirm').onclick = () => {
        const name = document.getElementById('aa-name').value.trim();
        const email = document.getElementById('aa-email').value.trim().toLowerCase();
        const pass = document.getElementById('aa-pass').value;
        if (!name || !email || !pass) { Utils.toast('All fields required', 'bad'); return; }
        if (!Utils.validEmail(email)) { Utils.toast('Invalid email', 'bad'); return; }
        if (State.emailInUse(email)) { Utils.toast('Email in use', 'bad'); return; }
        State.addSuperAdmin({ email, displayName: name, password: pass, approvedBy: session.user.email });
        Utils.closeModal();
        Utils.toast('Super admin added', 'good');
        render(session);
      };
    };
  }

  // ===== SETTINGS =====
  function renderSettings(main, session) {
    const s = State.get();
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Settings</h2>
          <div class="ph-sub">Platform-wide configuration.</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Company</span></div>
        <div class="card-body">
          <div class="form-row">
            <label class="label">Company name</label>
            <input id="s-company" value="${escape(s.company.name||'')}">
          </div>
          <button class="btn btn-primary btn-sm" id="s-save-company">Save</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Approval Flow</span></div>
        <div class="card-body">
          <p class="helper" style="margin-bottom:1rem">
            <strong>Member signups</strong> → approved by their team's manager.<br>
            <strong>Manager signups</strong> → approved by any super admin.<br>
            <strong>Super admin signups</strong> → approved only by designated approvers (configure on the Admins tab).
          </p>
          <div class="notice">
            Currently <strong>${(s.config.superAdminApprovers||[]).length}</strong> super admin${(s.config.superAdminApprovers||[]).length===1?' is':'s are'} approver${(s.config.superAdminApprovers||[]).length===1?'':'s'} for new super admin requests.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Danger Zone</span></div>
        <div class="card-body">
          <p class="helper" style="margin-bottom:1rem">Reset everything — clears all teams, members, records, and settings. Only use this in the prototype to start over.</p>
          <button class="btn btn-danger btn-sm" id="s-reset">${Utils.icon('trash',12)} Reset Everything</button>
        </div>
      </div>
    `;
    document.getElementById('s-save-company').onclick = () => {
      State.updateCompany({ name: document.getElementById('s-company').value.trim() });
      Utils.toast('Saved', 'good');
      render(session);
    };
    document.getElementById('s-reset').onclick = () => {
      if (!Utils.confirm('Erase ALL data — teams, members, records, everything?')) return;
      if (!Utils.confirm('Really? This cannot be undone.')) return;
      State.reset();
      Router.go('landing');
      Utils.toast('Platform reset', 'good');
    };
  }

  // ===== HELPERS =====
  function metric(label, value, sub, color) {
    const cls = color ? 'metric-' + color : '';
    return `
      <div class="metric ${cls}">
        <div class="metric-label">${label}</div>
        <div class="metric-value">${value}</div>
        <div class="metric-sub">${sub}</div>
      </div>
    `;
  }

  function emptyState(title, desc, icon='chart') {
    return `
      <div class="empty">
        <div class="empty-icon">${Utils.icon(icon, 28)}</div>
        <h3>${title}</h3>
        <p>${desc}</p>
      </div>
    `;
  }

  function bindLinks(main, session) {
    main.querySelectorAll('[data-go]').forEach(el => {
      el.onclick = () => { tab = el.dataset.go; render(session); };
    });
  }

  function escape(s) {
    return String(s||'')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { render };

})();
