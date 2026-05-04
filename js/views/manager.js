/* ============================================================
 *  views/manager.js — Manager dashboard (Phase 2)
 * ============================================================
 *  Tabs: Overview · Approvals · Team · Activity · Log Work · Settings
 *
 *  Polished to match super.js. Adds:
 *   - Real Chart.js charts (records-over-time line, by-work-unit bar,
 *     by-member bar, day-of-week pattern)
 *   - Today's team goal tracker (aggregated across team)
 *   - Leaderboards (top by total, top by goal hit %)
 *   - Per-member drill-down (records, charts, goals)
 *   - Sortable + filterable activity table
 *
 *  Phase 3 will add: CSV import, edit/delete records, deeper filters.
 *
 *  CHART LIFECYCLE: every chart we mount is registered in `_charts` and
 *  destroyed on re-render so we don't leak when tabs change.
 *
 *  TZ NOTE for devs: "today" / "this week" / "this month" all use the
 *  user's local timezone via Utils.todayISO(). Real backend will need an
 *  explicit company-level TZ + week-start-day setting. See SPEC.md (Phase 4).
 * ============================================================ */

const ManagerView = (() => {

  let tab = 'overview';
  let drillMember = null;     // email of member being drilled into (Team tab)
  let activitySort = { col: 'date', dir: 'desc' };
  let activityFilter = { search: '', memberEmail: '', workUnit: '', dateFrom: '', dateTo: '' };

  // active chart instances by canvas id (so we can destroy on re-render)
  const _charts = {};
  function destroyCharts() {
    Object.keys(_charts).forEach(id => {
      try { _charts[id].destroy(); } catch (_) {}
      delete _charts[id];
    });
  }

  // ---- main entry --------------------------------------------
  function render(session) {
    destroyCharts();
    const main = document.getElementById('app-main');
    const tabsEl = document.getElementById('app-tabs');
    const team = session.team;
    const pendingCount = State.pendingForUser(session).length;

    tabsEl.innerHTML = `
      ${tabBtn('overview',  'Overview',  'home')}
      ${tabBtn('approvals', 'Approvals', 'bell', pendingCount)}
      ${tabBtn('team',      'Team',      'users')}
      ${tabBtn('activity',  'Activity',  'chart')}
      ${tabBtn('log',       'Log Work',  'plus')}
      ${tabBtn('settings',  'Settings',  'settings')}
    `;
    tabsEl.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => { tab = t.dataset.tab; drillMember = null; render(session); };
    });

    if (!team) {
      main.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="empty">
              <div class="empty-icon">${Utils.icon('shield', 28)}</div>
              <h3>No team yet</h3>
              <p>Your manager request hasn't been approved or your team wasn't created. Contact a super admin.</p>
            </div>
          </div>
        </div>`;
      return;
    }

    if      (tab === 'overview')  renderOverview(main, session);
    else if (tab === 'approvals') renderApprovals(main, session);
    else if (tab === 'team')      renderTeam(main, session);
    else if (tab === 'activity')  renderActivity(main, session);
    else if (tab === 'log')       renderLog(main, session);
    else if (tab === 'settings')  renderSettings(main, session);
  }

  function tabBtn(key, label, icon, count) {
    return `<button class="tab ${tab===key?'on':''}" data-tab="${key}">
      ${Utils.icon(icon, 14)} ${label}
      ${count ? `<span class="tab-badge">${count}</span>` : ''}
    </button>`;
  }

  // ============================================================
  //  OVERVIEW
  // ============================================================
  function renderOverview(main, session) {
    const team = session.team;
    const records = State.recordsOfTeam(team.id);
    const members = State.membersOfTeam(team.id);
    const today = Utils.todayISO();
    const weekStart = startOfWeekISO(today);
    const monthPfx = today.slice(0, 7);

    const todayRecs = records.filter(r => r.date === today);
    const weekRecs  = records.filter(r => r.date >= weekStart && r.date <= today);
    const monthRecs = records.filter(r => r.date.startsWith(monthPfx));

    const goalsActive = Object.entries(team.goals || {}).filter(([id,v]) => v > 0);
    const pendingCount = State.pendingForUser(session).length;

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>${escape(team.name)}</h2>
          <div class="ph-sub">${escape(team.department || 'Team')} · ${members.length} member${members.length!==1?'s':''} · Welcome back, ${escape(session.user.displayName.split(' ')[0])}</div>
        </div>
        <div class="flex gap-8">
          ${pendingCount ? `<button class="btn btn-ghost" data-go="approvals">${Utils.icon('bell',14)} ${pendingCount} pending</button>` : ''}
          <button class="btn btn-primary" data-go="log">${Utils.icon('plus',14)} Log Work</button>
        </div>
      </div>

      <div class="metric-grid">
        ${metric('Today',      todayRecs.length,  'records logged today',  'r')}
        ${metric('This Week',  weekRecs.length,   'week-to-date',          'b')}
        ${metric('This Month', monthRecs.length,  'month-to-date',         'g')}
        ${metric('All Time',   records.length.toLocaleString(), 'total records', 'a')}
      </div>

      ${goalsActive.length ? `
        <div class="card">
          <div class="card-head">
            <span class="card-title">Today's Team Goals</span>
            <span class="muted" style="font-size:12px">${todayRecs.length} record${todayRecs.length!==1?'s':''} · ${members.length} member${members.length!==1?'s':''}</span>
          </div>
          <div class="card-body">
            ${goalsActive.map(([id, perPersonTarget]) => {
              const teamTarget = perPersonTarget * Math.max(members.length, 1);
              const done = todayRecs.filter(r => r.workUnit === id).length;
              const pct = Math.min(100, Math.round((done / Math.max(teamTarget, 1)) * 100));
              const hit = done >= teamTarget;
              return `
                <div class="goal-row">
                  <div class="flex jb ac" style="margin-bottom:6px">
                    <div>
                      <span style="font-weight:600;font-size:13px">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>
                      <span class="muted" style="font-size:11px;margin-left:6px">${perPersonTarget}/day per person</span>
                    </div>
                    <span style="font-size:13px;font-weight:700;color:${hit?'var(--gr)':'var(--ink)'}">
                      ${done} / ${teamTarget} ${hit ? '✓' : ''}
                    </span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" style="width:${pct}%;background:${hit?'var(--gr)':'var(--cb-red)'}"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="split-2">
        <div class="card">
          <div class="card-head">
            <span class="card-title">Records — Last 30 Days</span>
            <span class="muted" style="font-size:12px">daily activity</span>
          </div>
          <div class="card-body">
            ${records.length ? `<div class="chart-wrap"><canvas id="ch-trend"></canvas></div>`
              : emptyState('No data yet', 'Log records to see the trend.', 'chart')}
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <span class="card-title">By Work Unit — This Month</span>
            <span class="muted" style="font-size:12px">${monthRecs.length} record${monthRecs.length!==1?'s':''}</span>
          </div>
          <div class="card-body">
            ${monthRecs.length ? `<div class="chart-wrap"><canvas id="ch-wu"></canvas></div>`
              : emptyState('No records this month', 'This chart will populate as records come in.', 'chart')}
          </div>
        </div>
      </div>

      <div class="split-2">
        <div class="card">
          <div class="card-head">
            <span class="card-title">${Utils.icon('crown',14)} Top Performers</span>
            <span class="muted" style="font-size:12px">this month</span>
          </div>
          ${members.length && monthRecs.length
            ? renderLeaderboard(buildTopByTotal(members, monthRecs), 'records')
            : `<div class="card-body">${emptyState('Nothing yet', members.length ? 'No records this month yet.' : 'Add team members first.', 'crown')}</div>`}
        </div>

        <div class="card">
          <div class="card-head">
            <span class="card-title">${Utils.icon('check',14)} Goal Hit Rate</span>
            <span class="muted" style="font-size:12px">last 14 days</span>
          </div>
          ${members.length && goalsActive.length
            ? renderLeaderboard(buildGoalHitRate(team, members, records), 'pct')
            : `<div class="card-body">${emptyState('No goals to track', goalsActive.length ? 'Add team members to track goal hit rates.' : 'Set daily goals in Settings to track hit rates.', 'check')}</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Recent Activity</span>
          <button class="btn btn-ghost btn-sm" data-go="activity">View all ${Utils.icon('arrow', 12)}</button>
        </div>
        ${renderActivityTableSmall(team, members, records.slice(-10).reverse())}
      </div>
    `;

    bindLinks(main, session);

    // mount charts after DOM is in place
    if (records.length)   mountTrendChart('ch-trend', records, 30);
    if (monthRecs.length) mountWorkUnitChart('ch-wu', team, monthRecs);
  }

  // ============================================================
  //  APPROVALS
  // ============================================================
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
          <div class="card-head">
            <span class="card-title">Pending Requests · ${pending.length}</span>
          </div>
          <div class="card-body">
            ${pending.map(p => `
              <div class="pending-card" data-pid="${p.id}">
                <div class="avatar avatar-lg">${Utils.initials(p.displayName)}</div>
                <div class="pc-info">
                  <div class="pc-name">${escape(p.displayName)} <span class="pill pill-b">Member</span></div>
                  <div class="pc-meta">${escape(p.email)} · requested ${Utils.fmtRelative(p.requestedAt)}${p.payload && p.payload.role?' · role: '+escape(p.payload.role):''}</div>
                </div>
                <div class="pc-actions">
                  <button class="btn btn-success btn-sm" data-act="approve">${Utils.icon('check',12)} Approve</button>
                  <button class="btn btn-danger btn-sm" data-act="deny">${Utils.icon('x',12)} Deny</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : `<div class="card">${emptyState('Nothing to approve', 'When members request access to your team, their requests appear here.', 'check')}</div>`}

      <div class="card">
        <div class="card-head"><span class="card-title">Decision History</span></div>
        ${renderApprovalHistory(session)}
      </div>
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

  function renderApprovalHistory(session) {
    const team = session.team;
    const hist = State.get().pending
      .filter(p => p.status !== 'pending'
                && p.type === 'member'
                && p.payload && p.payload.teamId === team.id)
      .sort((a,b) => (b.decidedAt||0) - (a.decidedAt||0))
      .slice(0, 20);
    if (!hist.length) return `<div class="card-body">${emptyState('No history yet', 'Approved and denied requests will be logged here.', 'check')}</div>`;
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Decided</th><th>Note</th></tr></thead>
          <tbody>
            ${hist.map(p => `<tr>
              <td><strong>${escape(p.displayName)}</strong><div class="muted" style="font-size:11px">${escape(p.email)}</div></td>
              <td><span class="pill ${p.status==='approved'?'pill-g':'pill-r'}">${p.status}</span></td>
              <td>${Utils.fmtRelative(p.decidedAt)}</td>
              <td>${p.decisionNote ? escape(p.decisionNote) : '<span class="muted">—</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ============================================================
  //  TEAM — roster grid + per-member drill-down
  // ============================================================
  function renderTeam(main, session) {
    const team = session.team;
    const members = State.membersOfTeam(team.id);
    const records = State.recordsOfTeam(team.id);

    if (drillMember) {
      const m = members.find(x => x.email.toLowerCase() === drillMember.toLowerCase());
      if (!m) { drillMember = null; return renderTeam(main, session); }
      return renderMemberDetail(main, session, m, records);
    }

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Team Members</h2>
          <div class="ph-sub">${members.length} member${members.length!==1?'s':''} on ${escape(team.name)} · click anyone for detail</div>
        </div>
      </div>

      ${members.length ? `
        <div class="member-grid">
          ${members.map(m => renderMemberCard(team, m, records)).join('')}
        </div>
      ` : `<div class="card">${emptyState('No members yet', 'Members can request to join your team from the home page. Their requests will show in the Approvals tab.', 'users')}</div>`}
    `;

    main.querySelectorAll('[data-drill]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-rm]')) return; // don't drill on remove click
        drillMember = el.dataset.drill;
        render(session);
      };
    });
    main.querySelectorAll('[data-rm]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (!Utils.confirm('Remove this member from the team?')) return;
        State.deleteUser(btn.dataset.rm, 'member');
        Utils.toast('Removed','good');
        render(session);
      };
    });
  }

  function renderMemberCard(team, m, allRecords) {
    const myRecs = allRecords.filter(r => r.memberEmail.toLowerCase() === m.email.toLowerCase());
    const today = Utils.todayISO();
    const monthPfx = today.slice(0, 7);
    const monthRecs = myRecs.filter(r => r.date.startsWith(monthPfx));
    const todayRecs = myRecs.filter(r => r.date === today);

    const goalsActive = Object.entries(team.goals || {}).filter(([id,v]) => v > 0);
    const todayHit = goalsActive.length
      ? Math.round((goalsActive.filter(([id,target]) =>
          todayRecs.filter(r => r.workUnit === id).length >= target
        ).length / goalsActive.length) * 100)
      : null;

    return `
      <div class="member-card" data-drill="${escape(m.email)}">
        <div class="mc-head">
          <div class="avatar avatar-lg">${Utils.initials(m.displayName)}</div>
          <div class="mc-id">
            <div class="mc-name">${escape(m.displayName)}</div>
            <div class="mc-sub">${m.role ? `<span class="pill pill-r" style="font-size:10px">${escape(m.role)}</span>` : '<span class="muted">No role</span>'}</div>
          </div>
          <button class="icon-btn" data-rm="${escape(m.email)}" title="Remove member">${Utils.icon('trash',14)}</button>
        </div>
        <div class="mc-stats">
          <div class="mc-stat">
            <div class="mc-stat-label">Today</div>
            <div class="mc-stat-val">${todayRecs.length}</div>
          </div>
          <div class="mc-stat">
            <div class="mc-stat-label">This Month</div>
            <div class="mc-stat-val">${monthRecs.length}</div>
          </div>
          <div class="mc-stat">
            <div class="mc-stat-label">Today's Goals</div>
            <div class="mc-stat-val" style="color:${todayHit==null?'var(--i3)':todayHit>=100?'var(--gr)':todayHit>=50?'var(--am)':'var(--cb-red)'}">${todayHit==null?'—':todayHit+'%'}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMemberDetail(main, session, m, allRecords) {
    const team = session.team;
    const myRecs = allRecords.filter(r => r.memberEmail.toLowerCase() === m.email.toLowerCase());
    const today = Utils.todayISO();
    const weekStart = startOfWeekISO(today);
    const monthPfx = today.slice(0, 7);

    const todayRecs = myRecs.filter(r => r.date === today);
    const weekRecs  = myRecs.filter(r => r.date >= weekStart && r.date <= today);
    const monthRecs = myRecs.filter(r => r.date.startsWith(monthPfx));

    const goalsActive = Object.entries(team.goals || {}).filter(([id,v]) => v > 0);

    main.innerHTML = `
      <div class="page-header">
        <div class="flex ac gap-12">
          <button class="icon-btn" data-back>${Utils.icon('back', 14)}</button>
          <div>
            <h2>${escape(m.displayName)}</h2>
            <div class="ph-sub">${escape(m.email)}${m.role?' · '+escape(m.role):''} · joined ${Utils.fmtRelative(m.createdAt)}</div>
          </div>
        </div>
      </div>

      <div class="metric-grid">
        ${metric('Today',      todayRecs.length, 'logged today',  'r')}
        ${metric('This Week',  weekRecs.length,  'week-to-date',  'b')}
        ${metric('This Month', monthRecs.length, 'month-to-date', 'g')}
        ${metric('All Time',   myRecs.length.toLocaleString(), 'total records', 'a')}
      </div>

      ${goalsActive.length ? `
        <div class="card">
          <div class="card-head">
            <span class="card-title">Today's Goal Progress</span>
          </div>
          <div class="card-body">
            ${goalsActive.map(([id, target]) => {
              const done = todayRecs.filter(r => r.workUnit === id).length;
              const pct = Math.min(100, Math.round((done / Math.max(target, 1)) * 100));
              const hit = done >= target;
              return `
                <div class="goal-row">
                  <div class="flex jb ac" style="margin-bottom:6px">
                    <span style="font-weight:600;font-size:13px">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>
                    <span style="font-size:13px;font-weight:700;color:${hit?'var(--gr)':'var(--ink)'}">${done} / ${target} ${hit?'✓':''}</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" style="width:${pct}%;background:${hit?'var(--gr)':'var(--cb-red)'}"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="split-2">
        <div class="card">
          <div class="card-head"><span class="card-title">Last 30 Days</span></div>
          <div class="card-body">
            ${myRecs.length ? `<div class="chart-wrap"><canvas id="ch-mem-trend"></canvas></div>`
              : emptyState('No records yet', 'This chart will populate as records are logged.', 'chart')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title">By Work Unit — All Time</span></div>
          <div class="card-body">
            ${myRecs.length ? `<div class="chart-wrap"><canvas id="ch-mem-wu"></canvas></div>`
              : emptyState('No records yet', 'This chart will populate as records are logged.', 'chart')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">All Records</span>
          <span class="muted" style="font-size:12px">${myRecs.length} total · showing latest 50</span>
        </div>
        ${myRecs.length ? renderActivityTableSmall(team, [m], myRecs.slice().reverse().slice(0, 50))
          : `<div class="card-body">${emptyState('No records', 'Log work for this member from the Log Work tab.', 'chart')}</div>`}
      </div>
    `;

    main.querySelector('[data-back]').onclick = () => { drillMember = null; render(session); };

    if (myRecs.length) {
      mountTrendChart('ch-mem-trend', myRecs, 30);
      mountWorkUnitChart('ch-mem-wu', team, myRecs);
    }
  }

  // ============================================================
  //  ACTIVITY — full sortable, filterable table + extra charts
  // ============================================================
  function renderActivity(main, session) {
    const team = session.team;
    const members = State.membersOfTeam(team.id);
    const records = State.recordsOfTeam(team.id);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Activity</h2>
          <div class="ph-sub">Full record history for ${escape(team.name)} · ${records.length.toLocaleString()} record${records.length!==1?'s':''}</div>
        </div>
      </div>

      <div class="split-2">
        <div class="card">
          <div class="card-head"><span class="card-title">Records by Member</span></div>
          <div class="card-body">
            ${records.length && members.length ? `<div class="chart-wrap"><canvas id="ch-act-mem"></canvas></div>`
              : emptyState('No data', 'This chart will populate as records are logged.', 'chart')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title">Day of Week Pattern</span></div>
          <div class="card-body">
            ${records.length ? `<div class="chart-wrap"><canvas id="ch-act-dow"></canvas></div>`
              : emptyState('No data', 'This chart will populate as records are logged.', 'chart')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">All Records</span>
          <span class="muted" style="font-size:12px"><span id="act-count">${records.length}</span> shown</span>
        </div>
        <div class="card-body" style="padding-bottom:0">
          <div class="fbar" style="margin-bottom:1rem">
            <div class="fg">
              <label>Search</label>
              <input id="af-search" type="text" placeholder="member, work unit, notes..." value="${escape(activityFilter.search)}">
            </div>
            <div class="fg">
              <label>Member</label>
              <select id="af-member">
                <option value="">All members</option>
                ${members.map(m => `<option value="${escape(m.email)}" ${activityFilter.memberEmail===m.email?'selected':''}>${escape(m.displayName)}</option>`).join('')}
              </select>
            </div>
            <div class="fg">
              <label>Work Unit</label>
              <select id="af-wu">
                <option value="">All work units</option>
                ${team.workUnits.map(id => `<option value="${escape(id)}" ${activityFilter.workUnit===id?'selected':''}>${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</option>`).join('')}
              </select>
            </div>
            <div class="fg">
              <label>From</label>
              <input id="af-from" type="date" value="${escape(activityFilter.dateFrom)}">
            </div>
            <div class="fg">
              <label>To</label>
              <input id="af-to" type="date" value="${escape(activityFilter.dateTo)}">
            </div>
            <button class="btn btn-ghost btn-sm" id="af-clear">Clear</button>
          </div>
        </div>
        <div id="act-table-wrap">${renderActivityTable(team, members, records)}</div>
      </div>
    `;

    const apply = () => {
      activityFilter.search      = document.getElementById('af-search').value;
      activityFilter.memberEmail = document.getElementById('af-member').value;
      activityFilter.workUnit    = document.getElementById('af-wu').value;
      activityFilter.dateFrom    = document.getElementById('af-from').value;
      activityFilter.dateTo      = document.getElementById('af-to').value;
      const filtered = filterRecords(records, members, activityFilter);
      document.getElementById('act-count').textContent = filtered.length;
      document.getElementById('act-table-wrap').innerHTML = renderActivityTable(team, members, filtered);
      bindSortHeaders(team, members, records);
    };
    document.getElementById('af-search').oninput = debounce(apply, 200);
    ['af-member','af-wu','af-from','af-to'].forEach(id => document.getElementById(id).onchange = apply);
    document.getElementById('af-clear').onclick = () => {
      activityFilter = { search:'', memberEmail:'', workUnit:'', dateFrom:'', dateTo:'' };
      renderActivity(main, session);
    };
    bindSortHeaders(team, members, records);

    if (records.length && members.length) mountByMemberChart('ch-act-mem', members, records);
    if (records.length) mountDayOfWeekChart('ch-act-dow', records);
  }

  function bindSortHeaders(team, members, records) {
    document.querySelectorAll('#act-table-wrap [data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        if (activitySort.col === col) activitySort.dir = activitySort.dir === 'asc' ? 'desc' : 'asc';
        else { activitySort.col = col; activitySort.dir = 'desc'; }
        const filtered = filterRecords(records, members, activityFilter);
        document.getElementById('act-table-wrap').innerHTML = renderActivityTable(team, members, filtered);
        bindSortHeaders(team, members, records);
      };
    });
  }

  // ============================================================
  //  LOG WORK
  // ============================================================
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
            ` : `
              <div class="form-row">
                <label class="label">Member</label>
                <input value="${escape(session.user.displayName)} (you)" disabled>
                <div class="helper">No team members yet — record will log against you.</div>
              </div>
            `}
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
      const memberEmail = members.length ? document.getElementById('lw-member').value : session.user.email;
      if (!date || !wu) { Utils.toast('Date and work unit required','bad'); return; }
      const fields = {};
      team.fields.forEach(f => {
        const el = document.getElementById('lw-'+f);
        if (el) fields[f] = (LIBRARY.fieldDef(f)?.type === 'number') ? (parseFloat(el.value)||0) : el.value;
      });
      State.addRecord({ teamId: team.id, memberEmail, date, workUnit: wu, fields });
      Utils.toast('Record logged!','good');
      tab = 'overview';
      render(session);
    };
    document.getElementById('lw-cancel').onclick = () => { tab='overview'; render(session); };
  }

  // ============================================================
  //  SETTINGS
  // ============================================================
  function renderSettings(main, session) {
    const team = session.team;
    const goalsActive = Object.entries(team.goals || {}).filter(([id,v])=>v>0);

    main.innerHTML = `
      <div class="page-header">
        <div><h2>Team Settings</h2><div class="ph-sub">Configure ${escape(team.name)}</div></div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Team Info</span></div>
        <div class="card-body">
          <div class="form-grid-2">
            <div class="form-row">
              <label class="label">Team name</label>
              <input id="ts-name" value="${escape(team.name)}">
            </div>
            <div class="form-row">
              <label class="label">Department</label>
              <input id="ts-dept" value="${escape(team.department||'')}">
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="ts-save">Save</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Work Units</span>
          <span class="muted" style="font-size:12px">${team.workUnits.length} configured</span>
        </div>
        <div class="card-body" style="display:flex;flex-wrap:wrap;gap:6px">
          ${team.workUnits.length
            ? team.workUnits.map(id => `<span class="pill pill-r">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>`).join('')
            : '<span class="muted">None</span>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Tracked Fields</span>
          <span class="muted" style="font-size:12px">${team.fields.length} configured</span>
        </div>
        <div class="card-body" style="display:flex;flex-wrap:wrap;gap:6px">
          ${team.fields.length
            ? team.fields.map(f => {
                const def = LIBRARY.fieldDef(f);
                return `<span class="pill pill-b">${def ? escape(def.label) : escape(f)}</span>`;
              }).join('')
            : '<span class="muted">None</span>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Daily Goals</span>
          <span class="muted" style="font-size:12px">per person</span>
        </div>
        <div class="card-body">
          ${goalsActive.length
            ? goalsActive.map(([id,v]) => `
                <div class="flex jb ac" style="padding:10px 0;border-bottom:1px solid var(--bor)">
                  <span style="font-weight:600">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>
                  <strong>${v}/day</strong>
                </div>
              `).join('')
            : `<span class="muted">No goals set yet — re-run the wizard or edit the team to add them.</span>`}
        </div>
      </div>
    `;
    document.getElementById('ts-save').onclick = () => {
      const newName = document.getElementById('ts-name').value.trim();
      const newDept = document.getElementById('ts-dept').value.trim();
      if (!newName) { Utils.toast('Team name required', 'bad'); return; }
      const t = State.teamById(team.id);
      Object.assign(t, { name: newName, department: newDept });
      State.save();
      Utils.toast('Saved','good');
      Utils.refresh();
    };
  }

  // ============================================================
  //  CHART BUILDERS
  // ============================================================
  function chartColors() {
    return {
      red:    getCss('--cb-red')    || '#e63946',
      redDk:  getCss('--cb-red-dk') || '#c92836',
      gold:   getCss('--cb-gold')   || '#f5a623',
      blue:   getCss('--bl')        || '#2563eb',
      green:  getCss('--gr')        || '#10b981',
      purple: getCss('--pu')        || '#7c3aed',
      orange: getCss('--cb-orange') || '#ff6b3d',
      ink:    getCss('--ink')       || '#0b1220',
      i2:     getCss('--i2')        || '#4a5568',
      i3:     getCss('--i3')        || '#8a94a6',
      bor:    getCss('--bor')       || '#e0e6ef',
    };
  }
  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function paletteCycle() {
    const c = chartColors();
    return [c.red, c.blue, c.gold, c.green, c.purple, c.orange, c.redDk, c.i2];
  }
  function commonChartOpts() {
    const c = chartColors();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.ink, titleColor: '#fff', bodyColor: '#fff',
          padding: 10, cornerRadius: 8, displayColors: false,
          titleFont: { family: getCss('--font-display') || 'Sora', weight: '700' },
          bodyFont:  { family: getCss('--font-body')    || 'Inter' },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.i2, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: c.bor }, ticks: { color: c.i2, font: { size: 11 }, precision: 0 } },
      },
    };
  }

  function mountTrendChart(canvasId, records, days = 30) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;
    const c = chartColors();

    const labels = [];
    const data = [];
    const today = new Date(Utils.todayISO() + 'T00:00:00');
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      data.push(records.filter(r => r.date === iso).length);
    }

    _charts[canvasId] = new Chart(cv, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: c.red,
          backgroundColor: hexToRgba(c.red, 0.12),
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: c.red,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        }],
      },
      options: commonChartOpts(),
    });
  }

  function mountWorkUnitChart(canvasId, team, records) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;

    const counts = {};
    records.forEach(r => { counts[r.workUnit] = (counts[r.workUnit] || 0) + 1; });
    const entries = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    const labels = entries.map(([id]) => LIBRARY.workUnitLabel(id, team.workUnitLabels));
    const data   = entries.map(([,n]) => n);
    const palette = paletteCycle();
    const bg = data.map((_, i) => palette[i % palette.length]);

    _charts[canvasId] = new Chart(cv, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: 6, maxBarThickness: 38 }] },
      options: { ...commonChartOpts(), indexAxis: 'y' },
    });
  }

  function mountByMemberChart(canvasId, members, records) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;

    const counts = members.map(m => ({
      name: m.displayName,
      n: records.filter(r => r.memberEmail.toLowerCase() === m.email.toLowerCase()).length,
    })).sort((a,b) => b.n - a.n);

    const labels = counts.map(x => x.name);
    const data   = counts.map(x => x.n);
    const palette = paletteCycle();
    const bg = data.map((_, i) => palette[i % palette.length]);

    _charts[canvasId] = new Chart(cv, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: 6, maxBarThickness: 38 }] },
      options: { ...commonChartOpts(), indexAxis: 'y' },
    });
  }

  function mountDayOfWeekChart(canvasId, records) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;
    const c = chartColors();

    const counts = [0,0,0,0,0,0,0]; // Sun..Sat
    records.forEach(r => {
      const [y, mo, d] = r.date.split('-').map(Number);
      const dt = new Date(y, mo - 1, d);
      counts[dt.getDay()]++;
    });
    // reorder Mon-first
    const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const data   = [counts[1], counts[2], counts[3], counts[4], counts[5], counts[6], counts[0]];

    _charts[canvasId] = new Chart(cv, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: c.red, borderRadius: 6, maxBarThickness: 38 }] },
      options: commonChartOpts(),
    });
  }

  // ============================================================
  //  LEADERBOARDS
  // ============================================================
  function buildTopByTotal(members, records) {
    const rows = members.map(m => {
      const n = records.filter(r => r.memberEmail.toLowerCase() === m.email.toLowerCase()).length;
      return { email: m.email, name: m.displayName, value: n, display: n.toLocaleString() };
    }).sort((a,b) => b.value - a.value).slice(0, 5);
    const max = Math.max(1, ...rows.map(r => r.value));
    rows.forEach(r => r.pct = Math.round((r.value / max) * 100));
    return rows;
  }

  function buildGoalHitRate(team, members, allRecords) {
    const goals = Object.entries(team.goals || {}).filter(([id,v]) => v > 0);
    if (!goals.length || !members.length) return [];

    const today = Utils.todayISO();
    const days = [];
    const end = new Date(today + 'T00:00:00');
    for (let i = 13; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    const rows = members.map(m => {
      let hits = 0, total = 0;
      const myRecs = allRecords.filter(r => r.memberEmail.toLowerCase() === m.email.toLowerCase());
      days.forEach(d => {
        goals.forEach(([id, target]) => {
          total++;
          const done = myRecs.filter(r => r.date === d && r.workUnit === id).length;
          if (done >= target) hits++;
        });
      });
      const pct = total ? Math.round((hits / total) * 100) : 0;
      return { email: m.email, name: m.displayName, value: pct, display: pct + '%', pct };
    }).sort((a,b) => b.value - a.value).slice(0, 5);
    return rows;
  }

  function renderLeaderboard(rows, mode) {
    if (!rows.length) {
      return `<div class="card-body">${emptyState('No data', 'Nothing to rank yet.', 'crown')}</div>`;
    }
    return `
      <div class="card-body" style="padding-top:8px;padding-bottom:8px">
        ${rows.map((r, i) => {
          const valColor = mode === 'pct'
            ? (r.value >= 80 ? 'var(--gr)' : r.value >= 50 ? 'var(--am)' : 'var(--cb-red)')
            : 'var(--ink)';
          const barColor = i === 0 ? 'var(--cb-red)' : i === 1 ? 'var(--cb-gold)' : 'var(--bl)';
          return `
            <div class="lb-row">
              <div class="lb-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div>
              <div class="avatar avatar-sm">${Utils.initials(r.name)}</div>
              <div class="lb-name">${escape(r.name)}</div>
              <div class="lb-bar"><div class="lb-bar-fill" style="width:${r.pct}%;background:${barColor}"></div></div>
              <div class="lb-val" style="color:${valColor}">${r.display}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ============================================================
  //  ACTIVITY TABLE
  // ============================================================
  function renderActivityTableSmall(team, members, records) {
    if (!records.length) {
      return `<div class="card-body">${emptyState('No records yet', 'Records will show up here as they are logged.', 'chart')}</div>`;
    }
    const showAmount  = team.fields.includes('amount');
    const showOutcome = team.fields.includes('outcome');
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Member</th><th>Work Unit</th>
            ${showAmount?'<th>Amount</th>':''}
            ${showOutcome?'<th>Outcome</th>':''}
          </tr></thead>
          <tbody>
            ${records.map(r => {
              const m = members.find(x => x.email.toLowerCase() === r.memberEmail.toLowerCase())
                    || State.findUserByEmail(r.memberEmail)?.user;
              return `<tr>
                <td>${r.date}</td>
                <td><strong>${m ? escape(m.displayName) : escape(r.memberEmail)}</strong></td>
                <td>${escape(LIBRARY.workUnitLabel(r.workUnit, team.workUnitLabels))}</td>
                ${showAmount?`<td>${Utils.fmt$(r.fields?.amount||0)}</td>`:''}
                ${showOutcome?`<td>${r.fields?.outcome?`<span class="pill ${r.fields.outcome==='Win'?'pill-g':r.fields.outcome==='Loss'?'pill-r':'pill-a'}">${escape(r.fields.outcome)}</span>`:'<span class="muted">—</span>'}</td>`:''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderActivityTable(team, members, records) {
    if (!records.length) {
      return emptyState('No records match', 'Try clearing some filters.', 'search');
    }
    const sorted = sortRecords(records, members, activitySort);
    const showAmount  = team.fields.includes('amount');
    const showOutcome = team.fields.includes('outcome');
    const arrow = (col) => activitySort.col === col
      ? (activitySort.dir === 'asc' ? ' ↑' : ' ↓')
      : '';
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th data-sort="date" class="sortable">Date${arrow('date')}</th>
            <th data-sort="member" class="sortable">Member${arrow('member')}</th>
            <th data-sort="workUnit" class="sortable">Work Unit${arrow('workUnit')}</th>
            ${showAmount?`<th data-sort="amount" class="sortable">Amount${arrow('amount')}</th>`:''}
            ${showOutcome?'<th>Outcome</th>':''}
          </tr></thead>
          <tbody>
            ${sorted.slice(0, 200).map(r => {
              const m = members.find(x => x.email.toLowerCase() === r.memberEmail.toLowerCase())
                    || State.findUserByEmail(r.memberEmail)?.user;
              return `<tr>
                <td>${r.date}</td>
                <td><strong>${m ? escape(m.displayName) : escape(r.memberEmail)}</strong></td>
                <td>${escape(LIBRARY.workUnitLabel(r.workUnit, team.workUnitLabels))}</td>
                ${showAmount?`<td>${Utils.fmt$(r.fields?.amount||0)}</td>`:''}
                ${showOutcome?`<td>${r.fields?.outcome?`<span class="pill ${r.fields.outcome==='Win'?'pill-g':r.fields.outcome==='Loss'?'pill-r':'pill-a'}">${escape(r.fields.outcome)}</span>`:'<span class="muted">—</span>'}</td>`:''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${sorted.length > 200 ? `<div class="muted" style="text-align:center;padding:12px;font-size:12px">Showing first 200 of ${sorted.length}. Refine filters to narrow.</div>` : ''}
    `;
  }

  function filterRecords(records, members, f) {
    const q = (f.search || '').trim().toLowerCase();
    return records.filter(r => {
      if (f.memberEmail && r.memberEmail.toLowerCase() !== f.memberEmail.toLowerCase()) return false;
      if (f.workUnit && r.workUnit !== f.workUnit) return false;
      if (f.dateFrom && r.date < f.dateFrom) return false;
      if (f.dateTo   && r.date > f.dateTo)   return false;
      if (q) {
        const m = members.find(x => x.email.toLowerCase() === r.memberEmail.toLowerCase());
        const hay = [
          m ? m.displayName : '',
          r.memberEmail,
          r.workUnit,
          ...Object.values(r.fields || {}).map(v => String(v)),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function sortRecords(records, members, s) {
    const col = s.col, dir = s.dir === 'asc' ? 1 : -1;
    const memberName = (email) => {
      const m = members.find(x => x.email.toLowerCase() === email.toLowerCase());
      return m ? m.displayName.toLowerCase() : email.toLowerCase();
    };
    return records.slice().sort((a,b) => {
      let av, bv;
      switch (col) {
        case 'member':   av = memberName(a.memberEmail); bv = memberName(b.memberEmail); break;
        case 'workUnit': av = a.workUnit; bv = b.workUnit; break;
        case 'amount':   av = Number(a.fields?.amount || 0); bv = Number(b.fields?.amount || 0); break;
        case 'date':
        default:         av = a.date; bv = b.date; break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
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
      el.onclick = () => { tab = el.dataset.go; drillMember = null; render(session); };
    });
  }

  // Mon-start week — see TZ NOTE at top of file
  function startOfWeekISO(isoDate) {
    const [y, mo, d] = isoDate.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    const day = dt.getDay(); // 0 = Sun
    const diff = (day === 0 ? -6 : 1 - day);
    dt.setDate(dt.getDate() + diff);
    return dt.toISOString().slice(0, 10);
  }

  function hexToRgba(hex, alpha) {
    const m = String(hex || '').replace('#','').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) return `rgba(230,57,70,${alpha})`;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c+c).join('');
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
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
