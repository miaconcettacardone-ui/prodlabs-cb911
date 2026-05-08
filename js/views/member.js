/* ============================================================
 *  views/member.js — Team Member dashboard (Phase 4)
 * ============================================================
 *  Tabs: Overview · Stats · Users · Goals · Inbox · Settings
 *
 *  THIS IS A REWRITE for Phase 4:
 *    - Old tabs were Dashboard / Log Work / History.
 *    - New tabs make members feel more like first-class citizens
 *      of the platform — they get a Stats view (with team
 *      leaderboard!), a Users tab (read-only roster), a Goals
 *      tab with last-7-day mini-bars, plus a universal Inbox
 *      and Settings.
 *    - Logging work + History are still REACHABLE (data-go="log",
 *      data-go="history") — they just don't have their own tab
 *      buttons anymore. Overview's "Log Work" button and "View
 *      all" link still work.
 *
 *  WHY THIS RESHAPE?
 *  Phase 1-3 treated members as data-entry users only. Phase 4
 *  acknowledges members care about progress (Stats / Goals) and
 *  team awareness (Users / Leaderboard). Inbox is universal.
 *
 *  TZ NOTE: see manager.js header.
 * ============================================================ */

const MemberView = (() => {

  // Default tab on first render. The router resets internal
  // state every time render() is called from outside, but
  // tab is module-scoped so it survives within-view re-renders.
  let tab = 'dashboard';
  let historySort = { col: 'date', dir: 'desc' };
  let historyFilter = { search: '', workUnit: '', dateFrom: '', dateTo: '' };

  function render(session) {
    Charts.destroyAll();
    const main = document.getElementById('app-main');
    const tabsEl = document.getElementById('app-tabs');
    const team = session.team;
    const inboxUnread = Inbox.unreadCountForUser(session);

    // Phase 6 IA per Mia's sketch:
    //   Dashboard | Goals | Import | History | Messages | Settings
    // Members deliberately do NOT see Stats or Users (admin/manager-only
    // per sketch legend). "Goals" is the user-facing label for what
    // managers see as "Teams & Goals".
    tabsEl.innerHTML = `
      ${tabBtn('dashboard', 'Dashboard', 'dashboard')}
      ${tabBtn('goals',     'Goals',     'flag')}
      ${tabBtn('import',    'Import',    'upload')}
      ${tabBtn('history',   'History',   'history')}
      ${tabBtn('messages',  'Messages',  'message', inboxUnread)}
      ${tabBtn('settings',  'Settings',  'settings')}
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

    if      (tab === 'dashboard') renderOverview(main, session);
    else if (tab === 'goals')     renderGoals(main, session);
    else if (tab === 'import')    renderImport(main, session);
    else if (tab === 'history')   renderHistory(main, session);
    else if (tab === 'messages')  InboxView.render(main, session, () => render(session));
    else if (tab === 'settings')  renderSettings(main, session);
    // legacy keys still reachable from data-go links inside panels
    else if (tab === 'overview')  renderOverview(main, session);
    else if (tab === 'log')       renderLog(main, session);
    else if (tab === 'stats')     renderOverview(main, session); // re-route to dashboard
    else if (tab === 'users')     renderOverview(main, session); // re-route to dashboard
    else if (tab === 'inbox')     InboxView.render(main, session, () => render(session));
  }

  function tabBtn(key, label, icon, count) {
    return `<button class="tab ${tab===key?'on':''}" data-tab="${key}">
      ${Utils.icon(icon, 14)} ${label}
      ${count ? `<span class="tab-badge">${count}</span>` : ''}
    </button>`;
  }

  // ============================================================
  //  OVERVIEW (slimmed dashboard — greeting + goals + charts)
  // ============================================================
  function renderOverview(main, session) {
    const team = session.team;
    const myEmail = session.user.email.toLowerCase();
    const allRecords = State.recordsOfTeam(team.id);
    const allMembers = State.membersOfTeam(team.id);
    const myRecords = allRecords.filter(r => r.memberEmail.toLowerCase() === myEmail);
    const today = Utils.todayISO();
    const todayRecs = myRecords.filter(r => r.date === today);
    const periods = Analytics.periodCounts(myRecords, today);
    const goalsActive = Analytics.activeGoals(team);

    // Phase 6 part 5: rank + team-comparison context.
    // Compute "your rank this week" + how I'm tracking vs team avg.
    const weekDays = Analytics.lastNDays(7, today);
    const myWeek = myRecords.filter(r => weekDays.includes(r.date)).length;
    const teamWeekTotal = allRecords.filter(r => weekDays.includes(r.date)).length;
    const teamAvgWeek = allMembers.length > 0
      ? Math.round(teamWeekTotal / allMembers.length)
      : 0;
    // Build team leaderboard for this week → find my rank
    let myRank = null;
    if (allMembers.length > 1) {
      const board = Analytics.buildTopByTotal(
        allMembers,
        allRecords.filter(r => weekDays.includes(r.date))
      );
      const idx = board.findIndex(row => row.email.toLowerCase() === myEmail);
      if (idx >= 0) myRank = idx + 1;
    }

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
        ${metric('All Time',   periods.allTime.toLocaleString(),'total records',         'a')}
      </div>

      ${allMembers.length > 1 ? `
        <div class="card">
          <div class="card-head">
            <span class="card-title">${Utils.icon('crown',14)} You vs The Team — This Week</span>
            <span class="muted text-xs">${weekDays.length}-day window</span>
          </div>
          <div class="card-body">
            <div class="vs-grid">
              <div class="vs-stat">
                <div class="vs-label">Your records</div>
                <div class="vs-num">${myWeek}</div>
              </div>
              <div class="vs-stat">
                <div class="vs-label">Team average</div>
                <div class="vs-num">${teamAvgWeek}</div>
              </div>
              <div class="vs-stat">
                <div class="vs-label">Your rank</div>
                <div class="vs-num">
                  ${myRank
                    ? `<span class="vs-rank-${myRank===1?'top':myRank<=3?'good':'plain'}">#${myRank}</span> <span class="muted vs-rank-of">of ${allMembers.length}</span>`
                    : '<span class="muted">—</span>'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

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
  //  STATS (period metrics + team leaderboard)
  // ============================================================
  function renderStats(main, session) {
    const team = session.team;
    const myEmail = session.user.email.toLowerCase();
    const allRecords = State.recordsOfTeam(team.id);
    const myRecords = allRecords.filter(r => r.memberEmail.toLowerCase() === myEmail);
    const today = Utils.todayISO();
    const periods = Analytics.periodCounts(myRecords, today);

    // Build the leaderboard: every member of the team with their
    // all-time record count. Sort descending. The current user is
    // highlighted with .is-me so members can find themselves fast.
    const teamMembers = State.membersOfTeam(team.id);
    const leaderboard = teamMembers.map(m => {
      const count = allRecords.filter(r => r.memberEmail.toLowerCase() === m.email.toLowerCase()).length;
      return { member: m, count };
    }).sort((a, b) => b.count - a.count);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>My Stats</h2>
          <div class="ph-sub">Your numbers, plus where you stack up on the team.</div>
        </div>
      </div>

      <div class="metric-grid">
        ${metric('Today',      periods.today,                    'records logged today',  'r')}
        ${metric('This Week',  periods.thisWeek,                 'week-to-date',          'b')}
        ${metric('This Month', periods.thisMonth,                'month-to-date',         'g')}
        ${metric('All Time',   periods.allTime.toLocaleString(), 'your total',            'a')}
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Team Leaderboard</span>
          <span class="muted text-xs">${teamMembers.length} member${teamMembers.length!==1?'s':''} · all-time records</span>
        </div>
        ${leaderboard.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Member</th><th>Role</th><th>Records</th></tr></thead>
              <tbody>
                ${leaderboard.map((row, i) => {
                  const isMe = row.member.email.toLowerCase() === myEmail;
                  return `
                    <tr class="${isMe ? 'is-me' : ''}">
                      <td>${i + 1}</td>
                      <td>${escape(row.member.displayName)}${isMe ? ' <span class="pill pill-r" style="margin-left:6px;font-size:10px">you</span>' : ''}</td>
                      <td>${escape(row.member.role || '—')}</td>
                      <td><strong>${row.count.toLocaleString()}</strong></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="card-body">${emptyState('No team members yet', 'The leaderboard will populate as your team grows.', 'users')}</div>`}
      </div>
    `;
    bindLinks(main, session);
  }

  // ============================================================
  //  USERS (read-only team roster)
  // ============================================================
  function renderUsers(main, session) {
    const team = session.team;
    const myEmail = session.user.email.toLowerCase();
    const teamMembers = State.membersOfTeam(team.id);
    const manager = State.get().managers.find(m => m.email === team.managerEmail);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Team Roster</h2>
          <div class="ph-sub">${escape(team.name)} · ${teamMembers.length} member${teamMembers.length!==1?'s':''}${manager ? ' + manager' : ''}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="roster-grid">
            ${manager ? renderRosterCard(manager, 'Manager', false) : ''}
            ${teamMembers.map(m => {
              const isMe = m.email.toLowerCase() === myEmail;
              return renderRosterCard(m, m.role || 'Team Member', isMe);
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderRosterCard(person, roleLabel, isMe) {
    return `
      <div class="member-card-readonly ${isMe ? 'is-me' : ''}">
        <div class="avatar avatar-lg">${Utils.initials(person.displayName)}</div>
        <div class="mcr-name">${escape(person.displayName)}${isMe ? ' <span class="pill pill-r" style="margin-left:4px;font-size:10px">you</span>' : ''}</div>
        <div class="mcr-role">${escape(roleLabel)}</div>
      </div>
    `;
  }

  // ============================================================
  //  GOALS (last 7 days mini-bars per goal)
  // ============================================================
  function renderGoals(main, session) {
    const team = session.team;
    const myEmail = session.user.email.toLowerCase();
    const myRecords = State.recordsOfTeam(team.id).filter(r => r.memberEmail.toLowerCase() === myEmail);
    const goalsActive = Analytics.activeGoals(team);

    // Build the last 7 ISO dates (oldest → newest).
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7.push(d.toISOString().slice(0, 10));
    }

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Goals</h2>
          <div class="ph-sub">Your last 7 days against each active goal.</div>
        </div>
      </div>

      ${goalsActive.length === 0 ? `
        <div class="card">
          <div class="card-body">
            ${emptyState('No active goals', "Your manager hasn't set daily goals for your team yet.", 'check')}
          </div>
        </div>
      ` : `
        <div class="split-2">
          ${goalsActive.map(([wuId, target]) => {
            // For each of the last 7 days, count this user's records
            // for this work unit — hit if >= target.
            const days = last7.map(date => {
              const cnt = myRecords.filter(r => r.date === date && r.workUnit === wuId).length;
              return { date, cnt, hit: cnt >= target };
            });
            const hits = days.filter(d => d.hit).length;
            return `
              <div class="card">
                <div class="card-head">
                  <span class="card-title">${escape(LIBRARY.workUnitLabel(wuId, team.workUnitLabels))}</span>
                  <span class="muted text-xs">${target}/day · ${hits}/7 hit</span>
                </div>
                <div class="card-body">
                  <div class="mini-week">
                    ${days.map(d => `
                      <div class="mini-day ${d.hit ? 'hit' : 'miss'}" title="${d.date}: ${d.cnt}/${target}">
                        <div class="mini-day-label">${d.date.slice(8)}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;
  }

  // ============================================================
  //  SETTINGS (display name + password)
  // ============================================================
  function renderSettings(main, session) {
    main.innerHTML = `
      <div class="page-header">
        <div><h2>Settings</h2><div class="ph-sub">Update your profile info.</div></div>
      </div>
      <div class="card form-narrow">
        <div class="card-body">
          <div class="form-row">
            <label class="label">Display name</label>
            <input type="text" id="ms-name" value="${escape(session.user.displayName)}" placeholder="Your full name">
          </div>
          <div class="form-row">
            <label class="label">Email</label>
            <input type="email" value="${escape(session.user.email)}" disabled>
            <div class="helper">Email is your unique ID — contact your manager to change it.</div>
          </div>
          <div class="form-row">
            <label class="label">Password</label>
            <input type="password" id="ms-pass" placeholder="leave blank to keep current">
          </div>
          <div class="flex gap-8 mt-2">
            <button class="btn btn-primary" id="ms-save">${Utils.icon('check', 14)} Save Changes</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('ms-save').onclick = () => {
      const name = (document.getElementById('ms-name').value || '').trim();
      const pass = document.getElementById('ms-pass').value || '';
      if (!name) { Utils.toast('Display name required', 'bad'); return; }
      // Build a patch with ONLY the fields that actually changed.
      // Empty-string password means "keep current" — don't blow it
      // away just because the input was blank.
      const patch = {};
      if (name !== session.user.displayName) patch.displayName = name;
      if (pass) patch.password = pass;
      if (Object.keys(patch).length === 0) {
        Utils.toast('Nothing to save', 'warn');
        return;
      }
      State.updateUser(session.user.email, 'member', patch);
      Utils.toast('Saved', 'good');
      // Re-render so the new display name shows in the topbar.
      // The topbar lives in app.js — we trigger a full app-shell
      // refresh via the global event bus.
      document.dispatchEvent(new CustomEvent('app:refresh'));
    };
  }

  // ============================================================
  //  IMPORT TAB (Phase 6 part 4)
  // ============================================================
  // For members, Import is just the single-record form — bulk CSV
  // is intentionally not exposed since the CSV format requires a
  // `member` column and members shouldn't be logging against
  // teammates. They can still rapid-fire single records here.
  function renderImport(main, session) {
    renderLog(main, session);
    const ph = main.querySelector('.page-header h2');
    if (ph) ph.textContent = 'Import';
    const sub = main.querySelector('.page-header .ph-sub');
    if (sub) sub.textContent = 'Log a record for yourself';
    // Hide the cancel button — there's nothing to cancel back to on
    // the dedicated Import tab. Submit just clears + re-renders.
    const cancelBtn = main.querySelector('#lw-cancel');
    if (cancelBtn) cancelBtn.remove();
  }

  // ============================================================
  //  LOG WORK (no tab; reachable via data-go="log")
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
      tab = 'overview';
      render(session);
    };
    document.getElementById('lw-cancel').onclick = () => { tab='overview'; render(session); };
  }

  // ============================================================
  //  HISTORY (no tab; reachable via data-go="history")
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
        <div class="flex gap-8">
          <button class="btn btn-primary" id="mh-pdf">${Utils.icon('history',14)} Download My Report</button>
          <button class="btn btn-ghost" data-go="log">${Utils.icon('plus',14)} Log Work</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Quick range</span>
          <span class="muted text-xs">Sets the From/To filters below</span>
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

    // Phase 6 part 6: presets fill the From/To inputs
    main.querySelectorAll('[data-preset]').forEach(btn => {
      btn.onclick = () => {
        const [from, to] = Reports.preset(btn.dataset.preset);
        document.getElementById('mhf-from').value = from;
        document.getElementById('mhf-to').value   = to;
        apply();
      };
    });

    // Phase 6 part 6: Generate PDF report (own records, scoped to filter)
    document.getElementById('mh-pdf').onclick = () => {
      generateMemberPdf(session, team, myRecords);
    };
  }

  // ============================================================
  //  PDF REPORT GENERATION (Phase 6 part 6)
  // ============================================================
  function generateMemberPdf(session, team, myRecords) {
    // Apply current filter to my records
    let recs = Analytics.filterRecords(myRecords, [session.user], {
      ...historyFilter,
      memberEmail: '', // already filtered to "me" by upstream
    });

    const totalCount = recs.length;
    const wuSet = new Set(recs.map(r => r.workUnit));
    const dateFrom = historyFilter.dateFrom || (recs.length ? recs.map(r => r.date).sort()[0] : '—');
    const dateTo   = historyFilter.dateTo   || (recs.length ? recs.map(r => r.date).sort().slice(-1)[0] : '—');

    // Newest first
    recs = [...recs].sort((a, b) => b.date.localeCompare(a.date));

    const tableHead = ['Date', 'Work Unit', ...team.fields.slice(0, 3).map(f => {
      const def = LIBRARY.fieldDef(f);
      return def ? def.label : f;
    })];
    const tableBody = recs.map(r => {
      const row = [
        r.date,
        LIBRARY.workUnitLabel(r.workUnit, team.workUnitLabels),
      ];
      team.fields.slice(0, 3).forEach(f => {
        const v = r.fields && r.fields[f];
        row.push(v == null || v === '' ? '—' : String(v));
      });
      return row;
    });

    const filterParts = [];
    if (historyFilter.workUnit) {
      filterParts.push(`Work Unit: ${LIBRARY.workUnitLabel(historyFilter.workUnit, team.workUnitLabels)}`);
    }
    if (historyFilter.search) filterParts.push(`Search: "${historyFilter.search}"`);

    const ok = Reports.generate({
      scope: 'Member',
      companyName: State.get().company.name || 'Chargebacks911',
      reportTitle: `${session.user.displayName} — My Activity`,
      subtitle: `${team.name}${session.user.role?' · '+session.user.role:''}`,
      fromIso: dateFrom,
      toIso: dateTo,
      filterSummary: filterParts.length ? filterParts.join(' · ') : '',
      summary: [
        { label: 'My Records', value: totalCount.toLocaleString() },
        { label: 'Work Units', value: wuSet.size.toLocaleString() },
      ],
      sectionTitle: 'My Records',
      tableHead,
      tableBody,
    });
    if (ok) Utils.toast(`Report ready (${totalCount} records)`, 'good');
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
  //  SHARED RENDERERS (lifted verbatim from Phase 3 member.js)
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
