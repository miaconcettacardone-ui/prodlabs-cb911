/* ============================================================
 *  analytics.js — pure data math helpers
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  All the calculations the dashboard does — computing today's
 *  count, building leaderboards, filtering records by date,
 *  sorting tables — live here, not inside the views.
 *
 *  WHY SEPARATE FROM THE VIEWS?
 *  Two huge wins:
 *  1) "Pure" functions are easy to test. You give them inputs,
 *     they return outputs, no DOM, no side effects. The Laravel
 *     dev team can port these directly to PHP/SQL.
 *  2) Multiple views (manager dashboard, member dashboard, super
 *     admin overview) all share the same math. If we put the
 *     math in one view we'd have to copy-paste it.
 *
 *  THE "PURE FUNCTION" RULE:
 *  Every function in this file:
 *    - Takes its inputs as arguments
 *    - Reads NOTHING from the DOM
 *    - Reads NOTHING from globals (except CONFIG and Utils)
 *    - Mutates NOTHING — doesn't change its arguments
 *    - Returns its result
 *  This makes them trivially safe to test, reuse, and port.
 *
 *  Depends on: CONFIG (from config.js), Utils (from utils.js)
 * ============================================================ */

const Analytics = (() => {

  // =========================================================
  //  DATE HELPERS
  // =========================================================

  // Given an ISO date string like "2026-04-15", returns the ISO
  // date string of the start of that week.
  //
  // "Start of the week" depends on CONFIG.WEEK_START:
  //   1 = Monday  (so Apr 15 2026, a Wednesday, returns Apr 13)
  //   0 = Sunday  (so Apr 15 2026 returns Apr 12)
  //
  // WHY WE NEED THIS:
  // The "This Week" metric tile and any week-over-week chart
  // need a consistent definition of "this week". Doing it in
  // one place means we never have a bug where the dashboard
  // says one thing and a chart says another.
  function startOfWeekISO(isoDate) {
    // Parse the ISO string into a real Date object.
    // We split and map-Number rather than `new Date(isoDate)`
    // because the latter has timezone surprises in some
    // browsers — the explicit constructor is rock solid.
    const [y, mo, d] = isoDate.split('-').map(Number);
    const dt = new Date(y, mo - 1, d); // month is 0-indexed in JS
    const day = dt.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

    // How many days do we need to go BACK to hit the week start?
    let diff;
    if (CONFIG.WEEK_START === 1) {
      // Monday-start: if today is Sunday (0), go back 6 days.
      // Otherwise go back (day - 1) days.
      diff = (day === 0 ? -6 : 1 - day);
    } else {
      // Sunday-start: just go back `day` days. Sun -> 0, Mon -> -1, etc.
      diff = -day;
    }
    dt.setDate(dt.getDate() + diff);

    // Return as ISO date string ("YYYY-MM-DD"). We slice off
    // the time portion because we only care about the date.
    return dt.toISOString().slice(0, 10);
  }

  // Add `delta` days to an ISO date string, return new ISO string.
  // delta can be negative (subtracts days) or positive.
  // Example: shiftDays('2026-04-15', -7) => '2026-04-08'
  function shiftDays(isoDate, delta) {
    const d = new Date(isoDate + 'T00:00:00'); // anchor at midnight
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  // Build an array of N consecutive ISO date strings ending at
  // `endIso` (defaults to today).
  // Example: lastNDays(3) on Apr 15 => ['2026-04-13','2026-04-14','2026-04-15']
  // Used by the goal-hit-rate calculation to walk through the
  // trailing window day by day.
  function lastNDays(n, endIso) {
    endIso = endIso || Utils.todayISO();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      out.push(shiftDays(endIso, -i));
    }
    return out;
  }

  // =========================================================
  //  PERIOD BUCKETING
  // =========================================================

  // Returns the four metric tile counts at once:
  //   { today, thisWeek, thisMonth, allTime }
  //
  // The ref date defaults to today but can be overridden for testing
  // or for "what would the dashboard have shown last Tuesday?"
  function periodCounts(records, refIsoDate) {
    refIsoDate = refIsoDate || Utils.todayISO();
    const weekStart = startOfWeekISO(refIsoDate);

    // monthPfx is "YYYY-MM" — we use it with .startsWith() to
    // match any record whose date is in the same calendar month.
    // Cheap trick that avoids parsing dates in the filter.
    const monthPfx = refIsoDate.slice(0, 7);

    return {
      today:     records.filter(r => r.date === refIsoDate).length,
      thisWeek:  records.filter(r => r.date >= weekStart && r.date <= refIsoDate).length,
      thisMonth: records.filter(r => r.date.startsWith(monthPfx)).length,
      allTime:   records.length,
    };
  }

  // =========================================================
  //  GOALS
  // =========================================================

  // Return the team's active goals as an array of [workUnitId, target]
  // pairs. Filters out any goal with target = 0 (which means
  // "no goal for this work unit").
  //
  // Why this exists as a helper: many places in the UI need to
  // know "which work units have goals?" — the overview's progress
  // bars, the leaderboard, the member dashboard. Centralizing
  // the "active = v > 0" check means there's only one place to
  // update if we ever change what "active" means.
  function activeGoals(team) {
    return Object.entries(team.goals || {}).filter(([id, v]) => v > 0);
  }

  // For a single member on a single date: what % of their goals
  // did they hit?
  //   100 = hit all of them (or more)
  //    50 = hit half
  //   null = team has no goals defined
  //
  // "Hit a goal" means: logged at least `target` records of that
  // work unit on that date. We're strict — partial credit isn't
  // a thing here. (The Laravel rebuild may want to reconsider.)
  function memberGoalHitPctForDate(team, member, allRecords, isoDate) {
    const goals = activeGoals(team);
    if (!goals.length) return null;

    // Filter once to just this member's records on this date.
    // Using toLowerCase on emails because email matching should
    // be case-insensitive (Mia@example.com === mia@example.com).
    const myToday = allRecords.filter(r =>
      r.memberEmail.toLowerCase() === member.email.toLowerCase() &&
      r.date === isoDate
    );

    // Count how many of their goals they met or exceeded.
    const hits = goals.filter(([id, target]) =>
      myToday.filter(r => r.workUnit === id).length >= target
    ).length;

    return Math.round((hits / goals.length) * 100);
  }

  // =========================================================
  //  LEADERBOARDS
  // =========================================================

  // "Top Performers" — sort members by raw count of records
  // in the given window. Returns up to CONFIG.LEADERBOARD_SIZE
  // entries.
  //
  // Each entry has:
  //   { email, name, value, display, pct }
  // where `pct` is the bar width relative to the top performer
  // (top = 100%, second = however much they have / top * 100, etc).
  function buildTopByTotal(members, records) {
    // Step 1: count records for each member.
    const rows = members.map(m => {
      const n = records.filter(r =>
        r.memberEmail.toLowerCase() === m.email.toLowerCase()
      ).length;
      return {
        email: m.email,
        name: m.displayName,
        value: n,
        display: n.toLocaleString() // formats 1234 -> "1,234"
      };
    })
    // Step 2: sort by count desc, take top N.
    .sort((a, b) => b.value - a.value)
    .slice(0, CONFIG.LEADERBOARD_SIZE);

    // Step 3: compute bar width for each row.
    // Math.max(1, ...) prevents divide-by-zero if everyone has 0.
    const max = Math.max(1, ...rows.map(r => r.value));
    rows.forEach(r => r.pct = Math.round((r.value / max) * 100));

    return rows;
  }

  // "Goal Hit Rate" leaderboard — what % of all (member, day, goal)
  // cells were hit, over the trailing CONFIG.GOAL_HIT_RATE_DAYS window?
  //
  // Example: 14-day window, 3 active goals, 1 member.
  // Total cells = 14 * 3 = 42. If they hit 30 of them, that's 71%.
  //
  // This is a STRICT metric — missed days count as misses. PTO
  // is not handled (see SPEC.md). Production may want to subtract
  // approved-leave days from the denominator.
  function buildGoalHitRate(team, members, allRecords) {
    const goals = activeGoals(team);

    // Edge case: no goals or no members? Return empty list.
    // The view will show an empty state instead of a blank card.
    if (!goals.length || !members.length) return [];

    const days = lastNDays(CONFIG.GOAL_HIT_RATE_DAYS);

    const rows = members.map(m => {
      let hits = 0, total = 0;

      // Pre-filter to just this member's records once, instead
      // of filtering inside the inner loop. This is much faster
      // when a team has 1000s of records.
      const myRecs = allRecords.filter(r =>
        r.memberEmail.toLowerCase() === m.email.toLowerCase()
      );

      // Walk every day × goal cell.
      days.forEach(d => {
        goals.forEach(([id, target]) => {
          total++;
          // Did they hit this goal on this day?
          const done = myRecs.filter(r => r.date === d && r.workUnit === id).length;
          if (done >= target) hits++;
        });
      });

      const pct = total ? Math.round((hits / total) * 100) : 0;
      return {
        email: m.email,
        name: m.displayName,
        value: pct,
        display: pct + '%',
        pct: pct  // bar width is also pct, so we pass it through
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, CONFIG.LEADERBOARD_SIZE);

    return rows;
  }

  // =========================================================
  //  FILTER & SORT (used by activity table)
  // =========================================================

  // Apply a set of filters to a records array. The filter object
  // has these (all optional) fields:
  //   - search: substring match across many fields
  //   - memberEmail: exact match
  //   - workUnit: exact match
  //   - dateFrom, dateTo: ISO date range (inclusive both ends)
  //
  // All filters are AND-combined. Empty/missing filters are skipped.
  function filterRecords(records, members, f) {
    const q = (f.search || '').trim().toLowerCase();

    return records.filter(r => {
      // Each early-return below means "this record fails this
      // filter, so it's not in the result".

      if (f.memberEmail && r.memberEmail.toLowerCase() !== f.memberEmail.toLowerCase()) return false;
      if (f.workUnit && r.workUnit !== f.workUnit) return false;
      if (f.dateFrom && r.date < f.dateFrom) return false;  // ISO strings sort correctly as text
      if (f.dateTo   && r.date > f.dateTo)   return false;

      // Search filter is a "haystack/needle" match. We assemble
      // a single string from all searchable fields and check if
      // the search query appears anywhere in it. This is cheap
      // and works for the prototype; production should index.
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

      return true;  // record passed every filter
    });
  }

  // Sort records by one of: date, member name, work unit, amount.
  // sortSpec = { col: 'date'|'member'|'workUnit'|'amount', dir: 'asc'|'desc' }
  //
  // We use .slice() before sort because Array.sort mutates the
  // array. Returning a sorted COPY is safer — the caller's
  // original array is untouched.
  function sortRecords(records, members, sortSpec) {
    const col = sortSpec.col;
    const dir = sortSpec.dir === 'asc' ? 1 : -1;  // multiplier flips the comparison

    // Helper: look up a member's display name by email.
    // Falls back to the email itself (lowercased) if the member
    // is no longer on the team — so "deleted" records still sort.
    const memberName = (email) => {
      const m = members.find(x => x.email.toLowerCase() === email.toLowerCase());
      return m ? m.displayName.toLowerCase() : email.toLowerCase();
    };

    return records.slice().sort((a, b) => {
      let av, bv;
      switch (col) {
        case 'member':
          av = memberName(a.memberEmail);
          bv = memberName(b.memberEmail);
          break;
        case 'workUnit':
          av = a.workUnit;
          bv = b.workUnit;
          break;
        case 'amount':
          // Coerce to Number so "100" sorts as 100, not as a string.
          // (String sort would put "10" before "9" — surprise bug.)
          av = Number(a.fields?.amount || 0);
          bv = Number(b.fields?.amount || 0);
          break;
        case 'date':
        default:
          av = a.date;  // ISO date strings compare correctly as strings
          bv = b.date;
          break;
      }

      // The classic 3-way comparator: -1 / 0 / +1.
      // The `* dir` flips it for descending.
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
    });
  }

  // =========================================================
  //  PUBLIC API
  // =========================================================
  // Anything in the returned object is callable from other
  // modules as Analytics.X. Anything NOT in the object is
  // private to this file (the IIFE pattern).
  return {
    startOfWeekISO,
    shiftDays,
    lastNDays,
    periodCounts,
    activeGoals,
    memberGoalHitPctForDate,
    buildTopByTotal,
    buildGoalHitRate,
    filterRecords,
    sortRecords,
  };

})();
