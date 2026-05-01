/* ============================================================
 *  views/manager.js — Manager dashboard
 * ============================================================
 *  Phase 1: minimal working view.
 *  Phase 2: full polish, charts, leaderboards, CSV import, etc.
 * ============================================================ */

const ManagerView = (() => {

  let tab = 'dashboard';

  function render(session) {
    const main = document.getElementById('app-main');
    const tabsEl = document.getElementById('app-tabs');
    const team = session.team;
    const pendingCount = State.pendingForUser(session).length;

    tabsEl.innerHTML = `
      <button class="tab ${tab==='dashboard'?'on':''}" data-tab="dashboard">${Utils.icon('home',14)} Dashboard</button>
      <button class="tab ${tab==='approvals'?'on':''}" data-tab="approvals">${Utils.icon('bell',14)} Approvals${pendingCount?` <span class="tab-badge">${pendingCount}</span>`:''}</button>
      <button class="tab ${tab==='members'?'on':''}" data-tab="members">${Utils.icon('users',14)} Members</button>
      <button class="tab ${tab==='log'?'on':''}" data-tab="log">${Utils.icon('plus',14)} Log Work</button>
      <button class="tab ${tab==='settings'?'on':''}" data-tab="settings">${Utils.icon('settings',14)} Team Settings</button>
    `;
    tabsEl.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => { tab = t.dataset.tab; render(session); };
    });

    if (!team) {
      main.innerHTML = `
        <div class="card">
          <div class="card-body">
            <h3>No team yet</h3>
            <p class="muted">Your manager request hasn't been approved or your team wasn't created. Contact a super admin.</p>
          </div>
        </div>`;
      return;
    }

    if (tab === 'dashboard') renderDashboard(main, session);
    else if (tab === 'approvals') renderApprovals(main, session);
    else if (tab === 'members') renderMembers(main, session);
    else if (tab === 'log') renderLog(main, session);
    else if (tab === 'settings') renderSettings(main, session);
  }

  function renderDashboard(main, session) {
    const team = session.team;
    const records = State.recordsOfTeam(team.id);
    const members = State.membersOfTeam(team.id);
    const today = Utils.todayISO();
    const todayRecs = records.filter(r => r.date === today);
    const monthRecs = records.filter(r => r.date.startsWith(today.slice(0,7)));

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>${escape(team.name)}</h2>
          <div class="ph-sub">${escape(team.department || 'Team')} · ${members.length} member${members.length!==1?'s':''} · Welcome back, ${escape(session.user.displayName.split(' ')[0])}</div>
        </div>
        <button class="btn btn-primary" data-go="log">${Utils.icon('plus',14)} Log Work</button>
      </div>
      <div class="metric-grid">
        <div class="metric metric-r"><div class="metric-label">Today</div><div class="metric-value">${todayRecs.length}</div><div class="metric-sub">records logged today</div></div>
        <div class="metric metric-b"><div class="metric-label">This Month</div><div class="metric-value">${monthRecs.length}</div><div class="metric-sub">month-to-date</div></div>
        <div class="metric metric-g"><div class="metric-label">Members</div><div class="metric-value">${members.length}</div><div class="metric-sub">on your team</div></div>
        <div class="metric metric-a"><div class="metric-label">All Time</div><div class="metric-value">${records.length.toLocaleString()}</div><div class="metric-sub">total records</div></div>
      </div>
      <div class="notice">
        <strong>Phase 1 prototype.</strong> Phase 2 will add: real charts, leaderboards, daily goal tracking, CSV import, filters & search, edit/delete records.
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Recent Activity</span></div>
        ${records.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Member</th><th>Work Unit</th>${team.fields.includes('amount')?'<th>Amount</th>':''}${team.fields.includes('outcome')?'<th>Outcome</th>':''}</tr></thead>
              <tbody>
                ${records.slice(-15).reverse().map(r => {
                  const m = State.findUserByEmail(r.memberEmail);
                  return `<tr>
                    <td>${r.date}</td>
                    <td><strong>${m ? escape(m.user.displayName) : escape(r.memberEmail)}</strong></td>
                    <td>${escape(LIBRARY.workUnitLabel(r.workUnit, team.workUnitLabels))}</td>
                    ${team.fields.includes('amount')?`<td>${Utils.fmt$(r.fields?.amount||0)}</td>`:''}
                    ${team.fields.includes('outcome')?`<td>${r.fields?.outcome?`<span class="pill ${r.fields.outcome==='Win'?'pill-g':r.fields.outcome==='Loss'?'pill-r':'pill-a'}">${escape(r.fields.outcome)}</span>`:'—'}</td>`:''}
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="empty"><h3>No records yet</h3><p>Log your first record using the button above.</p></div>`}
      </div>
    `;
    main.querySelectorAll('[data-go]').forEach(el => {
      el.onclick = () => { tab = el.dataset.go; render(session); };
    });
  }

  function renderApprovals(main, session) {
    const pending = State.pendingForUser(session);
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Member Approvals</h2>
          <div class="ph-sub">Review members requesting to join your team.</div>
        </div>
      </div>
      ${pending.length ? `
        <div class="card">
          <div class="card-body">
            ${pending.map(p => `
              <div class="pending-card" data-pid="${p.id}">
                <div class="avatar avatar-lg">${Utils.initials(p.displayName)}</div>
                <div class="pc-info">
                  <div class="pc-name">${escape(p.displayName)}</div>
                  <div class="pc-meta">${escape(p.email)} · requested ${Utils.fmtRelative(p.requestedAt)}${p.payload.role?' · role: '+escape(p.payload.role):''}</div>
                </div>
                <div class="pc-actions">
                  <button class="btn btn-success btn-sm" data-act="approve">${Utils.icon('check',12)} Approve</button>
                  <button class="btn btn-danger btn-sm" data-act="deny">${Utils.icon('x',12)} Deny</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : `<div class="card"><div class="empty"><div class="empty-icon">${Utils.icon('check',28)}</div><h3>Nothing to approve</h3><p>Member access requests show up here.</p></div></div>`}
    `;
    main.querySelectorAll('[data-pid]').forEach(card => {
      card.querySelectorAll('[data-act]').forEach(btn => {
        btn.onclick = () => {
          const a = btn.dataset.act;
          if (a === 'approve') {
            const r = Auth.approve(card.dataset.pid, session.user.email);
            if (!r.ok) Utils.toast(r.error,'bad');
            else { Utils.toast('Approved!', 'good'); render(session); }
          } else {
            const note = prompt('Optional reason:') || '';
            if (note === null) return;
            Auth.deny(card.dataset.pid, session.user.email, note);
            Utils.toast('Denied','warn');
            render(session);
          }
        };
      });
    });
  }

  function renderMembers(main, session) {
    const team = session.team;
    const members = State.membersOfTeam(team.id);
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Team Members</h2>
          <div class="ph-sub">${members.length} member${members.length!==1?'s':''} on ${escape(team.name)}</div>
        </div>
      </div>
      <div class="card">
        ${members.length ? members.map(m => `
          <div class="user-row">
            <div class="avatar">${Utils.initials(m.displayName)}</div>
            <div class="u-main">
              <div class="u-name">${escape(m.displayName)}${m.role?` <span class="pill pill-r" style="margin-left:6px;font-size:10px">${escape(m.role)}</span>`:''}</div>
              <div class="u-sub">${escape(m.email)}</div>
            </div>
            <div class="u-actions">
              <button class="btn btn-danger btn-sm" data-rm="${escape(m.email)}">${Utils.icon('trash',12)}</button>
            </div>
          </div>
        `).join('') : `<div class="empty"><h3>No members yet</h3><p>Members can request to join your team from the home page. You'll approve them in the Approvals tab.</p></div>`}
      </div>
    `;
    main.querySelectorAll('[data-rm]').forEach(btn => {
      btn.onclick = () => {
        if (!Utils.confirm('Remove this member?')) return;
        State.deleteUser(btn.dataset.rm, 'member');
        Utils.toast('Removed','good');
        render(session);
      };
    });
  }

  function renderLog(main, session) {
    const team = session.team;
    const members = State.membersOfTeam(team.id);
    main.innerHTML = `
      <div class="page-header">
        <div><h2>Log Work</h2><div class="ph-sub">Add a new record for any team member.</div></div>
      </div>
      <div class="card" style="max-width:680px">
        <div class="card-body">
          <div class="form-grid-2">
            <div class="form-row">
              <label class="label">Date</label>
              <input type="date" id="lw-date" value="${Utils.todayISO()}">
            </div>
            ${members.length ? `
              <div class="form-row">
                <label class="label">Member</label>
                <select id="lw-member">${members.map(m => `<option value="${escape(m.email)}">${escape(m.displayName)}</option>`).join('')}</select>
              </div>
            ` : ''}
          </div>
          <div class="form-row">
            <label class="label">Work Unit</label>
            <select id="lw-wu">${team.workUnits.map(id => `<option value="${escape(id)}">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</option>`).join('')}</select>
          </div>
          ${team.fields.map(f => {
            const def = LIBRARY.fieldDef(f);
            if (!def) return '';
            if (def.type === 'enum') {
              return `<div class="form-row"><label class="label">${def.label}</label><select id="lw-${f}">${def.options.map(o=>`<option>${o}</option>`).join('')}</select></div>`;
            }
            return `<div class="form-row"><label class="label">${def.label}</label><input ${def.type==='number'?'type="number" step="0.01"':''} id="lw-${f}" placeholder="${def.hint}"></div>`;
          }).join('')}
          <div class="flex gap-8 mt-2">
            <button class="btn btn-primary" id="lw-submit">Log Record</button>
            <button class="btn btn-ghost" id="lw-cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('lw-submit').onclick = () => {
      const date = document.getElementById('lw-date').value;
      const wu = document.getElementById('lw-wu').value;
      const memberEmail = members.length ? document.getElementById('lw-member').value : session.user.email;
      if (!date || !wu) { Utils.toast('Date and work unit required','bad'); return; }
      const fields = {};
      team.fields.forEach(f => {
        const el = document.getElementById('lw-'+f);
        if (el) fields[f] = (LIBRARY.fieldDef(f)?.type === 'number') ? (parseFloat(el.value)||0) : el.value;
      });
      State.addRecord({ teamId: team.id, memberEmail, date, workUnit: wu, fields });
      Utils.toast('Record logged!','good');
      tab = 'dashboard';
      render(session);
    };
    document.getElementById('lw-cancel').onclick = () => { tab='dashboard'; render(session); };
  }

  function renderSettings(main, session) {
    const team = session.team;
    main.innerHTML = `
      <div class="page-header">
        <div><h2>Team Settings</h2><div class="ph-sub">Configure ${escape(team.name)}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Team Info</span></div>
        <div class="card-body">
          <div class="form-row"><label class="label">Team name</label><input id="ts-name" value="${escape(team.name)}"></div>
          <div class="form-row"><label class="label">Department</label><input id="ts-dept" value="${escape(team.department||'')}"></div>
          <button class="btn btn-primary btn-sm" id="ts-save">Save</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Work Units</span><span class="muted" style="font-size:12px">${team.workUnits.length} configured</span></div>
        <div class="card-body" style="display:flex;flex-wrap:wrap;gap:6px">
          ${team.workUnits.map(id => `<span class="pill pill-r">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>`).join('') || '<span class="muted">None</span>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Goals</span></div>
        <div class="card-body">
          ${Object.keys(team.goals).filter(k=>team.goals[k]>0).length ? Object.entries(team.goals).filter(([k,v])=>v>0).map(([id,v])=>`
            <div class="flex jb" style="padding:8px 0;border-bottom:1px solid var(--bor)">
              <span>${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>
              <strong>${v}/day</strong>
            </div>
          `).join('') : '<span class="muted">No goals set</span>'}
        </div>
      </div>
    `;
    document.getElementById('ts-save').onclick = () => {
      const newName = document.getElementById('ts-name').value.trim();
      const newDept = document.getElementById('ts-dept').value.trim();
      const t = State.teamById(team.id);
      Object.assign(t, { name: newName, department: newDept });
      State.save();
      Utils.toast('Saved','good');
      render(session);
    };
  }

  function escape(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render };

})();
