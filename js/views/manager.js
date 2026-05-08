/* ============================================================
 *  views/manager.js — Manager dashboard (Phase 3)
 * ============================================================
 *  Tabs: Overview · Approvals · Team · Activity · Log Work · Settings
 *
 *  Responsibility: rendering + tab routing only. Business logic
 *  lives in Analytics, chart construction in Charts, persistence
 *  in State, config in CONFIG.
 *
 *  Phase 3 additions:
 *    - CSV / TSV bulk import (Activity tab)
 *    - Edit & delete records (icon buttons in activity table)
 *    - Stable behavior when CONFIG flags toggle features off
 *
 *  TZ NOTE for devs: "today" / "this week" / "this month" all use
 *  the user's local timezone via Utils.todayISO(). Real backend
 *  needs an explicit company-level TZ setting. Week start comes
 *  from CONFIG.WEEK_START. See SPEC.md.
 * ============================================================ */

const ManagerView = (() => {

  let tab = 'dashboard';
  let drillMember = null;
  let activitySort = { col: 'date', dir: 'desc' };
  let activityFilter = { search: '', memberEmail: '', workUnit: '', dateFrom: '', dateTo: '' };

  // ----- main entry -----------------------------------------
  function render(session) {
    Charts.destroyAll();
    const main = document.getElementById('app-main');
    const tabsEl = document.getElementById('app-tabs');
    const team = session.team;
    const inboxUnread = Inbox.unreadCountForUser(session);

    // Phase 6 IA per Mia's sketch:
    //   Dashboard | Stats | Teams & Goals | Import | History | Users | Messages | Settings
    // - Dashboard, Import, History are stubs (real impl Phase 6 part 2)
    // - Stats reuses renderOverview (existing manager metrics)
    // - Teams & Goals reuses renderTeam (team config + goals overview)
    // - Import wraps renderLog (single-record) + the existing bulk-CSV modal
    // - Users reuses renderTeam's roster section (team members)
    // - Messages = inbox
    // - Settings = renderSettings
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

    if      (tab === 'dashboard') renderDashboardStub(main, session);
    else if (tab === 'stats')     renderOverview(main, session);
    else if (tab === 'teams')     renderTeam(main, session);
    else if (tab === 'import')    renderImport(main, session);
    else if (tab === 'history')   renderActivity(main, session);
    else if (tab === 'users')     renderTeam(main, session);
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
  function renderDashboardStub(main, session) {
    const team = session.team;
    const firstName = (session.user.displayName || '').split(/\s+/)[0] || 'there';

    // Phase 6 part 4: Empty-state CTA when team has no work units.
    // This is the manager's first-time experience after admin creates
    // their team but before configuration. Without this, the Dashboard
    // shows an unhelpful "coming soon" stub even though there's a real
    // setup path one click away.
    const isUnconfigured = !team.workUnits || team.workUnits.length === 0;

    if (isUnconfigured) {
      main.innerHTML = `
        <div class="page-header">
          <div>
            <h2>Dashboard</h2>
            <div class="ph-sub">Your team at a glance</div>
          </div>
        </div>
        <div class="empty-stub">
          ${Utils.icon('flag', 48)}
          <h3>Welcome, ${escape(firstName)}!</h3>
          <p>Your team <strong>${escape(team.name)}</strong> isn't set up yet. Configure work units, fields, roles, and goals so your team can start tracking work.</p>
          <p class="empty-stub-hint" style="margin-top:1.5rem;border-top:none;padding-top:0">
            <button class="btn btn-primary" id="ds-wizard-launch">${Utils.icon('shieldStar',14)} Run Setup Wizard</button>
          </p>
        </div>
      `;
      document.getElementById('ds-wizard-launch').onclick = () => {
        WizardSettings.open({
          mode: 'manager',
          teamId: team.id,
          onClose: (savedId) => { if (savedId) render(session); }
        });
      };
      return;
    }

    // Configured team but real Dashboard not built yet — show the
    // existing Phase 6 stub.
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Dashboard</h2>
          <div class="ph-sub">Your team at a glance</div>
        </div>
      </div>
      <div class="empty-stub">
        ${Utils.icon('dashboard', 48)}
        <h3>Dashboard coming in Phase 6</h3>
        <p>This will roll up your team's productivity into a single Intelihub-style overview — top metrics, leaderboards, goal progress, with optional filtering by team member.</p>
        <p class="empty-stub-hint">For now, the <strong>Stats</strong> tab shows the existing team overview.</p>
      </div>
    `;
  }

  // Phase 6 part 4: Import tab is now a real two-section page.
  //   1. Single-record form (the existing log-work flow)
  //   2. Bulk CSV import (rendered inline, no modal)
  function renderImport(main, session) {
    const team = session.team;
    const members = State.membersOfTeam(team.id);

    // Page header + section 1 (single record) + section 2 (bulk CSV)
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Import</h2>
          <div class="ph-sub">Log a record or bulk-import from CSV</div>
        </div>
      </div>

      <div class="card form-narrow">
        <div class="card-head">
          <span class="card-title">Log a Single Record</span>
          <span class="muted text-xs">For one record at a time</span>
        </div>
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
            <select id="lw-wu">${team.workUnits.length
              ? team.workUnits.map(id => `<option value="${escape(id)}">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</option>`).join('')
              : '<option value="">No work units configured</option>'}</select>
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
            <button class="btn btn-primary" id="lw-submit" ${team.workUnits.length===0?'disabled':''}>${Utils.icon('check',14)} Log Record</button>
          </div>
        </div>
      </div>

      <div id="bulk-import-host"></div>
    `;

    // Single-record submit handler
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
      render(session); // re-render the import page so form clears
    };

    // Inline bulk CSV import (only if team has work units configured —
    // otherwise the parser has nothing to validate against)
    if (CONFIG.FEATURES.csvImport && team.workUnits.length > 0) {
      CSVImport.renderInline(
        document.getElementById('bulk-import-host'),
        team, session,
        { onCommit: () => render(session) }
      );
    } else if (team.workUnits.length === 0) {
      document.getElementById('bulk-import-host').innerHTML = `
        <div class="notice warn">
          <strong>Bulk import unavailable:</strong> configure work units first
          (Settings → Run Setup Wizard).
        </div>
      `;
    }
  }

  // ============================================================
  //  OVERVIEW
  // ============================================================
  function renderOverview(main, session) {
    const team = session.team;
    const records = State.recordsOfTeam(team.id);
    const members = State.membersOfTeam(team.id);
    const today = Utils.todayISO();
    const periods = Analytics.periodCounts(records, today);
    const monthPfx = today.slice(0, 7);
    const todayRecs = records.filter(r => r.date === today);
    const monthRecs = records.filter(r => r.date.startsWith(monthPfx));
    const goalsActive = Analytics.activeGoals(team);
    const pendingCount = State.pendingForUser(session).length;

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>${escape(team.name)}</h2>
          <div class="ph-sub">${escape(team.department || 'Team')} · ${members.length} member${members.length!==1?'s':''} · Welcome back, ${escape(session.user.displayName.split(' ')[0])}</div>
        </div>
        <div class="flex gap-8">
          ${pendingCount ? `<button class="btn btn-ghost" data-go="inbox">${Utils.icon('bell',14)} ${pendingCount} pending</button>` : ''}
          <button class="btn btn-primary" data-go="log">${Utils.icon('plus',14)} Log Work</button>
        </div>
      </div>

      <div class="metric-grid">
        ${metric('Today',      periods.today,                 'records logged today',  'r')}
        ${metric('This Week',  periods.thisWeek,              'week-to-date',          'b')}
        ${metric('This Month', periods.thisMonth,             'month-to-date',         'g')}
        ${metric('All Time',   periods.allTime.toLocaleString(), 'total records',      'a')}
      </div>

      ${goalsActive.length ? renderTeamGoalsCard(team, members, todayRecs, goalsActive) : ''}

      <div class="split-2">
        <div class="card">
          <div class="card-head">
            <span class="card-title">Records — Last ${CONFIG.TREND_CHART_DAYS} Days</span>
            <span class="muted text-xs">daily activity</span>
          </div>
          <div class="card-body">
            ${records.length ? `<div class="chart-wrap"><canvas id="ch-trend"></canvas></div>`
              : emptyState('No data yet', 'Log records to see the trend.', 'chart')}
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <span class="card-title">By Work Unit — This Month</span>
            <span class="muted text-xs">${monthRecs.length} record${monthRecs.length!==1?'s':''}</span>
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
            <span class="muted text-xs">this month</span>
          </div>
          ${members.length && monthRecs.length
            ? renderLeaderboard(Analytics.buildTopByTotal(members, monthRecs), 'records')
            : `<div class="card-body">${emptyState('Nothing yet', members.length ? 'No records this month yet.' : 'Add team members first.', 'crown')}</div>`}
        </div>

        <div class="card">
          <div class="card-head">
            <span class="card-title">${Utils.icon('check',14)} Goal Hit Rate</span>
            <span class="muted text-xs">last ${CONFIG.GOAL_HIT_RATE_DAYS} days</span>
          </div>
          ${members.length && goalsActive.length
            ? renderLeaderboard(Analytics.buildGoalHitRate(team, members, records), 'pct')
            : `<div class="card-body">${emptyState('No goals to track', goalsActive.length ? 'Add team members to track goal hit rates.' : 'Set daily goals in Settings to track hit rates.', 'check')}</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Recent Activity</span>
          <button class="btn btn-ghost btn-sm" data-go="activity">View all ${Utils.icon('arrow', 12)}</button>
        </div>
        ${renderActivityTable(team, members, records.slice(-CONFIG.RECENT_ACTIVITY_SIZE).reverse(), { compact: true })}
      </div>
    `;

    bindLinks(main, session);
    bindRowActions(main, session);

    if (records.length)   Charts.trend('ch-trend', records);
    if (monthRecs.length) Charts.byWorkUnit('ch-wu', team, monthRecs);
  }

  // Today's Team Goals card
  function renderTeamGoalsCard(team, members, todayRecs, goalsActive) {
    return `
      <div class="card">
        <div class="card-head">
          <span class="card-title">Today's Team Goals</span>
          <span class="muted text-xs">${todayRecs.length} record${todayRecs.length!==1?'s':''} · ${members.length} member${members.length!==1?'s':''}</span>
        </div>
        <div class="card-body">
          ${goalsActive.map(([id, perPersonTarget]) => {
            const teamTarget = perPersonTarget * Math.max(members.length, 1);
            const done = todayRecs.filter(r => r.workUnit === id).length;
            const pct = Math.min(100, Math.round((done / Math.max(teamTarget, 1)) * 100));
            const hit = done >= teamTarget;
            return `
              <div class="goal-row">
                <div class="flex jb ac mb-6">
                  <div>
                    <span class="goal-label">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>
                    <span class="muted text-xs ml-6">${perPersonTarget}/day per person</span>
                  </div>
                  <span class="goal-val ${hit?'goal-val-hit':''}">${done} / ${teamTarget} ${hit ? '✓' : ''}</span>
                </div>
                <div class="bar-track"><div class="bar-fill ${hit?'bar-fill-hit':''}" style="width:${pct}%"></div></div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
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
          <div class="card-head"><span class="card-title">Pending Requests · ${pending.length}</span></div>
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
              <td><strong>${escape(p.displayName)}</strong><div class="muted text-xs">${escape(p.email)}</div></td>
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
      ` : `<div class="card">${emptyState('No members yet', 'Members can request to join your team from the home page. Their requests will show in the Inbox tab.', 'users')}</div>`}
    `;

    main.querySelectorAll('[data-drill]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-rm]')) return;
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
    const today = Utils.todayISO();
    const monthPfx = today.slice(0, 7);
    const myRecs = allRecords.filter(r => r.memberEmail.toLowerCase() === m.email.toLowerCase());
    const monthRecs = myRecs.filter(r => r.date.startsWith(monthPfx));
    const todayRecs = myRecs.filter(r => r.date === today);
    const todayHit = Analytics.memberGoalHitPctForDate(team, m, allRecords, today);

    const hitColor = todayHit==null ? 'var(--i3)'
      : todayHit>=100 ? 'var(--gr)'
      : todayHit>=50  ? 'var(--am)'
      : 'var(--cb-red)';

    return `
      <div class="member-card" data-drill="${escape(m.email)}">
        <div class="mc-head">
          <div class="avatar avatar-lg">${Utils.initials(m.displayName)}</div>
          <div class="mc-id">
            <div class="mc-name">${escape(m.displayName)}</div>
            <div class="mc-sub">${m.role ? `<span class="pill pill-r pill-xs">${escape(m.role)}</span>` : '<span class="muted">No role</span>'}</div>
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
            <div class="mc-stat-val" style="color:${hitColor}">${todayHit==null?'—':todayHit+'%'}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMemberDetail(main, session, m, allRecords) {
    const team = session.team;
    const myRecs = allRecords.filter(r => r.memberEmail.toLowerCase() === m.email.toLowerCase());
    const today = Utils.todayISO();
    const periods = Analytics.periodCounts(myRecs, today);
    const todayRecs = myRecs.filter(r => r.date === today);
    const goalsActive = Analytics.activeGoals(team);

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
        ${metric('Today',      periods.today,     'logged today',  'r')}
        ${metric('This Week',  periods.thisWeek,  'week-to-date',  'b')}
        ${metric('This Month', periods.thisMonth, 'month-to-date', 'g')}
        ${metric('All Time',   periods.allTime.toLocaleString(), 'total records', 'a')}
      </div>

      ${goalsActive.length ? `
        <div class="card">
          <div class="card-head"><span class="card-title">Today's Goal Progress</span></div>
          <div class="card-body">
            ${goalsActive.map(([id, target]) => {
              const done = todayRecs.filter(r => r.workUnit === id).length;
              const pct = Math.min(100, Math.round((done / Math.max(target, 1)) * 100));
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
          <span class="muted text-xs">${myRecs.length} total · showing latest ${CONFIG.MEMBER_DETAIL_HISTORY}</span>
        </div>
        ${myRecs.length ? renderActivityTable(team, [m], myRecs.slice().reverse().slice(0, CONFIG.MEMBER_DETAIL_HISTORY), { showActions: true })
          : `<div class="card-body">${emptyState('No records', 'Log work for this member from the Log Work tab.', 'chart')}</div>`}
      </div>
    `;

    main.querySelector('[data-back]').onclick = () => { drillMember = null; render(session); };
    bindRowActions(main, session);

    if (myRecs.length) {
      Charts.trend('ch-mem-trend', myRecs);
      Charts.byWorkUnit('ch-mem-wu', team, myRecs);
    }
  }

  // ============================================================
  //  ACTIVITY — sortable, filterable table + extra charts + CSV
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
        <div class="flex gap-8">
          ${CONFIG.FEATURES.csvImport ? `<button class="btn btn-ghost" id="act-import">${Utils.icon('upload',14)} Bulk Import</button>` : ''}
          <button class="btn btn-primary" data-go="log">${Utils.icon('plus',14)} Log Work</button>
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
          <span class="muted text-xs"><span id="act-count">${records.length}</span> shown</span>
        </div>
        <div class="card-body py-0">
          <div class="fbar mb-2">
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
        <div id="act-table-wrap">${renderActivityTable(team, members, records, { sortable: true, showActions: true })}</div>
      </div>
    `;

    const apply = () => {
      activityFilter.search      = document.getElementById('af-search').value;
      activityFilter.memberEmail = document.getElementById('af-member').value;
      activityFilter.workUnit    = document.getElementById('af-wu').value;
      activityFilter.dateFrom    = document.getElementById('af-from').value;
      activityFilter.dateTo      = document.getElementById('af-to').value;
      const filtered = Analytics.filterRecords(records, members, activityFilter);
      document.getElementById('act-count').textContent = filtered.length;
      document.getElementById('act-table-wrap').innerHTML = renderActivityTable(team, members, filtered, { sortable: true, showActions: true });
      bindSortHeaders(team, members, records);
      bindRowActions(main, session);
    };
    document.getElementById('af-search').oninput = debounce(apply, CONFIG.DEBOUNCE_MS_INPUT);
    ['af-member','af-wu','af-from','af-to'].forEach(id => document.getElementById(id).onchange = apply);
    document.getElementById('af-clear').onclick = () => {
      activityFilter = { search:'', memberEmail:'', workUnit:'', dateFrom:'', dateTo:'' };
      renderActivity(main, session);
    };
    bindLinks(main, session);
    bindSortHeaders(team, members, records);
    bindRowActions(main, session);

    if (CONFIG.FEATURES.csvImport) {
      document.getElementById('act-import').onclick = () => openImportModal(session);
    }

    if (records.length && members.length) Charts.byMember('ch-act-mem', members, records);
    if (records.length) Charts.dayOfWeek('ch-act-dow', records);
  }

  function bindSortHeaders(team, members, records) {
    document.querySelectorAll('#act-table-wrap [data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        if (activitySort.col === col) activitySort.dir = activitySort.dir === 'asc' ? 'desc' : 'asc';
        else { activitySort.col = col; activitySort.dir = 'desc'; }
        const filtered = Analytics.filterRecords(records, members, activityFilter);
        document.getElementById('act-table-wrap').innerHTML = renderActivityTable(team, members, filtered, { sortable: true, showActions: true });
        bindSortHeaders(team, members, records);
        bindRowActions(document.getElementById('app-main'), { team }); // session shape ok for action-binding lookups
      };
    });
  }

  // ============================================================
  //  CSV IMPORT MODAL
  // ============================================================
  function openImportModal(session) {
    const team = session.team;
    const template = CSVImport.templateFor(team);
    Utils.openModal(`
      <h3>Bulk Import Records</h3>
      <p class="helper mb-2">
        Paste rows from Excel, Google Sheets, or any CSV. First row must be headers.
        Required columns: <strong>${CONFIG.CSV_REQUIRED_COLUMNS.join(', ')}</strong>.
      </p>
      <details class="helper mb-2" style="cursor:pointer">
        <summary><strong>Show template &amp; tips</strong></summary>
        <pre class="csv-template">${escape(template)}</pre>
        <ul style="margin:8px 0 0 18px;font-size:12px;color:var(--i2)">
          <li><strong>date</strong> — YYYY-MM-DD or M/D/YYYY</li>
          <li><strong>member</strong> — display name OR email of someone on this team</li>
          <li><strong>workUnit</strong> — id (e.g. chargeback_case) or label (e.g. Chargeback Case)</li>
          <li>Other columns matched against your team's tracked fields (case-insensitive).</li>
        </ul>
      </details>
      <textarea id="csv-text" rows="8" placeholder="Paste CSV/TSV here..." class="mono text-xs"></textarea>
      <div id="csv-result" class="mt-2"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" id="csv-cancel">Cancel</button>
        <button class="btn btn-ghost btn-sm" id="csv-validate">Validate</button>
        <button class="btn btn-primary btn-sm" id="csv-commit" disabled>Import 0 rows</button>
      </div>
    `);

    let parsed = { rows: [], errors: [], warnings: [] };

    const validate = () => {
      const text = document.getElementById('csv-text').value;
      parsed = CSVImport.parse(text, team);
      const result = document.getElementById('csv-result');
      const commitBtn = document.getElementById('csv-commit');
      commitBtn.disabled = parsed.rows.length === 0;
      commitBtn.textContent = `Import ${parsed.rows.length} row${parsed.rows.length!==1?'s':''}`;

      const parts = [];
      if (parsed.rows.length) {
        parts.push(`<div class="notice success"><strong>${parsed.rows.length}</strong> valid row${parsed.rows.length!==1?'s':''} ready to import.</div>`);
      }
      if (parsed.errors.length) {
        parts.push(`<div class="notice danger"><strong>${parsed.errors.length} error${parsed.errors.length!==1?'s':''}:</strong><ul class="csv-issue-list">${parsed.errors.slice(0,10).map(e=>`<li>${escape(e)}</li>`).join('')}${parsed.errors.length>10?`<li>... and ${parsed.errors.length-10} more</li>`:''}</ul></div>`);
      }
      if (parsed.warnings.length) {
        parts.push(`<div class="notice warn"><strong>${parsed.warnings.length} warning${parsed.warnings.length!==1?'s':''}:</strong><ul class="csv-issue-list">${parsed.warnings.slice(0,10).map(e=>`<li>${escape(e)}</li>`).join('')}${parsed.warnings.length>10?`<li>... and ${parsed.warnings.length-10} more</li>`:''}</ul></div>`);
      }
      result.innerHTML = parts.join('');
    };

    document.getElementById('csv-text').oninput = debounce(validate, CONFIG.DEBOUNCE_MS_INPUT);
    document.getElementById('csv-validate').onclick = validate;
    document.getElementById('csv-cancel').onclick = () => Utils.closeModal();
    document.getElementById('csv-commit').onclick = () => {
      if (!parsed.rows.length) return;
      const n = CSVImport.commit(parsed.rows);
      Utils.closeModal();
      Utils.toast(`Imported ${n} record${n!==1?'s':''}`, 'good');
      render(session);
    };
  }

  // ============================================================
  //  EDIT / DELETE RECORD MODALS (called from row actions)
  // ============================================================
  function openEditModal(session, recordId) {
    const team = session.team;
    const rec = State.get().records.find(r => r.id === recordId);
    if (!rec) { Utils.toast('Record not found', 'bad'); return; }
    const members = State.membersOfTeam(team.id);

    Utils.openModal(`
      <h3>Edit Record</h3>
      <div class="form-grid-2">
        <div class="form-row">
          <label class="label">Date</label>
          <input type="date" id="ed-date" value="${escape(rec.date)}">
        </div>
        <div class="form-row">
          <label class="label">Member</label>
          <select id="ed-member">
            ${members.map(m => `<option value="${escape(m.email)}" ${m.email.toLowerCase()===rec.memberEmail.toLowerCase()?'selected':''}>${escape(m.displayName)}</option>`).join('')}
          </select>
        </div>
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
      const memberEmail = document.getElementById('ed-member').value;
      if (!date || !wu) { Utils.toast('Date and work unit required','bad'); return; }
      const fields = {};
      team.fields.forEach(f => {
        const el = document.getElementById('ed-'+f);
        if (el) fields[f] = (LIBRARY.fieldDef(f)?.type === 'number') ? (parseFloat(el.value)||0) : el.value;
      });
      State.updateRecord(recordId, { date, workUnit: wu, memberEmail, fields });
      Utils.closeModal();
      Utils.toast('Saved', 'good');
      render(session);
    };
  }

  function deleteRecord(session, recordId) {
    if (!CONFIG.FEATURES.deleteRecords) {
      Utils.toast('Delete is disabled', 'warn');
      return;
    }
    if (!Utils.confirm('Delete this record? This cannot be undone.')) return;
    State.deleteRecord(recordId);
    Utils.toast('Deleted', 'good');
    render(session);
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
      <div class="card form-narrow">
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
    const goalsActive = Analytics.activeGoals(team);

    main.innerHTML = `
      <div class="page-header">
        <div><h2>Team Settings</h2><div class="ph-sub">Configure ${escape(team.name)}</div></div>
        <button class="btn btn-primary btn-sm" id="ts-wizard-launch">${Utils.icon('shieldStar',12)} ${team.workUnits.length ? 'Re-run Setup Wizard' : 'Run Setup Wizard'}</button>
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
          <span class="muted text-xs">${team.workUnits.length} configured</span>
        </div>
        <div class="card-body pill-list">
          ${team.workUnits.length
            ? team.workUnits.map(id => `<span class="pill pill-r">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>`).join('')
            : '<span class="muted">None</span>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Tracked Fields</span>
          <span class="muted text-xs">${team.fields.length} configured</span>
        </div>
        <div class="card-body pill-list">
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
          <span class="muted text-xs">per person</span>
        </div>
        <div class="card-body">
          ${goalsActive.length
            ? goalsActive.map(([id,v]) => `
                <div class="kv-row">
                  <span class="kv-label">${escape(LIBRARY.workUnitLabel(id, team.workUnitLabels))}</span>
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
      if (newName.length < CONFIG.TEAM_NAME_MIN_LENGTH) { Utils.toast(`Team name must be at least ${CONFIG.TEAM_NAME_MIN_LENGTH} characters`, 'bad'); return; }
      if (newName.length > CONFIG.TEAM_NAME_MAX_LENGTH) { Utils.toast(`Team name must be ${CONFIG.TEAM_NAME_MAX_LENGTH} characters or fewer`, 'bad'); return; }
      const t = State.teamById(team.id);
      Object.assign(t, { name: newName, department: newDept });
      State.save();
      Utils.toast('Saved','good');
      Utils.refresh();
    };
    document.getElementById('ts-wizard-launch').onclick = () => {
      WizardSettings.open({
        mode: 'manager',
        teamId: team.id,
        onClose: (savedId) => { if (savedId) Utils.refresh(); }
      });
    };
  }

  // ============================================================
  //  SHARED RENDERERS
  // ============================================================
  function renderLeaderboard(rows, mode) {
    if (!rows.length) {
      return `<div class="card-body">${emptyState('No data', 'Nothing to rank yet.', 'crown')}</div>`;
    }
    return `
      <div class="card-body lb-body">
        ${rows.map((r, i) => {
          const valClass = mode === 'pct'
            ? (r.value >= 80 ? 'lb-val-good' : r.value >= 50 ? 'lb-val-warn' : 'lb-val-bad')
            : '';
          const rankClass = i===0 ? 'gold' : i===1 ? 'silver' : i===2 ? 'bronze' : '';
          const fillClass = i===0 ? 'lb-bar-fill-1' : i===1 ? 'lb-bar-fill-2' : 'lb-bar-fill-3';
          return `
            <div class="lb-row">
              <div class="lb-rank ${rankClass}">${i+1}</div>
              <div class="avatar avatar-sm">${Utils.initials(r.name)}</div>
              <div class="lb-name">${escape(r.name)}</div>
              <div class="lb-bar"><div class="lb-bar-fill ${fillClass}" style="width:${r.pct}%"></div></div>
              <div class="lb-val ${valClass}">${r.display}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Renders a record table. opts: { compact, sortable, showActions }
  function renderActivityTable(team, members, records, opts) {
    opts = opts || {};
    if (!records.length) {
      return opts.sortable
        ? emptyState('No records match', 'Try clearing some filters.', 'search')
        : `<div class="card-body">${emptyState('No records yet', 'Records will show up here as they are logged.', 'chart')}</div>`;
    }

    const showAmount  = team.fields.includes('amount');
    const showOutcome = team.fields.includes('outcome');
    const showActions = opts.showActions && (CONFIG.FEATURES.editRecords || CONFIG.FEATURES.deleteRecords);

    const sorted = opts.sortable ? Analytics.sortRecords(records, members, activitySort) : records;
    const cap = opts.sortable ? CONFIG.ACTIVITY_TABLE_CAP : sorted.length;
    const arrow = (col) => activitySort.col === col
      ? (activitySort.dir === 'asc' ? ' ↑' : ' ↓') : '';

    const headerCell = (key, label) => opts.sortable
      ? `<th data-sort="${key}" class="sortable">${label}${arrow(key)}</th>`
      : `<th>${label}</th>`;

    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            ${headerCell('date', 'Date')}
            ${headerCell('member', 'Member')}
            ${headerCell('workUnit', 'Work Unit')}
            ${showAmount ? headerCell('amount', 'Amount') : ''}
            ${showOutcome ? '<th>Outcome</th>' : ''}
            ${showActions ? '<th></th>' : ''}
          </tr></thead>
          <tbody>
            ${sorted.slice(0, cap).map(r => {
              const m = members.find(x => x.email.toLowerCase() === r.memberEmail.toLowerCase())
                    || State.findUserByEmail(r.memberEmail)?.user;
              return `<tr>
                <td>${r.date}</td>
                <td><strong>${m ? escape(m.displayName) : escape(r.memberEmail)}</strong></td>
                <td>${escape(LIBRARY.workUnitLabel(r.workUnit, team.workUnitLabels))}</td>
                ${showAmount?`<td>${Utils.fmt$(r.fields?.amount||0)}</td>`:''}
                ${showOutcome?`<td>${r.fields?.outcome?`<span class="pill ${r.fields.outcome==='Win'?'pill-g':r.fields.outcome==='Loss'?'pill-r':'pill-a'}">${escape(r.fields.outcome)}</span>`:'<span class="muted">—</span>'}</td>`:''}
                ${showActions ? `<td class="row-actions">
                  ${CONFIG.FEATURES.editRecords ? `<button class="icon-btn" data-edit="${escape(r.id)}" title="Edit">${Utils.icon('edit',14)}</button>` : ''}
                  ${CONFIG.FEATURES.deleteRecords ? `<button class="icon-btn" data-del="${escape(r.id)}" title="Delete">${Utils.icon('trash',14)}</button>` : ''}
                </td>` : ''}
              </tr>`;
            }).join('')}
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
      el.onclick = () => { tab = el.dataset.go; drillMember = null; render(session); };
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
