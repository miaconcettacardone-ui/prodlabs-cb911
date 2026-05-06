/* ============================================================
 *  charts.js — Chart.js builders for the dashboard
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  Every chart you see in the app — the trend line, the bar
 *  charts on the activity tab, the by-work-unit breakdowns —
 *  is built by a function in this file.
 *
 *  WHY SEPARATE FROM THE VIEWS?
 *  Chart.js has a LOT of configuration. Putting all that config
 *  inside each view would clutter them and lead to inconsistent
 *  styling. Centralizing it means:
 *    - All charts look the same (colors, fonts, tooltips)
 *    - One place to update if Chart.js changes its API
 *    - Views become readable: `Charts.trend('canvas-id', records)`
 *
 *  THE LIFECYCLE PROBLEM:
 *  Chart.js is canvas-based. If you create a chart on the same
 *  canvas TWICE without destroying the old one first, you get
 *  weird flicker, memory leaks, and tooltips on the wrong chart.
 *
 *  Our solution: every chart we make is registered in the
 *  internal `_charts` map keyed by canvas id. Calling a builder
 *  for an id that already has a chart auto-destroys the old one.
 *  Calling Charts.destroyAll() (typically at the top of a view's
 *  render() function) cleans the slate.
 *
 *  THE COLOR SYSTEM:
 *  Chart colors come from CSS variables (--cb-red, --bl, etc.)
 *  resolved at runtime. This means:
 *    - Charts use the same brand colors as the rest of the UI
 *    - Theme changes propagate without rebuilding charts
 *    - The fallback hex codes in `colors()` only kick in if the
 *      CSS variable hasn't loaded — defense for headless / test
 *      environments.
 *
 *  Depends on: CONFIG, LIBRARY, Utils, plus Chart.js (loaded via CDN)
 * ============================================================ */

const Charts = (() => {

  // =========================================================
  //  INTERNAL STATE
  // =========================================================

  // Map of canvasId -> Chart instance. Lets us track charts
  // by their host canvas so we can clean them up.
  const _charts = {};

  // =========================================================
  //  PUBLIC API: lifecycle
  // =========================================================

  // Destroy every chart we know about. Call this at the top of
  // any view's render() to ensure no leaks across re-renders.
  function destroyAll() {
    Object.keys(_charts).forEach(id => {
      try {
        _charts[id].destroy();
      } catch (_) {
        // If a chart was already detached or partially built,
        // .destroy() can throw. We don't care — we're cleaning up.
      }
      delete _charts[id];
    });
  }

  // Destroy a single chart by canvas id. Used internally before
  // creating a new chart on the same canvas.
  function destroy(canvasId) {
    if (_charts[canvasId]) {
      try { _charts[canvasId].destroy(); } catch (_) {}
      delete _charts[canvasId];
    }
  }

  // =========================================================
  //  PUBLIC API: chart builders
  // =========================================================

  // ----- Trend line chart -----------------------------------
  // Daily record counts for the last `days` (default from CONFIG).
  // Used on Overview, Activity tab, and Member dashboard.
  function trend(canvasId, records, days) {
    days = days || CONFIG.TREND_CHART_DAYS;

    // Get the canvas DOM node. If the view didn't include it
    // for some reason, bail silently — better than crashing.
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;

    // Always destroy any prior chart on this canvas first.
    destroy(canvasId);

    const c = colors();

    // Build the data arrays. We walk DAYS-1 through 0 (today).
    const labels = [], data = [];
    const today = new Date(Utils.todayISO() + 'T00:00:00');
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);

      // Pretty label like "Apr 15" for the X-axis.
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

      // Count records dated this day.
      data.push(records.filter(r => r.date === iso).length);
    }

    // Construct the Chart.js instance. We store it in _charts
    // so destroyAll() can find it later.
    _charts[canvasId] = new Chart(cv, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor:     c.red,
          // Translucent fill underneath the line — the soft red
          // tint that gives the chart visual weight.
          backgroundColor: hexToRgba(c.red, 0.12),
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,            // 0 = jagged, 1 = wavy. 0.35 is "smooth but honest".
          pointRadius: 0,           // hide the dots (cleaner line)
          pointHoverRadius: 5,      // show them on hover
          pointHoverBackgroundColor: c.red,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        }],
      },
      options: commonOpts(),
    });
  }

  // ----- By Work Unit (horizontal bar chart) ----------------
  // Counts records by their workUnit field, sorted descending.
  function byWorkUnit(canvasId, team, records) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;
    destroy(canvasId);

    // Step 1: count records per work unit.
    // We use a plain object as a count map: { 'chargeback_case': 5, ... }.
    const counts = {};
    records.forEach(r => {
      counts[r.workUnit] = (counts[r.workUnit] || 0) + 1;
    });

    // Step 2: sort by count descending and split into labels + data arrays.
    // Object.entries gives us [['chargeback_case', 5], ['representment', 3]].
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    // Use the team's custom labels if they have any (e.g. they
    // might rename "Chargeback Case" to "Dispute"), otherwise
    // fall back to the library default.
    const labels = entries.map(([id]) => LIBRARY.workUnitLabel(id, team.workUnitLabels));
    const data   = entries.map(([, n]) => n);

    // Color each bar a different color from the palette.
    // Wraparound with modulo so we never run out of colors.
    const palette = paletteCycle();
    const bg = data.map((_, i) => palette[i % palette.length]);

    _charts[canvasId] = new Chart(cv, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: bg,
          borderRadius: 6,         // rounded bars match the rest of the UI
          maxBarThickness: 38,     // cap thickness so bars don't get fat with few items
        }]
      },
      // indexAxis: 'y' is the magic that makes bars HORIZONTAL.
      options: { ...commonOpts(), indexAxis: 'y' },
    });
  }

  // ----- By Member (horizontal bar chart) -------------------
  // Same shape as byWorkUnit but bars are members instead of units.
  function byMember(canvasId, members, records) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;
    destroy(canvasId);

    const counts = members.map(m => ({
      name: m.displayName,
      n: records.filter(r =>
        r.memberEmail.toLowerCase() === m.email.toLowerCase()
      ).length,
    })).sort((a, b) => b.n - a.n);

    const labels = counts.map(x => x.name);
    const data   = counts.map(x => x.n);
    const palette = paletteCycle();
    const bg = data.map((_, i) => palette[i % palette.length]);

    _charts[canvasId] = new Chart(cv, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: 6, maxBarThickness: 38 }] },
      options: { ...commonOpts(), indexAxis: 'y' },
    });
  }

  // ----- Day of Week pattern (vertical bar chart) -----------
  // "Which days of the week does this team work hardest?"
  // Reorders Sun..Sat into Mon..Sun so business days lead.
  function dayOfWeek(canvasId, records) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;
    destroy(canvasId);
    const c = colors();

    // counts[0] = Sunday, counts[1] = Monday, etc. — JS convention.
    const counts = [0, 0, 0, 0, 0, 0, 0];
    records.forEach(r => {
      const [y, mo, d] = r.date.split('-').map(Number);
      const dt = new Date(y, mo - 1, d);
      counts[dt.getDay()]++;
    });

    // Reorder to Mon-first. Index 1 (Mon) goes first, ..., 0 (Sun) goes last.
    const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const data = [counts[1], counts[2], counts[3], counts[4], counts[5], counts[6], counts[0]];

    _charts[canvasId] = new Chart(cv, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: c.red, borderRadius: 6, maxBarThickness: 38 }] },
      options: commonOpts(),
    });
  }

  // =========================================================
  //  PRIVATE: color & options helpers
  // =========================================================

  // Resolve all our brand colors from CSS variables at runtime.
  // The fallback hex codes are belt-and-suspenders: if a CSS
  // variable hasn't loaded (rare but possible), we use the hex.
  function colors() {
    return {
      red:    css('--cb-red')    || '#e63946',
      redDk:  css('--cb-red-dk') || '#c92836',
      gold:   css('--cb-gold')   || '#f5a623',
      blue:   css('--bl')        || '#2563eb',
      green:  css('--gr')        || '#10b981',
      purple: css('--pu')        || '#7c3aed',
      orange: css('--cb-orange') || '#ff6b3d',
      ink:    css('--ink')       || '#0b1220',
      i2:     css('--i2')        || '#4a5568',
      i3:     css('--i3')        || '#8a94a6',
      bor:    css('--bor')       || '#e0e6ef',
    };
  }

  // Read a single CSS variable's value from the :root selector.
  // getComputedStyle returns the resolved (final) value of the
  // variable, after any cascade and overrides have applied.
  function css(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  // Resolve the chart palette CSS variable names to actual color values.
  function paletteCycle() {
    return CONFIG.CHART_PALETTE_VARS.map(v => css(v) || '#999');
  }

  // The shared options block used by ALL charts.
  // Centralizing this means every chart has the same look.
  function commonOpts() {
    const c = colors();
    return {
      responsive: true,
      maintainAspectRatio: false,  // we control aspect via .chart-wrap CSS

      plugins: {
        legend: { display: false },  // we never use Chart.js legends — too noisy
        tooltip: {
          // Make tooltips look like dark pills instead of the
          // default Chart.js white-on-grey.
          backgroundColor: c.ink,
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 8,
          displayColors: false,    // hide the little color square next to the value
          titleFont: { family: css('--font-display') || 'Sora', weight: '700' },
          bodyFont:  { family: css('--font-body')    || 'Inter' },
        },
      },

      scales: {
        x: {
          grid: { display: false },     // no vertical gridlines (cleaner)
          ticks: { color: c.i2, font: { size: 11 } },
        },
        y: {
          beginAtZero: true,            // bars always start from 0
          grid: { color: c.bor },       // light horizontal gridlines
          ticks: {
            color: c.i2,
            font: { size: 11 },
            precision: 0                 // integer ticks only — record counts are whole numbers
          },
        },
      },
    };
  }

  // Convert "#e63946" + 0.12 to "rgba(230,57,70,0.12)".
  // We need this for the trend chart's translucent fill, which
  // Chart.js can't compute itself.
  function hexToRgba(hex, alpha) {
    // The regex accepts 3 or 6 hex digits. Strip any leading "#".
    const m = String(hex || '').replace('#', '').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);

    // Bail with brand red if the input is malformed.
    if (!m) return `rgba(230,57,70,${alpha})`;

    let h = m[1];
    // If it's the short 3-digit form, expand it: "f0a" -> "ff00aa".
    if (h.length === 3) h = h.split('').map(c => c + c).join('');

    // Parse each pair of hex digits as a decimal byte.
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // =========================================================
  //  PUBLIC API
  // =========================================================
  return { destroyAll, destroy, trend, byWorkUnit, byMember, dayOfWeek };

})();
