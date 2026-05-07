/* ============================================================
 *  config.js — central configuration for the ProdLabs prototype
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  This is the "control panel" for the whole app. Every magic
 *  number, threshold, time window, and feature toggle lives here.
 *  If you ever want to change "how many days the trend chart shows",
 *  or "should members be able to delete their own records",
 *  you change it HERE — not buried inside a view file.
 *
 *  WHY ONE FILE FOR ALL CONSTANTS?
 *  Two reasons:
 *  1) When the Laravel dev team rebuilds this, they'll know
 *     exactly what's tunable and what isn't.
 *  2) When you (Mia) want to tweak something later, you don't
 *     have to search 15 files for a number — it's all here.
 *
 *  HOW IT WORKS:
 *  This file declares one big global called CONFIG. Every
 *  other file in the app reads from CONFIG.* (e.g. CONFIG.STORAGE_KEY,
 *  CONFIG.FEATURES.csvImport). Because this script is loaded
 *  FIRST in index.html, every later file can use CONFIG safely.
 *
 *  IMPORTANT FOR ANYONE EDITING:
 *  The order of <script> tags in index.html matters. config.js
 *  must load before everything else that reads from it.
 * ============================================================ */

const CONFIG = {

  // ----- Storage --------------------------------------------
  // The key under which we save the entire app state to the
  // browser's localStorage. Think of localStorage as "a tiny
  // database that lives in your browser, just for this site."
  //
  // The "_v2" at the end is a version marker. If we ever change
  // the data shape in a way that would break old saved data,
  // we bump it to "_v3" so existing browsers start fresh
  // instead of crashing on the old format.
  STORAGE_KEY: 'prodlabs_cb911_v2',

  // ----- Branding -------------------------------------------
  // Used in the topbar, document title, etc. Hardcoded for the
  // prototype because this is single-tenant. Production will
  // pull these from the company record in the database.
  BRAND: {
    company:     'Chargebacks911',
    productName: 'ProdLabs',
    tagline:     'Internal productivity platform',
  },

  // ----- Date / Time logic ----------------------------------
  // What day does the "week" start on?
  //   1 = Monday  (ISO 8601 — most business reporting)
  //   0 = Sunday  (US calendar convention)
  // We default to Monday because business reporting almost
  // always uses Mon-Sun weeks. Production should expose this
  // as a per-company setting.
  WEEK_START: 1,

  // ----- Analytics windows ----------------------------------
  // The Overview "Records — Last 30 Days" chart spans this many days.
  // Change this to 60 to get a 2-month chart. The chart label
  // updates automatically because it reads from CONFIG.
  TREND_CHART_DAYS:        30,

  // The "Goal Hit Rate" leaderboard looks at the trailing N days.
  // 14 days = "the last two business weeks", a common sweet spot:
  // long enough to smooth out one bad day, short enough to be
  // current.
  GOAL_HIT_RATE_DAYS:      14,

  // The "Top Performers" leaderboard window. null = use
  // month-to-date (resets at the 1st of the month). If you set
  // this to 30, it would become a rolling 30-day window instead.
  TOP_PERFORMERS_DAYS:     null,

  // ----- UI tunables ----------------------------------------
  LEADERBOARD_SIZE:        5,    // top-N to show in any leaderboard
  RECENT_ACTIVITY_SIZE:    10,   // overview "recent activity" preview
  MEMBER_DETAIL_HISTORY:   50,   // records on member-drill-down page
  ACTIVITY_TABLE_CAP:      200,  // max rows shown before forcing filter
  RECORDS_PAGE_SIZE:       50,   // for future server-side pagination

  // ----- CSV import -----------------------------------------
  CSV_MAX_ROWS: 5000,            // hard cap on a single paste-import

  // The columns a CSV must have, no matter what. Member's pasted
  // CSVs can have ANY other columns, but these three are required
  // because without them we can't even create a record.
  CSV_REQUIRED_COLUMNS: ['date', 'member', 'workUnit'],

  // Which date formats we accept in pasted CSVs. The parser tries
  // each in order. We're forgiving on purpose — managers paste
  // from Excel and Google Sheets where dates can look anything.
  CSV_DATE_FORMATS: ['YYYY-MM-DD', 'MM/DD/YYYY', 'M/D/YYYY', 'M/D/YY'],

  // ----- Feature flags --------------------------------------
  // FEATURE FLAGS are switches that turn whole features on or off
  // WITHOUT removing the code. Useful for:
  //   - Soft-launching a feature (build it, hide it, test it,
  //     then flip it on for users)
  //   - Hiding a feature you might re-enable later
  //   - Different features for different customers (in production)
  //
  // The convention: code that uses a flag should check it BOTH
  // when rendering UI ("should I show this button?") AND when
  // handling actions ("should I run this code if called?").
  // That's "defense in depth" — even if someone bypasses the UI,
  // the action handler still refuses.
  FEATURES: {
    csvImport:               true,   // bulk paste-import on Activity tab
    editRecords:             true,   // pencil-icon edit buttons
    deleteRecords:           true,   // trash-icon delete buttons (manager)
    memberSelfDelete:        true,   // members can delete their own records (Phase 5)
    superCrossTeamReporting: true,   // company-wide analytics for super admins

    // Phase 5 additions
    selfSignup:              false,  // landing/AuthView no longer expose signup;
                                     // flip true to re-enable wizard for Laravel
    approvalQueue:           false,  // Inbox approvals UI hidden; data layer kept
    showEmailInRoster:       true,   // decision #9 — email visible everywhere
    multiSuperAdmin:         true,   // decision #4 — equal super admins
  },

  // ----- Validation -----------------------------------------
  PASSWORD_MIN_LENGTH:    8,
  TEAM_NAME_MIN_LENGTH:   2,
  TEAM_NAME_MAX_LENGTH:   50,

  // ----- Toast / UX timing ----------------------------------
  TOAST_DURATION_MS: 3500,   // how long a toast (the little popup
                             // at the bottom-right) stays visible
  DEBOUNCE_MS_INPUT: 200,    // how long to wait after a user stops
                             // typing before re-running a search

  // ----- Chart palette --------------------------------------
  // Charts cycle through this list of CSS variable names for
  // their bar/line colors. We use VARIABLE NAMES (not hex codes)
  // so the colors come from the theme — change the theme in
  // styles.css and the charts re-color automatically.
  //
  // The variables resolve at runtime in charts.js via getComputedStyle.
  CHART_PALETTE_VARS: [
    '--cb-red',     // brand primary (Chargebacks911 red)
    '--bl',         // blue
    '--cb-gold',    // brand accent (gold/amber)
    '--gr',         // green
    '--pu',         // purple
    '--cb-orange',  // brand orange
    '--cb-red-dk',  // brand red, darker
    '--i2'          // ink (text) secondary
  ],

};
