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

  // Phase 6 part 5: admin Dashboard filter state (department / team / user).
  // Each filter narrows independently; combining them does set-intersection.
  let dashFilter = { department: '', teamId: '', memberEmail: '' };

  // Phase 6 part 6: admin History filter state. Same pattern as dashFilter
  // but with date range pickers added. Persists across re-renders within
  // the History tab.
  let historyFilterAdmin = {
    department: '', teamId: '', memberEmail: '',
    dateFrom: '', dateTo: '',
  };

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

  // Phase 6 part 5: real admin Dashboard.
  // Company-wide overview with three independent filters
  // (department, team, member). All metrics + leaderboard + activity
  // below scale to the filter intersection.
  function renderDashboardStub(main, session) {
    const s = State.get();
    const today = Utils.todayISO();

    // ----- Apply filters ----------------------------------------
    // Teams in scope: filtered by department first, then by direct team pick
    let scopedTeams = s.teams;
    if (dashFilter.department) {
      scopedTeams = scopedTeams.filter(t => (t.department||'') === dashFilter.department);
    }
    if (dashFilter.teamId) {
      scopedTeams = scopedTeams.filter(t => t.id === dashFilter.teamId);
    }
    const scopedTeamIds = new Set(scopedTeams.map(t => t.id));

    // Members in scope: belong to a scoped team, AND match member filter if any
    let scopedMembers = s.members.filter(m => scopedTeamIds.has(m.teamId));
    if (dashFilter.memberEmail) {
      scopedMembers = scopedMembers.filter(m => m.email.toLowerCase() === dashFilter.memberEmail.toLowerCase());
    }
    const scopedMemberEmails = new Set(scopedMembers.map(m => m.email.toLowerCase()));

    // Records: belong to a scoped team AND (if member filter active) authored by scoped member
    let records = s.records.filter(r => scopedTeamIds.has(r.teamId));
    if (dashFilter.memberEmail) {
      records = records.filter(r => r.memberEmail.toLowerCase() === dashFilter.memberEmail.toLowerCase());
    }

    // ----- Build metrics ----------------------------------------
    const todayRecs = records.filter(r => r.date === today).length;
    const monthPfx = today.slice(0, 7);
    const monthRecs = records.filter(r => r.date.startsWith(monthPfx)).length;
    const weekDays = Analytics.lastNDays(7, today);
    const weekRecs = records.filter(r => weekDays.includes(r.date)).length;

    // Active users today: distinct memberEmails who logged a record today
    const activeToday = new Set(
      records.filter(r => r.date === today).map(r => r.memberEmail.toLowerCase())
    ).size;

    // ----- Build cross-team leaderboard (top by record count this week)
    const teamScores = scopedTeams.map(t => {
      const teamRecs = records.filter(r => r.teamId === t.id && weekDays.includes(r.date));
      return {
        team: t,
        count: teamRecs.length,
        memberCount: scopedMembers.filter(m => m.teamId === t.id).length,
      };
    }).sort((a, b) => b.count - a.count);

    // Department + member dropdown options
    const allDepartments = State.getDepartments();
    const filterTeamOptions = (dashFilter.department
      ? s.teams.filter(t => t.department === dashFilter.department)
      : s.teams
    );
    const filterMemberOptions = (dashFilter.teamId
      ? s.members.filter(m => m.teamId === dashFilter.teamId)
      : (dashFilter.department
          ? s.members.filter(m => filterTeamOptions.some(t => t.id === m.teamId))
          : s.members)
    );

    const filterActive = !!(dashFilter.department || dashFilter.teamId || dashFilter.memberEmail);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Dashboard</h2>
          <div class="ph-sub">Company-wide view · ${escape(s.company.name || 'Chargebacks911')}</div>
        </div>
      </div>

      <div class="card dash-filter-bar">
        <div class="card-body">
          <div class="dash-filters">
            <div class="form-row">
              <label class="label">Department</label>
              <select id="df-dept">
                <option value="">All departments</option>
                ${allDepartments.map(d => `<option value="${escape(d)}" ${dashFilter.department===d?'selected':''}>${escape(d)}</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <label class="label">Team</label>
              <select id="df-team">
                <option value="">All teams</option>
                ${filterTeamOptions.map(t => `<option value="${escape(t.id)}" ${dashFilter.teamId===t.id?'selected':''}>${escape(t.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <label class="label">User</label>
              <select id="df-user">
                <option value="">All users</option>
                ${filterMemberOptions.map(m => `<option value="${escape(m.email)}" ${dashFilter.memberEmail===m.email?'selected':''}>${escape(m.displayName)}</option>`).join('')}
              </select>
            </div>
            ${filterActive ? `<div class="dash-filter-clear">
              <button class="btn btn-ghost btn-sm" id="df-clear">Clear filters</button>
            </div>` : ''}
          </div>
        </div>
      </div>

      <div class="metric-grid">
        ${metric('Today',        todayRecs,                        'records logged today',      'r')}
        ${metric('This Week',    weekRecs,                         'last 7 days',               'b')}
        ${metric('This Month',   monthRecs,                        'month-to-date',             'g')}
        ${metric('Active Today', activeToday,                      'users with records today',  'a')}
        ${metric('Teams',        scopedTeams.length,               filterActive?'in scope':'configured', '')}
        ${metric('Members',      scopedMembers.length,             filterActive?'in scope':'employees',  'p')}
      </div>

      <div class="split-2">
        <div class="card">
          <div class="card-head">
            <span class="card-title">${Utils.icon('crown',14)} Top Teams</span>
            <span class="muted text-xs">this week</span>
          </div>
          ${teamScores.length && teamScores[0].count > 0
            ? `<div class="dash-team-board">
                ${teamScores.slice(0, 8).map((row, i) => {
                  const max = teamScores[0].count || 1;
                  const pct = Math.round((row.count / max) * 100);
                  return `
                    <div class="dash-team-row">
                      <div class="dash-team-rank">#${i+1}</div>
                      <div class="dash-team-info">
                        <div class="dash-team-name">${escape(row.team.name)}</div>
                        <div class="dash-team-meta muted">${escape(row.team.department||'—')} · ${row.memberCount} member${row.memberCount!==1?'s':''}</div>
                      </div>
                      <div class="dash-team-bar">
                        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
                      </div>
                      <div class="dash-team-count"><strong>${row.count}</strong></div>
                    </div>
                  `;
                }).join('')}
              </div>`
            : `<div class="card-body">${emptyState('No team activity', filterActive?'No records match your filters this week.':'Records will appear here as teams log work.', 'crown')}</div>`}
        </div>

        <div class="card">
          <div class="card-head">
            <span class="card-title">Recent Activity</span>
          </div>
          ${records.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Member</th><th>Team</th><th>Work</th></tr></thead>
                <tbody>
                  ${records.slice(-10).reverse().map(r => {
                    const m = s.members.find(x => x.email === r.memberEmail);
                    const t = s.teams.find(x => x.id === r.teamId);
                    return `<tr>
                      <td>${escape(r.date)}</td>
                      <td>${m ? escape(m.displayName) : '<span class="muted">—</span>'}</td>
                      <td>${t ? escape(t.name) : '<span class="muted">—</span>'}</td>
                      <td>${escape(LIBRARY.workUnitLabel(r.workUnit, t?.workUnitLabels))}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : `<div class="card-body">${emptyState('No activity', filterActive?'No records match your filters.':'Records will show here as members log work.', 'chart')}</div>`}
        </div>
      </div>
    `;

    // ----- Bind filter dropdowns ---------------------------------
    const dept = document.getElementById('df-dept');
    const team = document.getElementById('df-team');
    const user = document.getElementById('df-user');

    dept.onchange = () => {
      dashFilter.department = dept.value;
      // If current team is no longer in the scoped department, clear it.
      if (dashFilter.teamId) {
        const t = s.teams.find(x => x.id === dashFilter.teamId);
        if (!t || (dashFilter.department && t.department !== dashFilter.department)) {
          dashFilter.teamId = '';
          dashFilter.memberEmail = '';
        }
      }
      render(session);
    };
    team.onchange = () => {
      dashFilter.teamId = team.value;
      // Clear member if not in the new team
      if (dashFilter.memberEmail && dashFilter.teamId) {
        const m = s.members.find(x => x.email === dashFilter.memberEmail);
        if (!m || m.teamId !== dashFilter.teamId) dashFilter.memberEmail = '';
      }
      render(session);
    };
    user.onchange = () => {
      dashFilter.memberEmail = user.value;
      render(session);
    };
    const clear = document.getElementById('df-clear');
    if (clear) clear.onclick = () => {
      dashFilter = { department: '', teamId: '', memberEmail: '' };
      render(session);
    };
  }

  // Phase 6 part 4: real Import tab for super admin.
  // Super admins don't have a team in their session — they pick one
  // first, then the bulk-CSV import runs against that team. Single-
  // record logging stays on the manager/member side; admins use bulk
  // import for backfill / data correction work.
  function renderImportStub(main, session) {
    const teams = State.get().teams;
    if (teams.length === 0) {
      main.innerHTML = `
        <div class="page-header">
          <div>
            <h2>Import</h2>
            <div class="ph-sub">Bulk import records to a team</div>
          </div>
        </div>
        <div class="empty-stub">
          ${Utils.icon('upload', 48)}
          <h3>No teams yet</h3>
          <p>Create a team first via Settings → Team Setup, then come back here to bulk-import records.</p>
        </div>
      `;
      return;
    }

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Import</h2>
          <div class="ph-sub">Bulk import records to a team</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Pick a team</span></div>
        <div class="card-body">
          <p class="helper" style="margin-bottom:.75rem">
            Select which team's records you're importing. The CSV format
            depends on that team's configured work units and fields.
          </p>
          <div class="form-row">
            <label class="label">Team</label>
            <select id="imp-team">
              <option value="">(select a team)</option>
              ${teams.map(t => `<option value="${escape(t.id)}">${escape(t.name)}${t.department?' — '+escape(t.department):''}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div id="bulk-import-host"></div>
    `;

    const teamSel = document.getElementById('imp-team');
    const host = document.getElementById('bulk-import-host');

    teamSel.onchange = () => {
      const teamId = teamSel.value;
      if (!teamId) { host.innerHTML = ''; return; }
      const team = State.teamById(teamId);
      if (!team) { host.innerHTML = ''; return; }
      if (team.workUnits.length === 0) {
        host.innerHTML = `
          <div class="notice warn">
            <strong>${escape(team.name)} isn't configured yet.</strong>
            Run the team-setup wizard from Settings before importing records.
          </div>
        `;
        return;
      }
      CSVImport.renderInline(host, team, session, {
        onCommit: () => render(session)
      });
    };
  }

  // Phase 6 part 6: real admin History page
  // Company-wide PDF report with department / team / user filters
  // and a date-range picker (with quick presets). Below the controls,
  // an in-app record table scoped to the same filters.
  function renderHistoryStub(main, session) {
    const s = State.get();

    // Filter the master record set
    let scopedTeams = s.teams;
    if (historyFilterAdmin.department) {
      scopedTeams = scopedTeams.filter(t => (t.department || '') === historyFilterAdmin.department);
    }
    if (historyFilterAdmin.teamId) {
      scopedTeams = scopedTeams.filter(t => t.id === historyFilterAdmin.teamId);
    }
    const scopedTeamIds = new Set(scopedTeams.map(t => t.id));

    let scopedMembers = s.members.filter(m => scopedTeamIds.has(m.teamId));
    if (historyFilterAdmin.memberEmail) {
      scopedMembers = scopedMembers.filter(m => m.email.toLowerCase() === historyFilterAdmin.memberEmail.toLowerCase());
    }

    let records = s.records.filter(r => scopedTeamIds.has(r.teamId));
    if (historyFilterAdmin.memberEmail) {
      records = records.filter(r => r.memberEmail.toLowerCase() === historyFilterAdmin.memberEmail.toLowerCase());
    }
    records = Reports.filterByRange(records, historyFilterAdmin.dateFrom, historyFilterAdmin.dateTo);

    // Newest first for the in-app table
    records = [...records].sort((a, b) => b.date.localeCompare(a.date));

    // Filter dropdown options
    const allDepartments = State.getDepartments();
    const teamOptions = (historyFilterAdmin.department
      ? s.teams.filter(t => t.department === historyFilterAdmin.department)
      : s.teams);
    const memberOptions = (historyFilterAdmin.teamId
      ? s.members.filter(m => m.teamId === historyFilterAdmin.teamId)
      : (historyFilterAdmin.department
          ? s.members.filter(m => teamOptions.some(t => t.id === m.teamId))
          : s.members));

    const filterActive = !!(
      historyFilterAdmin.department ||
      historyFilterAdmin.teamId ||
      historyFilterAdmin.memberEmail ||
      historyFilterAdmin.dateFrom ||
      historyFilterAdmin.dateTo
    );

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>History</h2>
          <div class="ph-sub">Reports and historical activity · ${escape(s.company.name || 'Chargebacks911')}</div>
        </div>
        <button class="btn btn-primary" id="hi-pdf">${Utils.icon('history',14)} Generate PDF Report</button>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Quick range</span>
          <span class="muted text-xs">Sets the From/To dates below</span>
        </div>
        <div class="card-body">
          <div class="preset-row">
            <button class="btn btn-ghost btn-sm" data-preset="last30">Last 30 days</button>
            <button class="btn btn-ghost btn-sm" data-preset="thisMonth">This month</button>
            <button class="btn btn-ghost btn-sm" data-preset="lastMonth">Last month</button>
            <button class="btn btn-ghost btn-sm" data-preset="thisQuarter">This quarter</button>
            <button class="btn btn-ghost btn-sm" data-preset="thisYear">This year</button>
            <button class="btn btn-ghost btn-sm" data-preset="allTime">All time</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Filters</span></div>
        <div class="card-body">
          <div class="dash-filters">
            <div class="form-row">
              <label class="label">Department</label>
              <select id="hf-dept">
                <option value="">All departments</option>
                ${allDepartments.map(d => `<option value="${escape(d)}" ${historyFilterAdmin.department===d?'selected':''}>${escape(d)}</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <label class="label">Team</label>
              <select id="hf-team">
                <option value="">All teams</option>
                ${teamOptions.map(t => `<option value="${escape(t.id)}" ${historyFilterAdmin.teamId===t.id?'selected':''}>${escape(t.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <label class="label">User</label>
              <select id="hf-user">
                <option value="">All users</option>
                ${memberOptions.map(m => `<option value="${escape(m.email)}" ${historyFilterAdmin.memberEmail===m.email?'selected':''}>${escape(m.displayName)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="dash-filters" style="margin-top:1rem">
            <div class="form-row">
              <label class="label">From</label>
              <input id="hf-from" type="date" value="${escape(historyFilterAdmin.dateFrom)}">
            </div>
            <div class="form-row">
              <label class="label">To</label>
              <input id="hf-to" type="date" value="${escape(historyFilterAdmin.dateTo)}">
            </div>
            ${filterActive ? `<div class="dash-filter-clear">
              <button class="btn btn-ghost btn-sm" id="hf-clear">Clear filters</button>
            </div>` : ''}
          </div>
        </div>
      </div>

      <div class="metric-grid">
        ${metric('Records',     records.length.toLocaleString(),     filterActive?'in scope':'in range', 'r')}
        ${metric('Teams',       scopedTeams.length,                  filterActive?'in scope':'configured', 'b')}
        ${metric('Members',     scopedMembers.length,                filterActive?'in scope':'employees', 'g')}
        ${metric('Active',      new Set(records.map(r=>r.memberEmail.toLowerCase())).size, 'logged at least once', 'a')}
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Records</span>
          <span class="muted text-xs">${records.length.toLocaleString()} record${records.length!==1?'s':''}${filterActive?' (filtered)':''}</span>
        </div>
        ${records.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Member</th><th>Team</th><th>Work Unit</th></tr></thead>
              <tbody>
                ${records.slice(0, 200).map(r => {
                  const m = s.members.find(x => x.email === r.memberEmail);
                  const t = s.teams.find(x => x.id === r.teamId);
                  return `<tr>
                    <td>${escape(r.date)}</td>
                    <td>${m ? escape(m.displayName) : '<span class="muted">—</span>'}</td>
                    <td>${t ? escape(t.name) : '<span class="muted">—</span>'}</td>
                    <td>${escape(LIBRARY.workUnitLabel(r.workUnit, t?.workUnitLabels))}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
            ${records.length > 200 ? `<div class="card-body"><p class="helper">Showing first 200 records. Generate a PDF report to download the full set (${records.length.toLocaleString()} records).</p></div>` : ''}
          </div>
        ` : `<div class="card-body">${emptyState('No records', filterActive?'No records match your filters.':'Records will appear here as members log work.', 'history')}</div>`}
      </div>
    `;

    // ----- Bindings -----------------------------------------
    document.getElementById('hf-dept').onchange = (e) => {
      historyFilterAdmin.department = e.target.value;
      // Cascade: clear team if no longer in scope
      if (historyFilterAdmin.teamId) {
        const t = s.teams.find(x => x.id === historyFilterAdmin.teamId);
        if (!t || (historyFilterAdmin.department && t.department !== historyFilterAdmin.department)) {
          historyFilterAdmin.teamId = '';
          historyFilterAdmin.memberEmail = '';
        }
      }
      render(session);
    };
    document.getElementById('hf-team').onchange = (e) => {
      historyFilterAdmin.teamId = e.target.value;
      if (historyFilterAdmin.memberEmail && historyFilterAdmin.teamId) {
        const m = s.members.find(x => x.email === historyFilterAdmin.memberEmail);
        if (!m || m.teamId !== historyFilterAdmin.teamId) historyFilterAdmin.memberEmail = '';
      }
      render(session);
    };
    document.getElementById('hf-user').onchange = (e) => {
      historyFilterAdmin.memberEmail = e.target.value;
      render(session);
    };
    document.getElementById('hf-from').onchange = (e) => {
      historyFilterAdmin.dateFrom = e.target.value;
      render(session);
    };
    document.getElementById('hf-to').onchange = (e) => {
      historyFilterAdmin.dateTo = e.target.value;
      render(session);
    };
    const clearBtn = document.getElementById('hf-clear');
    if (clearBtn) clearBtn.onclick = () => {
      historyFilterAdmin = { department:'', teamId:'', memberEmail:'', dateFrom:'', dateTo:'' };
      render(session);
    };

    // Date-range presets
    main.querySelectorAll('[data-preset]').forEach(btn => {
      btn.onclick = () => {
        const [from, to] = Reports.preset(btn.dataset.preset);
        historyFilterAdmin.dateFrom = from;
        historyFilterAdmin.dateTo   = to;
        render(session);
      };
    });

    // Generate PDF button
    document.getElementById('hi-pdf').onclick = () => {
      generateAdminPdf(session, scopedTeams, scopedMembers, records);
    };
  }

  // ============================================================
  //  ADMIN PDF REPORT (Phase 6 part 6)
  // ============================================================
  function generateAdminPdf(session, scopedTeams, scopedMembers, records) {
    const s = State.get();
    const totalCount = records.length;
    const memberSet = new Set(records.map(r => r.memberEmail.toLowerCase()));
    const dateFrom = historyFilterAdmin.dateFrom || (records.length ? records.map(r => r.date).sort()[0] : '—');
    const dateTo   = historyFilterAdmin.dateTo   || (records.length ? records.map(r => r.date).sort().slice(-1)[0] : '—');

    const tableHead = ['Date', 'Team', 'Member', 'Work Unit'];
    const tableBody = records.map(r => {
      const m = s.members.find(x => x.email === r.memberEmail);
      const t = s.teams.find(x => x.id === r.teamId);
      return [
        r.date,
        t ? t.name : '—',
        m ? m.displayName : r.memberEmail,
        LIBRARY.workUnitLabel(r.workUnit, t?.workUnitLabels),
      ];
    });

    const filterParts = [];
    if (historyFilterAdmin.department) filterParts.push(`Department: ${historyFilterAdmin.department}`);
    if (historyFilterAdmin.teamId) {
      const t = s.teams.find(x => x.id === historyFilterAdmin.teamId);
      if (t) filterParts.push(`Team: ${t.name}`);
    }
    if (historyFilterAdmin.memberEmail) {
      const m = s.members.find(x => x.email === historyFilterAdmin.memberEmail);
      if (m) filterParts.push(`User: ${m.displayName}`);
    }

    const subtitle = filterParts.length
      ? `Filtered: ${filterParts.join(' · ')}`
      : `Company-wide · ${scopedTeams.length} team${scopedTeams.length!==1?'s':''} · ${scopedMembers.length} member${scopedMembers.length!==1?'s':''}`;

    const ok = Reports.generate({
      scope: 'Admin',
      companyName: s.company.name || 'Chargebacks911',
      reportTitle: 'Company Activity Report',
      subtitle,
      fromIso: dateFrom,
      toIso: dateTo,
      summary: [
        { label: 'Total Records', value: totalCount.toLocaleString() },
        { label: 'Teams',         value: scopedTeams.length.toLocaleString() },
        { label: 'Members',       value: scopedMembers.length.toLocaleString() },
        { label: 'Active Users',  value: memberSet.size.toLocaleString() },
      ],
      sectionTitle: 'All Records',
      tableHead,
      tableBody,
    });
    if (ok) Utils.toast(`PDF report ready (${totalCount} records)`, 'good');
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

    // Helper to render the "team / role" subline on user rows
    const teamLabel = (teamId) => {
      const t = s.teams.find(x => x.id === teamId);
      return t ? escape(t.name) : '<span class="muted">no team</span>';
    };

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Users</h2>
          <div class="ph-sub">Create and manage super admins, managers, and members.</div>
        </div>
        <button class="btn btn-primary" id="add-user">${Utils.icon('plus',14)} Add User</button>
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
                  ${a.username ? `<span class="u-uname">@${escape(a.username)}</span>`:''}
                </div>
                <div class="u-sub">${escape(a.email)}${a.approvedBy?' · added by '+(a.approvedBy==='__bootstrap__'?'(bootstrap)':escape(a.approvedBy)):''}</div>
              </div>
              <div class="u-actions">
                <button class="btn btn-ghost btn-sm" data-toggle-approver="${escape(a.email)}">
                  ${isApprover ? 'Remove approver' : 'Make approver'}
                </button>
                <button class="btn btn-ghost btn-sm" data-edit-user="${escape(a.email)}" data-edit-type="super" title="Edit">${Utils.icon('edit',12)}</button>
                ${!isMe && !lastOne ? `<button class="btn btn-danger btn-sm" data-rm-user="${escape(a.email)}" data-rm-type="super" title="Delete">${Utils.icon('trash',12)}</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Managers</span>
          <span class="muted" style="font-size:12px">${s.managers.length}</span>
        </div>
        ${s.managers.length ? s.managers.map(m => {
          const team = State.teamForManager(m.email);
          return `
            <div class="user-row">
              <div class="avatar">${Utils.initials(m.displayName)}</div>
              <div class="u-main">
                <div class="u-name">${escape(m.displayName)}
                  ${m.username ? `<span class="u-uname">@${escape(m.username)}</span>`:''}
                </div>
                <div class="u-sub">${escape(m.email)} · ${team ? escape(team.name) : '<span class="muted">no team</span>'}</div>
              </div>
              <div class="u-actions">
                <button class="btn btn-ghost btn-sm" data-edit-user="${escape(m.email)}" data-edit-type="manager" title="Edit">${Utils.icon('edit',12)}</button>
                <button class="btn btn-danger btn-sm" data-rm-user="${escape(m.email)}" data-rm-type="manager" title="Delete">${Utils.icon('trash',12)}</button>
              </div>
            </div>
          `;
        }).join('') : `<div class="card-body">${emptyState('No managers yet', 'Click "Add User" above to create one.')}</div>`}
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Members</span>
          <span class="muted" style="font-size:12px">${s.members.length}</span>
        </div>
        ${s.members.length ? s.members.map(m => `
          <div class="user-row">
            <div class="avatar">${Utils.initials(m.displayName)}</div>
            <div class="u-main">
              <div class="u-name">${escape(m.displayName)}
                ${m.username ? `<span class="u-uname">@${escape(m.username)}</span>`:''}
              </div>
              <div class="u-sub">${escape(m.email)} · ${teamLabel(m.teamId)}${m.role?' · '+escape(m.role):''}</div>
            </div>
            <div class="u-actions">
              <button class="btn btn-ghost btn-sm" data-edit-user="${escape(m.email)}" data-edit-type="member" title="Edit">${Utils.icon('edit',12)}</button>
              <button class="btn btn-danger btn-sm" data-rm-user="${escape(m.email)}" data-rm-type="member" title="Delete">${Utils.icon('trash',12)}</button>
            </div>
          </div>
        `).join('') : `<div class="card-body">${emptyState('No members yet', 'Click "Add User" above to create one.')}</div>`}
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

    // Delete (any role)
    main.querySelectorAll('[data-rm-user]').forEach(btn => {
      btn.onclick = () => {
        const email = btn.dataset.rmUser;
        const type  = btn.dataset.rmType;
        if (!Utils.confirm(`Remove ${type} ${email}?\nTheir records will remain but they won't be able to sign in.`)) return;
        State.deleteUser(email, type);
        // If super admin, also strip from approvers
        if (type === 'super') {
          const list = (State.get().config.superAdminApprovers || [])
            .filter(e => e.toLowerCase() !== email.toLowerCase());
          State.updateConfig({ superAdminApprovers: list });
        }
        // If manager, unassign from any team they managed
        if (type === 'manager') {
          State.get().teams.forEach(t => {
            if ((t.managerEmail||'').toLowerCase() === email.toLowerCase()) {
              State.updateTeam(t.id, { managerEmail: null });
            }
          });
        }
        Utils.toast('Removed', 'good');
        render(session);
      };
    });

    // Edit (any role) — open the unified modal in edit mode
    main.querySelectorAll('[data-edit-user]').forEach(btn => {
      btn.onclick = () => openUserModal(session, {
        mode: 'edit',
        email: btn.dataset.editUser,
        type:  btn.dataset.editType,
      });
    });

    // Add User — opens unified modal in create mode
    const addBtn = document.getElementById('add-user');
    if (addBtn) addBtn.onclick = () => openUserModal(session, { mode: 'create' });
  }

  // ===== UNIFIED ADD/EDIT USER MODAL =========================
  // One modal handles all three roles. The role picker at the top
  // drives which extra fields appear. In edit mode, the role can't
  // be changed (deleting + recreating is the supported path for that).

  function openUserModal(session, opts) {
    const isEdit = opts.mode === 'edit';
    const s = State.get();

    // Pre-fill data when editing
    let editing = null;
    if (isEdit) {
      const list = opts.type === 'super' ? s.superAdmins
                 : opts.type === 'manager' ? s.managers
                 : s.members;
      editing = list.find(u => u.email.toLowerCase() === opts.email.toLowerCase());
      if (!editing) { Utils.toast('User not found', 'bad'); return; }
    }
    const startRole = isEdit ? opts.type : 'member';

    // Find unmanaged teams (no current manager) — used in the
    // "existing team" dropdown for new managers.
    const managedTeamIds = new Set(s.managers.map(m => {
      const t = State.teamForManager(m.email);
      return t ? t.id : null;
    }).filter(Boolean));
    // When editing a manager, allow them to keep their current team.
    const myCurrentTeamId = (isEdit && editing && editing.teamId) ? editing.teamId
      : (isEdit && opts.type === 'manager' ? (State.teamForManager(editing.email) || {}).id : null);

    // Helper: build team <option>s. For Add Manager, only show
    // teams without a current manager (or this manager's team in edit).
    const teamOptionsForManager = () => {
      return s.teams.filter(t => !managedTeamIds.has(t.id) || t.id === myCurrentTeamId)
        .map(t => `<option value="${t.id}" ${t.id===myCurrentTeamId?'selected':''}>${escape(t.name)}${t.department?' — '+escape(t.department):''}</option>`)
        .join('');
    };
    const teamOptionsForMember = () => {
      return s.teams.map(t =>
        `<option value="${t.id}" ${editing && editing.teamId === t.id ? 'selected':''}>${escape(t.name)}${t.department?' — '+escape(t.department):''}</option>`
      ).join('');
    };

    // Department <option>s for the "create new team" sub-flow.
    const deptOptions = () => State.getDepartments()
      .map(d => `<option value="${escape(d)}">${escape(d)}</option>`)
      .join('') + '<option value="__other__">Other (type below)…</option>';

    // Role dropdown options — when editing, lock to current role (a label).
    const roleSelector = isEdit
      ? `<input type="text" disabled value="${
          opts.type === 'super' ? 'Super Admin' :
          opts.type === 'manager' ? 'Manager' : 'Member'
        }">`
      : `<select id="ru-role">
           <option value="member">Member</option>
           <option value="manager">Manager</option>
           <option value="super">Super Admin</option>
         </select>`;

    Utils.openModal(`
      <h3>${isEdit ? 'Edit user' : 'Add user'}</h3>
      <p class="helper" style="margin-bottom:1rem">
        ${isEdit
          ? 'Update name, username, email, or password. Role can’t be changed — delete and re-add to switch roles.'
          : 'Pick a role, then fill in the rest. The user can sign in with their <strong>username</strong> and password right away.'}
      </p>

      <div class="form-row">
        <label class="label">Role</label>
        ${roleSelector}
      </div>

      <div class="form-grid-2">
        <div class="form-row"><label class="label">Display name</label>
          <input id="ru-name" placeholder="Jane Doe" value="${escape((editing&&editing.displayName)||'')}"></div>
        <div class="form-row"><label class="label">Username</label>
          <input id="ru-username" placeholder="janed" value="${escape((editing&&editing.username)||'')}"></div>
      </div>
      <div class="form-grid-2">
        <div class="form-row"><label class="label">Email</label>
          <input type="email" id="ru-email" placeholder="jane@company.com"
                 value="${escape((editing&&editing.email)||'')}"
                 ${isEdit ? 'disabled' : ''}></div>
        <div class="form-row">
          <label class="label">Password ${isEdit?'<span class="muted" style="font-weight:400">(leave blank to keep)</span>':''}</label>
          <input type="text" id="ru-pass" placeholder="${isEdit?'••••••••':'temporary password'}"></div>
      </div>

      <!-- Manager-only fields: team picker -->
      <div id="ru-mgr-fields" style="display:none;border-top:1px solid var(--bor);padding-top:1rem;margin-top:.75rem">
        <div class="form-row">
          <label class="label">Team</label>
          <div class="radio-group">
            <label><input type="radio" name="ru-team-mode" value="existing" checked> Pick existing team</label>
            <label><input type="radio" name="ru-team-mode" value="new"> Create a new team</label>
          </div>
        </div>
        <div id="ru-team-existing">
          <div class="form-row">
            <label class="label">Existing team</label>
            <select id="ru-team-id">
              <option value="">(no team — assign later)</option>
              ${teamOptionsForManager()}
            </select>
          </div>
        </div>
        <div id="ru-team-new" style="display:none">
          <div class="form-grid-2">
            <div class="form-row">
              <label class="label">Team name</label>
              <input id="ru-newteam-name" placeholder="Alerts West">
            </div>
            <div class="form-row">
              <label class="label">Department</label>
              <select id="ru-newteam-dept">${deptOptions()}</select>
            </div>
          </div>
          <div class="form-row" id="ru-newteam-other-row" style="display:none">
            <label class="label">New department name</label>
            <input id="ru-newteam-other" placeholder="e.g. Underwriting">
          </div>
        </div>
      </div>

      <!-- Member-only fields: team + role -->
      <div id="ru-mem-fields" style="display:none;border-top:1px solid var(--bor);padding-top:1rem;margin-top:.75rem">
        <div class="form-grid-2">
          <div class="form-row">
            <label class="label">Team</label>
            <select id="ru-mem-team">
              <option value="">(select a team)</option>
              ${teamOptionsForMember()}
            </select>
          </div>
          <div class="form-row">
            <label class="label">Role on team</label>
            <select id="ru-mem-role">
              ${LIBRARY.roles.map(r =>
                `<option value="${escape(r)}" ${editing && editing.role === r ? 'selected':''}>${escape(r)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" id="ru-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="ru-confirm">${isEdit?'Save changes':'Create user'}</button>
      </div>
    `);

    // ----- modal wiring ------------------------------------
    const roleSel    = document.getElementById('ru-role');
    const mgrFields  = document.getElementById('ru-mgr-fields');
    const memFields  = document.getElementById('ru-mem-fields');
    const teamMode   = () => (document.querySelector('input[name="ru-team-mode"]:checked')||{}).value;
    const teamExBox  = document.getElementById('ru-team-existing');
    const teamNewBox = document.getElementById('ru-team-new');
    const deptSel    = document.getElementById('ru-newteam-dept');
    const deptOther  = document.getElementById('ru-newteam-other-row');

    function syncRoleVisibility() {
      const role = isEdit ? opts.type : roleSel.value;
      mgrFields.style.display = role === 'manager' ? '' : 'none';
      memFields.style.display = role === 'member'  ? '' : 'none';
    }
    function syncTeamMode() {
      const mode = teamMode();
      teamExBox.style.display  = mode === 'existing' ? '' : 'none';
      teamNewBox.style.display = mode === 'new'      ? '' : 'none';
    }
    function syncDeptOther() {
      deptOther.style.display = deptSel.value === '__other__' ? '' : 'none';
    }
    syncRoleVisibility();
    syncTeamMode();
    syncDeptOther();
    if (roleSel) roleSel.addEventListener('change', syncRoleVisibility);
    document.querySelectorAll('input[name="ru-team-mode"]').forEach(r =>
      r.addEventListener('change', syncTeamMode));
    if (deptSel) deptSel.addEventListener('change', syncDeptOther);

    document.getElementById('ru-cancel').onclick = () => Utils.closeModal();
    document.getElementById('ru-confirm').onclick = () => submitUserModal(session, isEdit, editing, opts);
  }

  // Validate + commit the unified Add/Edit User modal.
  function submitUserModal(session, isEdit, editing, opts) {
    const role = isEdit ? opts.type : document.getElementById('ru-role').value;
    const name = document.getElementById('ru-name').value.trim();
    const username = document.getElementById('ru-username').value.trim();
    const emailEl = document.getElementById('ru-email');
    const email = (emailEl.disabled ? editing.email : emailEl.value.trim()).toLowerCase();
    const passRaw = document.getElementById('ru-pass').value;

    if (!name)     return Utils.toast('Display name required', 'bad');
    if (!username) return Utils.toast('Username required', 'bad');
    if (!email)    return Utils.toast('Email required', 'bad');
    if (!Utils.validEmail(email)) return Utils.toast('Invalid email', 'bad');
    if (!isEdit && !passRaw) return Utils.toast('Password required', 'bad');
    if (passRaw && passRaw.length < CONFIG.PASSWORD_MIN_LENGTH)
      return Utils.toast(`Password min ${CONFIG.PASSWORD_MIN_LENGTH} chars`, 'bad');

    // Uniqueness checks. In edit mode, allow keeping the same username/email.
    const usernameChanged = !editing || (editing.username||'').toLowerCase() !== username.toLowerCase();
    const emailChanged    = !editing || editing.email.toLowerCase() !== email.toLowerCase();
    if (usernameChanged && Auth.usernameInUse(username))
      return Utils.toast('Username already in use', 'bad');
    if (emailChanged && State.emailInUse(email))
      return Utils.toast('Email already in use', 'bad');

    // ----- EDIT mode: just patch the existing record ----------
    if (isEdit) {
      const patch = { displayName: name, username, email };
      if (passRaw) patch.password = passRaw;

      // Member-specific patch: team + role
      if (role === 'member') {
        const teamId = document.getElementById('ru-mem-team').value;
        const memberRole = document.getElementById('ru-mem-role').value;
        if (!teamId) return Utils.toast('Pick a team', 'bad');
        patch.teamId = teamId;
        patch.role   = memberRole;
      }
      State.updateUser(editing.email, role, patch);

      // Manager team reassignment is more involved — skip in v1
      // and mention it.
      if (role === 'manager') {
        // We don't reassign a manager's team here — that's handled
        // on the Teams tab. Editing a manager only updates their
        // identity fields.
      }

      Utils.closeModal();
      Utils.toast('User updated', 'good');
      render(session);
      return;
    }

    // ----- CREATE mode: build the full record -----------------
    const baseFields = {
      email, username, displayName: name, password: passRaw,
      approvedBy: session.user.email,
    };

    if (role === 'super') {
      State.addSuperAdmin(baseFields);
    } else if (role === 'manager') {
      // Resolve the team
      let teamId = null;
      const mode = (document.querySelector('input[name="ru-team-mode"]:checked')||{}).value;
      if (mode === 'new') {
        const teamName = document.getElementById('ru-newteam-name').value.trim();
        let dept = document.getElementById('ru-newteam-dept').value;
        if (dept === '__other__') {
          dept = document.getElementById('ru-newteam-other').value.trim();
          if (!dept) return Utils.toast('Department name required', 'bad');
          State.addDepartment(dept); // persist for future dropdowns
        }
        if (!teamName) return Utils.toast('Team name required', 'bad');
        const team = State.addTeam({
          name: teamName, department: dept,
          managerEmail: email,
          workUnits: [], workUnitLabels: {},
          fields: [], roles: [], goals: {},
        });
        teamId = team.id;
      } else {
        teamId = document.getElementById('ru-team-id').value || null;
        if (teamId) {
          // Stamp this manager onto the team so teamForManager() works.
          State.updateTeam(teamId, { managerEmail: email });
        }
      }
      State.addManager({ ...baseFields, teamId });
    } else if (role === 'member') {
      const teamId = document.getElementById('ru-mem-team').value;
      const memberRole = document.getElementById('ru-mem-role').value;
      if (!teamId) return Utils.toast('Pick a team', 'bad');
      State.addMember({ ...baseFields, teamId, role: memberRole });
    }

    Utils.closeModal();
    Utils.toast(role==='super'?'Super admin created':role==='manager'?'Manager created':'Member created', 'good');
    render(session);
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
        <div class="card-head"><span class="card-title">Team Setup</span></div>
        <div class="card-body">
          <p class="helper" style="margin-bottom:1rem">
            Run the team-setup wizard to configure work units, fields, roles, and goals for any team.
            ${s.teams.length === 0 ? 'Get started by creating your first team.' : ''}
          </p>
          <div class="form-row">
            <label class="label">Team to configure</label>
            <select id="s-wizard-team">
              <option value="__new__">+ Create a new team</option>
              ${s.teams.map(t => `<option value="${escape(t.id)}">${escape(t.name)}${t.department?' — '+escape(t.department):''}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary btn-sm" id="s-wizard-launch">${Utils.icon('shieldStar',12)} Launch Setup Wizard</button>
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
    document.getElementById('s-wizard-launch').onclick = () => {
      const sel = document.getElementById('s-wizard-team').value;
      WizardSettings.open({
        mode: 'admin',
        teamId: sel === '__new__' ? null : sel,
        onClose: (savedId) => { if (savedId) render(session); }
      });
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
