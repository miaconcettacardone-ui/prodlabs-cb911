/* ============================================================
 *  views/member.js — Team Member dashboard
 * ============================================================
 *  Phase 1: minimal — sees own stats, can log own records.
 *  Phase 2: goal progress visualization, charts of own activity.
 * ============================================================ */

const MemberView = (() => {

  let tab = 'dashboard';

  function render(session) {
    const main = document.getElementById('app-main');
    const tabsEl = document.getElementById('app-tabs');
    const team = session.team;

    tabsEl.innerHTML = `
      <button class="tab ${tab==='dashboard'?'on':''}" data-tab="dashboard">${Utils.icon('home',14)} My Dashboard</button>
      <button class="tab ${tab==='log'?'on':''}" data-tab="log">${Utils.icon('plus',14)} Log Work</button>
      <button class="tab ${tab==='history'?'on':''}" data-tab="history">${Utils.icon('chart',14)} My History</button>
    `;
    tabsEl.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => { tab = t.dataset.tab; render(session); };
    });

    if (!team) {
      main.innerHTML = `<div class="card"><div class="card-body"><h3>No team</h3><p class="muted">Your team hasn't been set up. Contact your manager.</p></div></div>`;
      return;
    }

    if (tab === 'dashboard') renderDashboard(main, session);
    else if (tab === 'log') renderLog(main, session);
    else if (tab === 'history') renderHistory(main, session);
  }

  function renderDashboard(main, session) {
    const team = session.team;
    const myEmail = session.user.email.toLowerCase();
    const myRecords = State.recordsOfTeam(team.id).filter(r => r.memberEmail.toLowerCase() === myEmail);
    const today = Utils.todayISO();
    const todayRecs = myRecords.filter(r => r.date === today);
    const monthRecs = myRecords.filter(r => r.date.startsWith(today.slice(0,7)));

    // goal progress for today
    const goals = team.goals || {};
    const goalRows = Object.entries(goals).filter(([id,v])=>v>0).map(([id,target]) => {
      const done = todayRecs.filter(r => r.workUnit === id).length;
      const pct = Math.min(100, Math.round((done/target)*100));
      return `
        <div style="margin-bottom:1rem">
          <div class="flex jb" style="margin-bottom:6px">
            <span style="font-weight:600;font-size:13px">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>
            <span style="font-size:13px;font-weight:700;color:${pct>=100?'var(--gr)':'var(--ink)'}">${done} / ${target}</span>
          </div>
          <div style="height:8px;background:var(--s2);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--gr)':'var(--cb-red)'};transition:width .4s var(--ease)"></div>
          </div>
        </div>
      `;
    }).join('');

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Hi ${escape(session.user.displayName.split(' ')[0])} 👋</h2>
          <div class="ph-sub">${escape(team.name)} · ${session.user.role ? escape(session.user.role) : 'Team Member'}</div>
        </div>
        <button class="btn btn-primary" data-go="log">${Utils.icon('plus',14)} Log Work</button>
      </div>

      <div class="metric-grid">
        <div class="metric metric-r"><div class="metric-label">Today</div><div class="metric-value">${todayRecs.length}</div><div class="metric-sub">records logged today</div></div>
        <div class="metric metric-b"><div class="metric-label">This Month</div><div class="metric-value">${monthRecs.length}</div><div class="metric-sub">month-to-date</div></div>
        <div class="metric metric-g"><div class="metric-label">All Time</div><div class="metric-value">${myRecords.length.toLocaleString()}</div><div class="metric-sub">your total</div></div>
      </div>

      ${goalRows ? `
        <div class="card">
          <div class="card-head"><span class="card-title">Today's Goals</span></div>
          <div class="card-body">${goalRows}</div>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-head"><span class="card-title">Recent</span></div>
        ${myRecords.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Work Unit</th>${team.fields.includes('amount')?'<th>Amount</th>':''}${team.fields.includes('outcome')?'<th>Outcome</th>':''}</tr></thead>
              <tbody>
                ${myRecords.slice(-10).reverse().map(r => `<tr>
                  <td>${r.date}</td>
                  <td>${escape(LIBRARY.workUnitLabel(r.workUnit, team.workUnitLabels))}</td>
                  ${team.fields.includes('amount')?`<td>${Utils.fmt$(r.fields?.amount||0)}</td>`:''}
                  ${team.fields.includes('outcome')?`<td>${r.fields?.outcome?`<span class="pill ${r.fields.outcome==='Win'?'pill-g':r.fields.outcome==='Loss'?'pill-r':'pill-a'}">${escape(r.fields.outcome)}</span>`:'—'}</td>`:''}
                </tr>`).join('')}
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

  function renderLog(main, session) {
    const team = session.team;
    main.innerHTML = `
      <div class="page-header"><div><h2>Log Work</h2><div class="ph-sub">Add a record for yourself.</div></div></div>
      <div class="card" style="max-width:680px">
        <div class="card-body">
          <div class="form-row">
            <label class="label">Date</label>
            <input type="date" id="lw-date" value="${Utils.todayISO()}">
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
      if (!date || !wu) { Utils.toast('Date and work unit required','bad'); return; }
      const fields = {};
      team.fields.forEach(f => {
        const el = document.getElementById('lw-'+f);
        if (el) fields[f] = (LIBRARY.fieldDef(f)?.type === 'number') ? (parseFloat(el.value)||0) : el.value;
      });
      State.addRecord({ teamId: team.id, memberEmail: session.user.email, date, workUnit: wu, fields });
      Utils.toast('Record logged!','good');
      tab = 'dashboard';
      render(session);
    };
    document.getElementById('lw-cancel').onclick = () => { tab='dashboard'; render(session); };
  }

  function renderHistory(main, session) {
    const team = session.team;
    const myEmail = session.user.email.toLowerCase();
    const myRecords = State.recordsOfTeam(team.id).filter(r => r.memberEmail.toLowerCase() === myEmail);

    main.innerHTML = `
      <div class="page-header"><div><h2>My History</h2><div class="ph-sub">${myRecords.length} record${myRecords.length!==1?'s':''} total</div></div></div>
      <div class="card">
        ${myRecords.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Work Unit</th>${team.fields.map(f => `<th>${LIBRARY.fieldDef(f)?.label||f}</th>`).join('')}</tr></thead>
              <tbody>
                ${myRecords.slice().reverse().map(r => `<tr>
                  <td>${r.date}</td>
                  <td>${escape(LIBRARY.workUnitLabel(r.workUnit, team.workUnitLabels))}</td>
                  ${team.fields.map(f => `<td>${formatField(f, r.fields?.[f])}</td>`).join('')}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="empty"><h3>No history yet</h3><p>Records you log will appear here.</p></div>`}
      </div>
    `;
  }

  function formatField(id, val) {
    if (val === undefined || val === null || val === '') return '<span class="muted">—</span>';
    const def = LIBRARY.fieldDef(id);
    if (!def) return escape(String(val));
    if (id === 'amount') return Utils.fmt$(val);
    if (id === 'outcome') {
      return `<span class="pill ${val==='Win'?'pill-g':val==='Loss'?'pill-r':'pill-a'}">${escape(String(val))}</span>`;
    }
    return escape(String(val));
  }

  function escape(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render };

})();
