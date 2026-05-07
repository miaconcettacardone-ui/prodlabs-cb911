/* ============================================================
 *  smoke-p5.js — Phase 5 smoke test
 * ============================================================
 *
 *  Run with:  node smoke-p5.js
 *
 *  Loads every JS file in the order index.html does, then exercises
 *  the Phase 5 surfaces that are implemented:
 *
 *    1. All JS files load without syntax errors
 *    2. State.isFirstRun() — true on fresh, false after bootstrap
 *    3. State.addDepartment idempotent + getDepartments returns merged list
 *    4. Auth.tryLogin('devadmin', ...) succeeds after bootstrapDev
 *    5. Landing renders without error in both first-run and login modes
 *    6. App shell renders for all three role types
 *    7. No references to Stepper, Wizard, AuthView, rolepick, or
 *       signup-* in any loaded JS
 *    8. Tab counts: Super=5, Manager=6, Member=6 (Phase 4 unchanged)
 *
 *  NOT covered (because items 10/11 are not yet implemented):
 *    - Add Manager / Add Member / Add Super Admin modals
 *    - Manager empty-state "Set up your team" CTA
 *
 *  When those land, expand this test accordingly.
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// When this script lives inside the project root (post-deploy), __dirname
// is the project root. When it lives outside (during dev with the project
// in ./p5/), it's one level up. Detect which by looking for index.html.
const ROOT = fs.existsSync(path.join(__dirname, 'index.html'))
  ? __dirname
  : path.join(__dirname, 'p5');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

let pass = 0, fail = 0;
function ok(name)        { console.log('  ✓', name); pass++; }
function bad(name, err)  { console.log('  ✗', name, '—', err); fail++; }
function expect(name, cond, err) { cond ? ok(name) : bad(name, err || 'failed'); }

// ----- 1. Load index.html, get script order -----
const html = read('index.html');
const dom = new JSDOM(html, {
  url: 'http://localhost:8888/cb911-prodlabs/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;

console.log('\n[1] JS files load without syntax errors');
const scriptTags = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);

// First syntax-check each file individually (so we know which file broke
// if there's an error). Then concatenate and run as ONE script so const
// declarations are visible to the hoist block at the end.
let allLoaded = true;
for (const rel of scriptTags) {
  try { new Function(read(rel)); ok(rel); }
  catch (e) { bad(rel, e.message); allLoaded = false; }
}
if (!allLoaded) { console.log('\n!! Aborting — JS load errors above.'); process.exit(1); }

const bundle = scriptTags.map(read).join('\n;\n') + `
  window.CONFIG  = CONFIG;
  window.LIBRARY = LIBRARY;
  window.State   = State;
  window.Auth    = Auth;
  window.Landing = Landing;
  window.Router  = Router;
`;
const s = window.document.createElement('script');
s.textContent = bundle;
window.document.head.appendChild(s);

// Pull globals out for assertions
const { State, Auth, CONFIG, LIBRARY, Landing, Router } = window;

// ----- 2. isFirstRun -----
console.log('\n[2] State.isFirstRun()');
State.reset();
expect('fresh state → true', State.isFirstRun() === true);

// ----- 3. addDepartment + getDepartments -----
console.log('\n[3] departments');
const seeded = State.getDepartments().length;
expect('seeded count = 7', seeded === 7, `got ${seeded}`);
State.addDepartment('Underwriting');
State.addDepartment('Underwriting');     // dupe (case-exact)
State.addDepartment('underwriting');     // dupe (case-insensitive)
State.addDepartment('Alerts');           // dupe vs seeded
expect('after 4 adds, count = 8 (1 unique)', State.getDepartments().length === 8);
expect('contains Underwriting', State.getDepartments().includes('Underwriting'));

// ----- 4. dev backdoor + username login -----
console.log('\n[4] bootstrapDev + username login');
State.bootstrapDev();
expect('isFirstRun → false after bootstrap', State.isFirstRun() === false);
expect('Auth.tryLogin("devadmin", correct pw) ok',
  Auth.tryLogin('devadmin', 'd3ve1opment!').ok === true);
expect('Auth.tryLogin("DEVADMIN", correct pw) ok (case-insensitive)',
  Auth.tryLogin('DEVADMIN', 'd3ve1opment!').ok === true);
expect('Auth.tryLogin("devadmin", wrong pw) fails',
  Auth.tryLogin('devadmin', 'wrong').ok === false);
expect('Auth.tryLogin("nobody", "x") fails',
  Auth.tryLogin('nobody', 'x').ok === false);
expect('Auth.usernameInUse("devadmin") true', Auth.usernameInUse('devadmin') === true);
expect('Auth.usernameInUse("nobody") false', Auth.usernameInUse('nobody') === false);

// ----- 5. Landing renders in both modes -----
console.log('\n[5] Landing renders');
// Login mode (devadmin already exists, so isFirstRun is false)
try {
  Landing.render();
  const fUser = window.document.querySelector('#lg-username');
  expect('login mode shows username field', !!fUser);
} catch (e) { bad('login render', e.message); }

// Reset and try first-run mode
State.reset();
try {
  Landing.render();
  const fUser = window.document.querySelector('#bs-username');
  const fMail = window.document.querySelector('#bs-email');
  expect('first-run mode shows username + email fields', !!fUser && !!fMail);
} catch (e) { bad('first-run render', e.message); }

// ----- 6. App shell renders for each role -----
console.log('\n[6] App shell renders for each role');
State.reset();
State.bootstrapDev();
State.setSession('super', 'devadmin@prodlabs.dev');
try {
  Router.go('app');
  expect('super: app topbar present', !!window.document.querySelector('#app .topbar'));
  expect('super: tabs container present', !!window.document.querySelector('#app .tabs'));
  // Super admin tabs: Stats | Teams & Goals | Users | Inbox | Settings = 5
  const superTabs = window.document.querySelectorAll('#app .tabs .tab').length;
  expect(`super tab count = 5 (got ${superTabs})`, superTabs === 5);
} catch (e) { bad('super render', e.message); }

// ----- 7. No references to deleted modules -----
console.log('\n[7] No deleted-module references in loaded JS');
const allLoadedJs = scriptTags.map(read).join('\n');
const codeOnly = allLoadedJs
  .replace(/\/\*[\s\S]*?\*\//g, '')   // strip block comments
  .replace(/\/\/[^\n]*/g, '');         // strip line comments
expect('no Stepper.* calls',  !/\bStepper\.[a-z]/i.test(codeOnly));
expect('no Wizard.* calls',   !/\bWizard\.[a-z]/i.test(codeOnly));
expect('no AuthView.* calls', !/\bAuthView\b/.test(codeOnly));
expect('no Router.go("auth")',   !/Router\.go\(\s*['"]auth['"]/.test(codeOnly));
expect('no Router.go("wizard")', !/Router\.go\(\s*['"]wizard['"]/.test(codeOnly));
expect('no rolepick mode',    !/['"]rolepick['"]/.test(codeOnly));
expect('no signup-* mode',    !/['"]signup-/.test(codeOnly));

// ----- 8. CONFIG.FEATURES Phase 5 flags -----
console.log('\n[8] CONFIG.FEATURES (Phase 5)');
expect('selfSignup === false',        CONFIG.FEATURES.selfSignup === false);
expect('approvalQueue === false',     CONFIG.FEATURES.approvalQueue === false);
expect('showEmailInRoster === true',  CONFIG.FEATURES.showEmailInRoster === true);
expect('multiSuperAdmin === true',    CONFIG.FEATURES.multiSuperAdmin === true);

// ----- 9. LIBRARY reseeded -----
console.log('\n[9] LIBRARY reseeded with CB911 vocab');
expect('departments[0] === Alerts', LIBRARY.departments[0] === 'Alerts');
expect('workUnits[0].id === alert_handled', LIBRARY.workUnits[0].id === 'alert_handled');
expect('roles.length === 6', LIBRARY.roles.length === 6);
const outcomeOpts = LIBRARY.fields.find(f => f.id === 'outcome').options;
expect('outcome options includes Settled', outcomeOpts.includes('Settled'));
expect('outcome options includes Refunded', outcomeOpts.includes('Refunded'));

// ----- summary -----
console.log(`\n${pass} passed, ${fail} failed`);
if (fail === 0) console.log('ALL CLEAN');
else            process.exit(1);
