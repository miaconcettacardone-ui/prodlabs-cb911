/* ============================================================
 *  views/member.js — Team Member dashboard (Phase 3)
 * ============================================================
 *  Tabs: Dashboard · Log Work · History
 *
 *  Members see their OWN data only. They can:
 *    - View today's goal progress
 *    - See their last 30-day trend (chart)
 *    - See their by-work-unit breakdown (chart)
 *    - Filter & search their history
 *    - Edit / delete their own records (gated by CONFIG.FEATURES.memberSelfDelete)
 *
 *  TZ NOTE: see manager.js header.
 * ============================================================ */

const MemberView = (() => {

  let tab = 'dashboard';
  let historySort = { col: 'date', dir: 'desc' };
  let historyFilter = { search: '', workUnit: '', dateFrom: '', dateTo: '' };

  function render(session) {
    Charts.destroyAll();
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
      main.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="empty">
              <div class="empty-icon">${Utils.icon('shield',28)}</div>
              <h3>No team</h3>
              <p>Your team hasn't been set up yet. Contact your manager.</p>
            </div>
          </div>
        </div>`;
      return;
    }

    if      (tab === 'dashboard') renderDashboard(main, session);
    else if (tab === 'log')       renderLog(main, session);
    else if (tab === 'history')   renderHistory(main, session);
  }

  // ============================================================
  //  DASHBOARD
  // ============================================================
  function renderDashboard(main, session) {
    const team = session.team;
    const myEmail = session.user.email.toLowerCase();
    const myRecords = State.recordsOfTeam(team.id).filter(r => r.memberEmail.toLowerCase() === myEmail);
    const today = Utils.todayISO();
    const periods = Analytics.periodCounts(myRecords, today);
    const todayRecs = myRecords.filter(r => r.date === today);
    const goalsActive = Analytics.activeGoals(team);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Hi ${escape(session.user.displayName.split(' ')[0])} 👋</h2>
          <div class="ph-sub">${escape(team.name)} · ${session.user.role ? escape(session.user.role) : 'Team Member'}</div>
        </div>
        <button class="btn btn-primary" data-go="log">${Utils.icon('plus',14)} Log Work</button>
      </div>

      <div class="metric-grid">
        ${metric('Today',      periods.today,                   'records logged today',  'r')}
        ${metric('This Week',  periods.thisWeek,                'week-to-date',          'b')}
        ${metric('This Month', periods.thisMonth,               'month-to-date',         'g')}
        ${metric('All Time',   periods.allTime.toLocaleString(),'your total',            'a')}
      </div>

      ${goalsActive.length ? `
        <div class="card">
          <div class="card-head">
            <span class="card-title">Today's Goals</span>
            <span class="muted text-xs">${todayRecs.length} record${todayRecs.length!==1?'s':''} today</span>
          </div>
          <div class="card-body">
            ${goalsActive.map(([id, target]) => {
              const done = todayRecs.filter(r => r.workUnit === id).length;
              const pct = Math.min(100, Math.round((done/Math.max(target,1))*100));
              const hit = done >= target;
              return `
                <div class="goal-row">
                  <div class="flex jb ac mb-6">
                    <span class="goal-label">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>
                    <span class="goal-val ${hit?'goal-val-hit':''}">${done} / ${target} ${hit?'✓':''}</span>
                  </div>
                  <div class="bar-track"><div class="bar-fill ${hit?'bar-fill-hit':''}" style="width:${pct}%"></div></div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="split-2">
        <div class="card">
          <div class="card-head"><span class="card-title">Last ${CONFIG.TREND_CHART_DAYS} Days</span></div>
          <div class="card-body">
            ${myRecords.length ? `<div class="chart-wrap"><canvas id="ch-mine-trend"></canvas></div>`
              : emptyState('No records yet', 'Log your first record to see your trend.', 'chart')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title">By Work Unit — All Time</span></div>
          <div class="card-body">
            ${myRecords.length ? `<div class="chart-wrap"><canvas id="ch-mine-wu"></canvas></div>`
              : emptyState('No records yet', 'This chart will populate as you log work.', 'chart')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Recent</span>
          <button class="btn btn-ghost btn-sm" data-go="history">View all ${Utils.icon('arrow', 12)}</button>
        </div>
        ${myRecords.length ? renderRecordTable(team, myRecords.slice(-CONFIG.RECENT_ACTIVITY_SIZE).reverse(), { compact:true })
          : `<div class="card-body">${emptyState('No records yet', 'Log your first record using the button above.', 'chart')}</div>`}
      </div>
    `;
    bindLinks(main, session);

    if (myRecords.length) {
      Charts.trend('ch-mine-trend', myRecords);
      Charts.byWorkUnit('ch-mine-wu', team, myRecords);
    }
  }

  // ============================================================
  //  LOG WORK
  // ============================================================
  function renderLog(main, session) {
    const team = session.team;
    main.innerHTML = `
      <div class="page-header">
        <div><h2>Log Work</h2><div class="ph-sub">Add a record for yourself.</div></div>
      </div>
      <div class="card form-narrow">
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
            <button class="btn btn-primary" id="lw-submit">${Utils.icon('check',14)} Log Record</button>
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

  // ============================================================
  //  HISTORY — filterable, sortable
  // ============================================================
  function renderHistory(main, session) {
    const team = session.team;
    const myEmail = session.user.email.toLowerCase();
    const myRecords = State.recordsOfTeam(team.id).filter(r => r.memberEmail.toLowerCase() === myEmail);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>My History</h2>
          <div class="ph-sub">${myRecords.length.toLocaleString()} record${myRecords.length!==1?'s':''} total</div>
        </div>
        <button class="btn btn-primary" data-go="log">${Utils.icon('plus',14)} Log Work</button>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">All Records</span>
          <span class="muted text-xs"><span id="mh-count">${myRecords.length}</span> shown</span>
        </div>
        <div class="card-body py-0">
          <div class="fbar mb-2">
            <div class="fg">
              <label>Search</label>
              <input id="mhf-search" type="text" placeholder="work unit, notes..." value="${escape(historyFilter.search)}">
            </div>
            <div class="fg">
              <label>Work Unit</label>
              <select id="mhf-wu">
                <option value="">All work units</option>
                ${team.workUnits.map(id => `<option value="${escape(id)}" ${historyFilter.workUnit===id?'selected':''}>${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</option>`).join('')}
              </select>
            </div>
            <div class="fg">
              <label>From</label>
              <input id="mhf-from" type="date" value="${escape(historyFilter.dateFrom)}">
            </div>
            <div class="fg">
              <label>To</label>
              <input id="mhf-to" type="date" value="${escape(historyFilter.dateTo)}">
            </div>
            <button class="btn btn-ghost btn-sm" id="mhf-clear">Clear</button>
          </div>
        </div>
        <div id="mh-table-wrap">${renderRecordTable(team, myRecords, { sortable: true, showActions: true, members: [session.user] })}</div>
      </div>
    `;

    const apply = () => {
      historyFilter.search   = document.getElementById('mhf-search').value;
      historyFilter.workUnit = document.getElementById('mhf-wu').value;
      historyFilter.dateFrom = document.getElementById('mhf-from').value;
      historyFilter.dateTo   = document.getElementById('mhf-to').value;
      const filtered = Analytics.filterRecords(myRecords, [session.user], { ...historyFilter, memberEmail: '' });
      document.getElementById('mh-count').textContent = filtered.length;
      document.getElementById('mh-table-wrap').innerHTML = renderRecordTable(team, filtered, { sortable: true, showActions: true, members: [session.user] });
      bindSortHeaders(team, myRecords, session);
      bindRowActions(main, session);
    };
    document.getElementById('mhf-search').oninput = debounce(apply, CONFIG.DEBOUNCE_MS_INPUT);
    ['mhf-wu','mhf-from','mhf-to'].forEach(id => document.getElementById(id).onchange = apply);
    document.getElementById('mhf-clear').onclick = () => {
      historyFilter = { search:'', workUnit:'', dateFrom:'', dateTo:'' };
      renderHistory(main, session);
    };
    bindLinks(main, session);
    bindSortHeaders(team, myRecords, session);
    bindRowActions(main, session);
  }

  function bindSortHeaders(team, myRecords, session) {
    document.querySelectorAll('#mh-table-wrap [data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        if (historySort.col === col) historySort.dir = historySort.dir === 'asc' ? 'desc' : 'asc';
        else { historySort.col = col; historySort.dir = 'desc'; }
        const filtered = Analytics.filterRecords(myRecords, [session.user], { ...historyFilter, memberEmail: '' });
        document.getElementById('mh-table-wrap').innerHTML = renderRecordTable(team, filtered, { sortable: true, showActions: true, members: [session.user] });
        bindSortHeaders(team, myRecords, session);
        bindRowActions(document.getElementById('app-main'), session);
      };
    });
  }

  // ============================================================
  //  RECORD ACTIONS (edit own / delete own)
  // ============================================================
  function openEditModal(session, recordId) {
    const team = session.team;
    const rec = State.get().records.find(r => r.id === recordId);
    if (!rec) { Utils.toast('Record not found', 'bad'); return; }
    if (rec.memberEmail.toLowerCase() !== session.user.email.toLowerCase()) {
      Utils.toast('You can only edit your own records', 'bad');
      return;
    }
    Utils.openModal(`
      <h3>Edit Record</h3>
      <div class="form-row">
        <label class="label">Date</label>
        <input type="date" id="ed-date" value="${escape(rec.date)}">
      </div>
      <div class="form-row">
        <label class="label">Work Unit</label>
        <select id="ed-wu">
          ${team.workUnits.map(id => `<option value="${escape(id)}" ${id===rec.workUnit?'selected':''}>${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</option>`).join('')}
        </select>
      </div>
      ${team.fields.map(f => {
        const def = LIBRARY.fieldDef(f);
        if (!def) return '';
        const cur = rec.fields?.[f] ?? '';
        if (def.type === 'enum') {
          return `<div class="form-row"><label class="label">${def.label}</label><select id="ed-${f}">${def.options.map(o=>`<option ${o===cur?'selected':''}>${o}</option>`).join('')}</select></div>`;
        }
        return `<div class="form-row"><label class="label">${def.label}</label><input ${def.type==='number'?'type="number" step="0.01"':''} id="ed-${f}" value="${escape(String(cur))}" placeholder="${def.hint}"></div>`;
      }).join('')}
      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" id="ed-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="ed-save">Save</button>
      </div>
    `);
    document.getElementById('ed-cancel').onclick = () => Utils.closeModal();
    document.getElementById('ed-save').onclick = () => {
      const date = document.getElementById('ed-date').value;
      const wu = document.getElementById('ed-wu').value;
      if (!date || !wu) { Utils.toast('Date and work unit required','bad'); return; }
      const fields = {};
      team.fields.forEach(f => {
        const el = document.getElementById('ed-'+f);
        if (el) fields[f] = (LIBRARY.fieldDef(f)?.type === 'number') ? (parseFloat(el.value)||0) : el.value;
      });
      State.updateRecord(recordId, { date, workUnit: wu, fields });
      Utils.closeModal();
      Utils.toast('Saved', 'good');
      render(session);
    };
  }

  function deleteRecord(session, recordId) {
    if (!CONFIG.FEATURES.memberSelfDelete) {
      Utils.toast('Ask your manager to delete this record', 'warn');
      return;
    }
    const rec = State.get().records.find(r => r.id === recordId);
    if (!rec) return;
    if (rec.memberEmail.toLowerCase() !== session.user.email.toLowerCase()) {
      Utils.toast('You can only delete your own records', 'bad');
      return;
    }
    if (!Utils.confirm('Delete this record? This cannot be undone.')) return;
    State.deleteRecord(recordId);
    Utils.toast('Deleted', 'good');
    render(session);
  }

  // ============================================================
  //  SHARED RENDERERS
  // ============================================================
  function renderRecordTable(team, records, opts) {
    opts = opts || {};
    const members = opts.members || [];
    if (!records.length) {
      return opts.sortable
        ? emptyState('No records match', 'Try clearing some filters.', 'search')
        : `<div class="card-body">${emptyState('No records yet', 'Records will show up here as you log them.', 'chart')}</div>`;
    }
    const showAmount  = team.fields.includes('amount');
    const showOutcome = team.fields.includes('outcome');
    // Members can edit own; delete depends on flag.
    const canEdit = CONFIG.FEATURES.editRecords;
    const canDelete = CONFIG.FEATURES.memberSelfDelete;
    const showActions = opts.showActions && (canEdit || canDelete);

    const sorted = opts.sortable ? Analytics.sortRecords(records, members, historySort) : records;
    const cap = opts.sortable ? CONFIG.ACTIVITY_TABLE_CAP : sorted.length;
    const arrow = (col) => historySort.col === col
      ? (historySort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    const headerCell = (key, label) => opts.sortable
      ? `<th data-sort="${key}" class="sortable">${label}${arrow(key)}</th>`
      : `<th>${label}</th>`;

    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            ${headerCell('date', 'Date')}
            ${headerCell('workUnit', 'Work Unit')}
            ${showAmount ? headerCell('amount', 'Amount') : ''}
            ${showOutcome ? '<th>Outcome</th>' : ''}
            ${showActions ? '<th></th>' : ''}
          </tr></thead>
          <tbody>
            ${sorted.slice(0, cap).map(r => `<tr>
              <td>${r.date}</td>
              <td>${escape(LIBRARY.workUnitLabel(r.workUnit, team.workUnitLabels))}</td>
              ${showAmount?`<td>${Utils.fmt$(r.fields?.amount||0)}</td>`:''}
              ${showOutcome?`<td>${r.fields?.outcome?`<span class="pill ${r.fields.outcome==='Win'?'pill-g':r.fields.outcome==='Loss'?'pill-r':'pill-a'}">${escape(r.fields.outcome)}</span>`:'<span class="muted">—</span>'}</td>`:''}
              ${showActions ? `<td class="row-actions">
                ${canEdit ? `<button class="icon-btn" data-edit="${escape(r.id)}" title="Edit">${Utils.icon('edit',14)}</button>` : ''}
                ${canDelete ? `<button class="icon-btn" data-del="${escape(r.id)}" title="Delete">${Utils.icon('trash',14)}</button>` : ''}
              </td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${opts.sortable && sorted.length > cap ? `<div class="muted text-center text-xs py-12">Showing first ${cap} of ${sorted.length}. Refine filters to narrow.</div>` : ''}
    `;
  }

  function bindRowActions(scope, session) {
    if (!scope) return;
    scope.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => openEditModal(session, btn.dataset.edit);
    });
    scope.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => deleteRecord(session, btn.dataset.del);
    });
  }

  // ============================================================
  //  HELPERS
  // ============================================================
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

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function escape(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render };

})();
