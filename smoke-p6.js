/* ============================================================
 *  smoke-p6.js — Phase 6 (parts 1, 2, 3, 4, 5, 6) smoke test
 * ============================================================
 *
 *  Run with:  node smoke-p6.js
 *
 *  Loads every JS file in the order index.html does, then exercises
 *  Phase 5 + Phase 6 (part 1) surfaces:
 *
 *    1. All JS files load without syntax errors
 *    2. State.isFirstRun() — true on fresh, false after bootstrap
 *    3. State.addDepartment idempotent + getDepartments returns merged list
 *    4. Auth.tryLogin('devadmin', ...) succeeds after bootstrapDev
 *    5. Landing renders — login mode uses two-column split layout with
 *       value-prop bullets; first-run mode keeps single-column form
 *    6. Phase 6 IA: super=8 tabs, manager=8 tabs, member=6 tabs;
 *       member explicitly excludes 'stats' and 'users' per sketch
 *    7. No references to Stepper, Wizard, AuthView, rolepick, or
 *       signup-* in any loaded JS
 *    8. CONFIG.FEATURES Phase 5 flags
 *    9. LIBRARY reseeded with CB911 vocab
 *   10. Tab content renders without throwing for every role x tab
 *   11. Phase 6 part 2: unified Add User modal + edit/delete on
 *       admin Users tab (role picker, manager team flow with new-team
 *       sub-flow + new-department, member flow with team+role,
 *       super admin flow, validation rejecting duplicates)
 *   12. Phase 6 part 3: team-setup wizard from Settings tab
 *       (6-step flow, custom add at each picker step, cancel-mid-flow
 *       doesn't persist, manager mode pre-fills own team)
 *   13. Phase 6 part 4: real Import tab + manager empty-state CTA
 *       (manager Dashboard CTA when team unconfigured, manager Import
 *       has both single-record + inline bulk CSV, member Import has
 *       single-record only, super admin Import has team picker, full
 *       end-to-end validate-and-commit on bulk import)
 *   14. Phase 6 part 5: real Dashboard for all 3 roles
 *       (admin: dept/team/user filter bar with cascade, 6 metric
 *       cards, cross-team leaderboard; manager: member filter narrows
 *       all metrics; member: "you vs team" rank card, hides for
 *       solo teams)
 *   15. Phase 6 part 6: real History tab + PDF reports (all 3 roles)
 *       (Reports module with jsPDF + autotable, date-range presets,
 *       filterByRange, admin: full filter bar + PDF, manager: relabeled
 *       Activity → History + PDF, member: Download Report; jsPDF mocked
 *       in test runner since CDN can't load in JSDOM)
 *
 *  Phase 6 is now feature-complete. Future phases would target
 *  the Laravel backend integration described in SPEC.md.
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// When this script lives inside the project root (post-deploy), __dirname
// is the project root. When it lives outside (during dev with the project
// in ./p6/), it's one level up. Detect which by looking for index.html.
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
  window.Utils   = Utils;
  window.WizardSettings = WizardSettings;
  window.Reports = Reports;
  window.Landing = Landing;
  window.Router  = Router;
`;
const s = window.document.createElement('script');
s.textContent = bundle;
window.document.head.appendChild(s);

// Pull globals out for assertions
const { State, Auth, CONFIG, LIBRARY, Landing, Router, Utils, WizardSettings, Reports } = window;

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
  // Phase 6: two-column login layout
  expect('login mode uses split layout', !!window.document.querySelector('.land-split'));
  expect('login mode shows value-prop bullets',
    window.document.querySelectorAll('.land-bullets li').length >= 4);
} catch (e) { bad('login render', e.message); }

// Reset and try first-run mode
State.reset();
try {
  Landing.render();
  const fUser = window.document.querySelector('#bs-username');
  const fMail = window.document.querySelector('#bs-email');
  expect('first-run mode shows username + email fields', !!fUser && !!fMail);
  // First run keeps the tight (single-column) layout
  expect('first-run mode does NOT use split layout',
    !window.document.querySelector('.land-split'));
} catch (e) { bad('first-run render', e.message); }

// ----- 6. App shell + Phase 6 tab counts per role -----
console.log('\n[6] App shell renders + Phase 6 tab structure');
State.reset();
State.bootstrapDev();

// SUPER: 8 tabs per sketch
State.setSession('super', 'devadmin@prodlabs.dev');
try {
  Router.go('app');
  expect('super: app topbar present', !!window.document.querySelector('#app .topbar'));
  expect('super: tabs container present', !!window.document.querySelector('#app .tabs'));
  const superTabs = [...window.document.querySelectorAll('#app .tabs .tab')]
    .map(t => t.dataset.tab);
  expect(`super tab count = 8 (got ${superTabs.length})`, superTabs.length === 8);
  ['dashboard','stats','teams','import','history','users','messages','settings']
    .forEach(key => expect(`super has '${key}' tab`, superTabs.includes(key)));
  // Verify Phase 6 stub renders (Dashboard is the default)
  expect('super: Dashboard renders (real, with filter bar)',
    !!window.document.getElementById('df-dept'));
} catch (e) { bad('super render', e.message); }

// MANAGER: 8 tabs (same IA)
// Need to seed a manager + team for renderManager to work
const team = State.addTeam({
  name: 'Test Team', department: 'Alerts',
  managerEmail: 'mgr@test.com', workUnits: [], workUnitLabels: {},
  fields: [], roles: [], goals: {},
});
State.addManager({
  email: 'mgr@test.com', username: 'testmgr', displayName: 'Test Manager',
  password: 'password!', teamId: team.id, approvedBy: '__test__',
});
State.setSession('manager', 'mgr@test.com');
try {
  Router.go('app');
  const mgrTabs = [...window.document.querySelectorAll('#app .tabs .tab')]
    .map(t => t.dataset.tab);
  expect(`manager tab count = 8 (got ${mgrTabs.length})`, mgrTabs.length === 8);
  ['dashboard','stats','teams','import','history','users','messages','settings']
    .forEach(key => expect(`manager has '${key}' tab`, mgrTabs.includes(key)));
} catch (e) { bad('manager render', e.message); }

// MEMBER: 6 tabs per sketch (no Stats, no Users)
State.addMember({
  email: 'mbr@test.com', username: 'testmbr', displayName: 'Test Member',
  password: 'password!', teamId: team.id, role: 'Analyst', approvedBy: '__test__',
});
State.setSession('member', 'mbr@test.com');
try {
  Router.go('app');
  const mbrTabs = [...window.document.querySelectorAll('#app .tabs .tab')]
    .map(t => t.dataset.tab);
  expect(`member tab count = 6 (got ${mbrTabs.length})`, mbrTabs.length === 6);
  ['dashboard','goals','import','history','messages','settings']
    .forEach(key => expect(`member has '${key}' tab`, mbrTabs.includes(key)));
  expect("member does NOT have 'stats' tab", !mbrTabs.includes('stats'));
  expect("member does NOT have 'users' tab", !mbrTabs.includes('users'));
} catch (e) { bad('member render', e.message); }

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

// ----- 10. Click through every tab on every role -----
console.log('\n[10] Tab content renders without throwing');
function clickThrough(role, sessionEmail, expectedTabs) {
  State.setSession(role, sessionEmail);
  Router.go('app');
  for (const key of expectedTabs) {
    try {
      const btn = window.document.querySelector(`#app .tabs .tab[data-tab="${key}"]`);
      if (!btn) { bad(`${role}/${key}`, 'tab button not found'); continue; }
      btn.click();
      const main = window.document.querySelector('#app-main');
      const ok_ = main && main.children.length > 0;
      ok_ ? ok(`${role}/${key} renders`) : bad(`${role}/${key}`, 'empty main');
    } catch (e) { bad(`${role}/${key}`, e.message); }
  }
}
clickThrough('super', 'devadmin@prodlabs.dev',
  ['dashboard','stats','teams','import','history','users','messages','settings']);
clickThrough('manager', 'mgr@test.com',
  ['dashboard','stats','teams','import','history','users','messages','settings']);
clickThrough('member', 'mbr@test.com',
  ['dashboard','goals','import','history','messages','settings']);

// ----- 11. Phase 6 part 2: unified Add User modal + edit/delete -----
console.log('\n[11] Add User modal + edit/delete (admin Users tab)');

// Reset everything and set up as admin
State.reset();
State.bootstrapDev();
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');
// Click the Users tab
const usersTab = window.document.querySelector('#app .tabs .tab[data-tab="users"]');
usersTab && usersTab.click();

expect('Users tab shows three role sections',
  window.document.querySelectorAll('#app-main .card').length >= 3);
expect('"Add User" button present',
  !!window.document.getElementById('add-user'));

// Open the Add User modal
window.document.getElementById('add-user').click();
expect('Modal opens with role selector', !!window.document.getElementById('ru-role'));
expect('Modal default role = member', window.document.getElementById('ru-role').value === 'member');
expect('Member-only fields visible by default',
  window.document.getElementById('ru-mem-fields').style.display === '');
expect('Manager-only fields hidden by default',
  window.document.getElementById('ru-mgr-fields').style.display === 'none');

// Switch to Manager — manager fields should appear
const roleSel = window.document.getElementById('ru-role');
roleSel.value = 'manager';
roleSel.dispatchEvent(new window.Event('change'));
expect('Switching to Manager reveals manager fields',
  window.document.getElementById('ru-mgr-fields').style.display === '');
expect('Member fields hidden when Manager selected',
  window.document.getElementById('ru-mem-fields').style.display === 'none');
expect('Existing-team radio block visible by default',
  window.document.getElementById('ru-team-existing').style.display === '');

// Switch to "Create new team" radio
const newRadio = window.document.querySelector('input[name="ru-team-mode"][value="new"]');
newRadio.checked = true;
newRadio.dispatchEvent(new window.Event('change'));
expect('Create-new-team block visible after radio toggle',
  window.document.getElementById('ru-team-new').style.display === '');
expect('Existing-team block hidden after radio toggle',
  window.document.getElementById('ru-team-existing').style.display === 'none');

// Switch dept dropdown to "__other__" → text input should appear
const deptSel = window.document.getElementById('ru-newteam-dept');
deptSel.value = '__other__';
deptSel.dispatchEvent(new window.Event('change'));
expect('Department=Other reveals new-dept input',
  window.document.getElementById('ru-newteam-other-row').style.display === '');

// Fill in form to actually create a manager + new team
window.document.getElementById('ru-name').value = 'Phase 6 Manager';
window.document.getElementById('ru-username').value = 'p6mgr';
window.document.getElementById('ru-email').value = 'p6mgr@test.com';
window.document.getElementById('ru-pass').value = 'longpassword!';
window.document.getElementById('ru-newteam-name').value = 'Phase 6 Team';
window.document.getElementById('ru-newteam-other').value = 'Underwriting';

// Submit
window.document.getElementById('ru-confirm').click();

// Verify creation
expect('manager record exists after submit',
  State.get().managers.some(m => m.email === 'p6mgr@test.com'));
expect('new team created with name "Phase 6 Team"',
  State.get().teams.some(t => t.name === 'Phase 6 Team'));
expect('manager linked to new team',
  State.teamForManager('p6mgr@test.com').name === 'Phase 6 Team');
expect('new department "Underwriting" was registered',
  State.getDepartments().includes('Underwriting'));
expect('manager can log in with new username',
  Auth.tryLogin('p6mgr', 'longpassword!').ok === true);

// Re-render Users tab and try the Add Member flow
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="users"]').click();
window.document.getElementById('add-user').click();
window.document.getElementById('ru-role').value = 'member';
window.document.getElementById('ru-role').dispatchEvent(new window.Event('change'));
window.document.getElementById('ru-name').value = 'Phase 6 Member';
window.document.getElementById('ru-username').value = 'p6mbr';
window.document.getElementById('ru-email').value = 'p6mbr@test.com';
window.document.getElementById('ru-pass').value = 'longpassword!';
const memberTeamSel = window.document.getElementById('ru-mem-team');
// Pick the team we just created
const p6Team = State.get().teams.find(t => t.name === 'Phase 6 Team');
memberTeamSel.value = p6Team.id;
window.document.getElementById('ru-mem-role').value = 'Analyst';
window.document.getElementById('ru-confirm').click();

expect('member created with team + role',
  State.get().members.some(m => m.email === 'p6mbr@test.com' && m.teamId === p6Team.id && m.role === 'Analyst'));
expect('member can log in with new username',
  Auth.tryLogin('p6mbr', 'longpassword!').ok === true);

// Add Super Admin flow
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="users"]').click();
window.document.getElementById('add-user').click();
window.document.getElementById('ru-role').value = 'super';
window.document.getElementById('ru-role').dispatchEvent(new window.Event('change'));
window.document.getElementById('ru-name').value = 'Phase 6 SuperAdmin';
window.document.getElementById('ru-username').value = 'p6super';
window.document.getElementById('ru-email').value = 'p6super@test.com';
window.document.getElementById('ru-pass').value = 'longpassword!';
window.document.getElementById('ru-confirm').click();

expect('super admin created',
  State.get().superAdmins.some(a => a.email === 'p6super@test.com'));
expect('new super admin can log in',
  Auth.tryLogin('p6super', 'longpassword!').ok === true);

// Verify Edit/Delete buttons present on rows
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="users"]').click();
expect('edit buttons present on user rows',
  window.document.querySelectorAll('[data-edit-user]').length >= 3);
expect('delete buttons present on non-protected rows',
  window.document.querySelectorAll('[data-rm-user]').length >= 2);

// Validation: duplicate username should be rejected
window.document.getElementById('add-user').click();
window.document.getElementById('ru-role').value = 'member';
window.document.getElementById('ru-role').dispatchEvent(new window.Event('change'));
window.document.getElementById('ru-name').value = 'Dup Test';
window.document.getElementById('ru-username').value = 'p6mbr'; // already used
window.document.getElementById('ru-email').value = 'newdup@test.com';
window.document.getElementById('ru-pass').value = 'longpassword!';
window.document.getElementById('ru-mem-team').value = p6Team.id;
const beforeCount = State.get().members.length;
window.document.getElementById('ru-confirm').click();
expect('duplicate username rejected (no new member created)',
  State.get().members.length === beforeCount);

// Close any leftover modal
Utils && Utils.closeModal && Utils.closeModal();

// ----- 12. Phase 6 part 3: team-setup wizard from Settings -----
console.log('\n[12] Team-setup wizard (from Settings tab)');

// Reset and set up admin context
State.reset();
State.bootstrapDev();
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');

// Navigate to Settings tab
const settingsTab = window.document.querySelector('#app .tabs .tab[data-tab="settings"]');
settingsTab && settingsTab.click();
expect('Settings tab shows wizard launcher',
  !!window.document.getElementById('s-wizard-launch'));
expect('Settings tab has team selector',
  !!window.document.getElementById('s-wizard-team'));

// Launch the wizard for a NEW team (default selection: __new__)
window.document.getElementById('s-wizard-launch').click();
expect('Wizard modal opens', !!window.document.querySelector('.wiz-modal'));
expect('Wizard step 1 has name input', !!window.document.getElementById('w-name'));
expect('Wizard step 1 has dept dropdown', !!window.document.getElementById('w-dept'));
expect('Wizard stepper shows 6 dots',
  window.document.querySelectorAll('.wiz-stepper .wiz-dot').length === 6);
expect('Wizard step 1 is active',
  window.document.querySelector('.wiz-stepper .wiz-dot.active').textContent.trim() === '1');

// Fill in step 1: team name + department (using "Other" path for new dept)
window.document.getElementById('w-name').value = 'Wizard Test Team';
const wizDeptSel = window.document.getElementById('w-dept');
wizDeptSel.value = '__other__';
wizDeptSel.dispatchEvent(new window.Event('change'));
expect('Selecting Other reveals new-dept input',
  window.document.getElementById('w-dept-other-row').style.display === '');
window.document.getElementById('w-dept-other').value = 'Wizard Department';

// Click Continue → step 2 (work units)
window.document.getElementById('wiz-next').click();
expect('Advanced to step 2',
  window.document.querySelector('.wiz-stepper .wiz-dot.active').textContent.trim() === '2');
expect('Step 2 shows work-unit picker',
  window.document.querySelectorAll('[data-pick-wu]').length >= 5);

// Pick a couple of work units
const wuPicks = window.document.querySelectorAll('[data-pick-wu]');
wuPicks[0].checked = true; wuPicks[0].dispatchEvent(new window.Event('change'));
wuPicks[1].checked = true; wuPicks[1].dispatchEvent(new window.Event('change'));

// Add a custom work unit
window.document.getElementById('w-custom-wu').value = 'My Custom Action';
window.document.getElementById('w-custom-wu-add').click();
expect('Custom work unit added (re-rendered with extra pick)',
  window.document.querySelectorAll('.wp-custom').length >= 1);

// Continue → step 3 (fields)
window.document.getElementById('wiz-next').click();
expect('Advanced to step 3 (fields)',
  window.document.querySelector('.wiz-stepper .wiz-dot.active').textContent.trim() === '3');
const fldPicks = window.document.querySelectorAll('[data-pick-fld]');
expect('Step 3 shows field picker', fldPicks.length >= 5);
fldPicks[0].checked = true; fldPicks[0].dispatchEvent(new window.Event('change'));

// Continue → step 4 (roles)
window.document.getElementById('wiz-next').click();
expect('Advanced to step 4 (roles)',
  window.document.querySelector('.wiz-stepper .wiz-dot.active').textContent.trim() === '4');
const rolePicks = window.document.querySelectorAll('[data-pick-role]');
expect('Step 4 shows role picker', rolePicks.length >= 3);
rolePicks[0].checked = true; rolePicks[0].dispatchEvent(new window.Event('change'));
rolePicks[1].checked = true; rolePicks[1].dispatchEvent(new window.Event('change'));

// Continue → step 5 (goals)
window.document.getElementById('wiz-next').click();
expect('Advanced to step 5 (goals)',
  window.document.querySelector('.wiz-stepper .wiz-dot.active').textContent.trim() === '5');
const goalInputs = window.document.querySelectorAll('[data-goal]');
expect('Step 5 shows goal inputs (one per work unit)', goalInputs.length === 3);
goalInputs[0].value = '10';
goalInputs[0].dispatchEvent(new window.Event('change'));

// Continue → step 6 (review)
window.document.getElementById('wiz-next').click();
expect('Advanced to step 6 (review)',
  window.document.querySelector('.wiz-stepper .wiz-dot.active').textContent.trim() === '6');
expect('Review screen shows team name',
  /Wizard Test Team/.test(window.document.getElementById('wiz-body').textContent));
expect('Review screen shows new department',
  /Wizard Department/.test(window.document.getElementById('wiz-body').textContent));
expect('Save button labelled "Save team"',
  /Save team/.test(window.document.getElementById('wiz-next').textContent));

// Click Save team → commits to State
const teamsBefore = State.get().teams.length;
window.document.getElementById('wiz-next').click();
expect('Team count incremented',
  State.get().teams.length === teamsBefore + 1);
const created = State.get().teams.find(t => t.name === 'Wizard Test Team');
expect('Team created with name', !!created);
expect('Team has correct department', created && created.department === 'Wizard Department');
expect('Team has 3 work units (2 library + 1 custom)',
  created && created.workUnits.length === 3);
expect('Team has 1 field', created && created.fields.length === 1);
expect('Team has 2 roles', created && created.roles.length === 2);
expect('Team has 1 active goal',
  created && Object.values(created.goals).filter(v => v > 0).length === 1);
expect('Custom work unit has label stored',
  created && Object.values(created.workUnitLabels).includes('My Custom Action'));
expect('New department persisted via addDepartment',
  State.getDepartments().includes('Wizard Department'));

// Cancel-mid-flow does NOT persist
const teamsBeforeCancel = State.get().teams.length;
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="settings"]').click();
window.document.getElementById('s-wizard-launch').click();
window.document.getElementById('w-name').value = 'Cancelled Team';
window.document.getElementById('wiz-next').click(); // step 2
window.document.getElementById('wiz-cancel').click();
expect('Cancelling mid-flow does not create team',
  State.get().teams.length === teamsBeforeCancel);
expect('No "Cancelled Team" persisted',
  !State.get().teams.some(t => t.name === 'Cancelled Team'));

// Manager mode: launch wizard for own team, edit it
const managerTeam = State.addTeam({
  name: 'MgrWiz Team', department: 'Alerts',
  managerEmail: 'mgrwiz@test.com',
  workUnits: [], workUnitLabels: {},
  fields: [], roles: [], goals: {},
});
State.addManager({
  email: 'mgrwiz@test.com', username: 'mgrwiz', displayName: 'MgrWiz',
  password: 'longpassword!', teamId: managerTeam.id, approvedBy: '__test__',
});
State.setSession('manager', 'mgrwiz@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="settings"]').click();
expect('Manager Settings has Run Setup Wizard button',
  !!window.document.getElementById('ts-wizard-launch'));
window.document.getElementById('ts-wizard-launch').click();
expect('Manager wizard pre-fills team name',
  window.document.getElementById('w-name').value === 'MgrWiz Team');

// Close cleanly
Utils.closeModal();

// ----- 13. Phase 6 part 4: real Import tab + empty-state CTA -----
console.log('\n[13] Real Import tab (single-record + bulk CSV) + empty-state CTA');

// --- A. Manager dashboard shows empty-state CTA when team unconfigured ---
State.reset();
State.bootstrapDev();
const emptyTeam = State.addTeam({
  name: 'Empty Team', department: 'Alerts',
  managerEmail: 'emptymgr@test.com',
  workUnits: [], workUnitLabels: {},
  fields: [], roles: [], goals: {},
});
State.addManager({
  email: 'emptymgr@test.com', username: 'emptymgr', displayName: 'Empty Manager',
  password: 'longpassword!', teamId: emptyTeam.id, approvedBy: '__test__',
});
State.setSession('manager', 'emptymgr@test.com');
Router.go('app');
// Explicitly click Dashboard — module-scoped tab state may have
// drifted from previous tests
window.document.querySelector('#app .tabs .tab[data-tab="dashboard"]').click();
expect('Manager Dashboard shows empty-state CTA when team unconfigured',
  !!window.document.getElementById('ds-wizard-launch'));
expect('CTA wording mentions team name',
  /Empty Team/.test(window.document.querySelector('#app-main').textContent));
expect('CTA wording mentions display name',
  /Empty/.test(window.document.querySelector('#app-main h3').textContent));

// Click the CTA → opens wizard pre-filled with this team
window.document.getElementById('ds-wizard-launch').click();
expect('CTA click opens wizard',
  !!window.document.querySelector('.wiz-modal'));
expect('Wizard pre-filled with team name',
  window.document.getElementById('w-name').value === 'Empty Team');
Utils.closeModal();

// --- B. Manager Import tab shows both single-record + bulk CSV when configured ---
// First configure the team
State.updateTeam(emptyTeam.id, {
  workUnits: ['alert_handled', 'dispute_filed'],
  fields: ['amount'],
  roles: ['Analyst'],
  goals: { alert_handled: 5 },
});
State.setSession('manager', 'emptymgr@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="import"]').click();
expect('Manager Import tab shows page header "Import"',
  /Import/.test(window.document.querySelector('#app-main h2').textContent));
expect('Single-record form has date input',
  !!window.document.getElementById('lw-date'));
expect('Single-record form has work unit select',
  !!window.document.getElementById('lw-wu'));
expect('Single-record submit button enabled (team configured)',
  !window.document.getElementById('lw-submit').disabled);
expect('Bulk CSV section rendered inline (not modal)',
  !!window.document.getElementById('ci-text'));
expect('Bulk CSV has Validate button',
  !!window.document.getElementById('ci-validate'));
expect('Bulk CSV import button starts disabled',
  window.document.getElementById('ci-commit').disabled === true);

// --- C. Empty-team manager: bulk import shows warning, single-record disabled ---
State.updateTeam(emptyTeam.id, {
  workUnits: [], fields: [], roles: [], goals: {},
});
State.setSession('manager', 'emptymgr@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="import"]').click();
expect('Empty-team: single-record submit is disabled',
  window.document.getElementById('lw-submit').disabled === true);
expect('Empty-team: bulk import shows warning notice',
  /isn|configure|wizard|unavailable/i.test(window.document.getElementById('bulk-import-host').textContent));

// Reconfigure for downstream tests
State.updateTeam(emptyTeam.id, {
  workUnits: ['alert_handled'],
  fields: [],
  roles: ['Analyst'],
  goals: {},
});

// --- D. Member Import tab: single-record only, no bulk CSV ---
State.addMember({
  email: 'imember@test.com', username: 'imember', displayName: 'Import Member',
  password: 'longpassword!', teamId: emptyTeam.id, role: 'Analyst', approvedBy: '__test__',
});
State.setSession('member', 'imember@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="import"]').click();
expect('Member Import has single-record form',
  !!window.document.getElementById('lw-date'));
expect('Member Import has Log Record button',
  !!window.document.getElementById('lw-submit'));
expect('Member Import does NOT have bulk CSV section',
  !window.document.getElementById('ci-text'));
expect('Member Import retitled "Import"',
  /^Import\b/.test(window.document.querySelector('#app-main h2').textContent));

// --- E. Super admin Import: team picker → bulk import per team ---
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="import"]').click();
expect('Super Import has team selector',
  !!window.document.getElementById('imp-team'));
expect('Super Import does NOT show bulk CSV before team picked',
  !window.document.getElementById('ci-text'));

// Pick the configured team
const impTeamSel = window.document.getElementById('imp-team');
impTeamSel.value = emptyTeam.id;
impTeamSel.dispatchEvent(new window.Event('change'));
expect('Super Import shows bulk CSV after team picked',
  !!window.document.getElementById('ci-text'));

// Pick another team that's still empty (no work units)
const stillEmpty = State.addTeam({
  name: 'Still Empty', department: 'Sales',
  managerEmail: null,
  workUnits: [], workUnitLabels: {},
  fields: [], roles: [], goals: {},
});
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="import"]').click();
const sel2 = window.document.getElementById('imp-team');
sel2.value = stillEmpty.id;
sel2.dispatchEvent(new window.Event('change'));
expect('Super Import shows warning for unconfigured team',
  /isn|configure|wizard/i.test(window.document.getElementById('bulk-import-host').textContent));
expect('Super Import does NOT show CSV input for unconfigured team',
  !window.document.getElementById('ci-text'));

// --- F. End-to-end: actually log a single record via manager Import tab ---
State.setSession('manager', 'emptymgr@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="import"]').click();
const beforeRecCount = State.get().records.length;
window.document.getElementById('lw-date').value = '2026-05-07';
window.document.getElementById('lw-wu').value = 'alert_handled';
window.document.getElementById('lw-submit').click();
expect('Single-record submit creates a record',
  State.get().records.length === beforeRecCount + 1);

// --- G. End-to-end: validate and commit a CSV bulk import ---
State.setSession('manager', 'emptymgr@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="import"]').click();
// Build a small valid CSV: 2 rows logging against the manager's team
const csvText =
  'date,member,workUnit\n' +
  '2026-05-01,Import Member,alert_handled\n' +
  '2026-05-02,Import Member,alert_handled\n';
const csvTextArea = window.document.getElementById('ci-text');
csvTextArea.value = csvText;
window.document.getElementById('ci-validate').click();
expect('Validate enables Import button',
  window.document.getElementById('ci-commit').disabled === false);
expect('Validate label shows row count',
  /Import 2 rows/.test(window.document.getElementById('ci-commit').textContent));

const beforeBulk = State.get().records.length;
window.document.getElementById('ci-commit').click();
expect('Bulk commit added 2 records',
  State.get().records.length === beforeBulk + 2);

// ----- 14. Phase 6 part 5: real Dashboard for all 3 roles -----
console.log('\n[14] Real Dashboard — admin / manager / member');

// --- Set up: 2 teams across 2 departments, members + records ---
State.reset();
State.bootstrapDev();
const teamA = State.addTeam({
  name: 'Team Alpha', department: 'Alerts',
  managerEmail: 'alpha@test.com',
  workUnits: ['alert_handled'], workUnitLabels: {},
  fields: [], roles: ['Analyst'], goals: { alert_handled: 5 },
});
const teamB = State.addTeam({
  name: 'Team Bravo', department: 'Sales',
  managerEmail: 'bravo@test.com',
  workUnits: ['lead_contacted'], workUnitLabels: {},
  fields: [], roles: ['Analyst'], goals: { lead_contacted: 10 },
});
State.addManager({
  email: 'alpha@test.com', username: 'alpha', displayName: 'Alpha Manager',
  password: 'longpassword!', teamId: teamA.id, approvedBy: '__test__',
});
State.addManager({
  email: 'bravo@test.com', username: 'bravo', displayName: 'Bravo Manager',
  password: 'longpassword!', teamId: teamB.id, approvedBy: '__test__',
});
State.addMember({
  email: 'a1@test.com', username: 'a1', displayName: 'Alpha One',
  password: 'longpassword!', teamId: teamA.id, role: 'Analyst', approvedBy: '__test__',
});
State.addMember({
  email: 'a2@test.com', username: 'a2', displayName: 'Alpha Two',
  password: 'longpassword!', teamId: teamA.id, role: 'Analyst', approvedBy: '__test__',
});
State.addMember({
  email: 'b1@test.com', username: 'b1', displayName: 'Bravo One',
  password: 'longpassword!', teamId: teamB.id, role: 'Analyst', approvedBy: '__test__',
});
const todayStr = new Date().toISOString().slice(0, 10);
// Seed records: Alpha gets 5 today, Bravo gets 2
for (let i = 0; i < 3; i++) State.addRecord({ teamId: teamA.id, memberEmail: 'a1@test.com', date: todayStr, workUnit: 'alert_handled', fields: {} });
for (let i = 0; i < 2; i++) State.addRecord({ teamId: teamA.id, memberEmail: 'a2@test.com', date: todayStr, workUnit: 'alert_handled', fields: {} });
for (let i = 0; i < 2; i++) State.addRecord({ teamId: teamB.id, memberEmail: 'b1@test.com', date: todayStr, workUnit: 'lead_contacted', fields: {} });

// --- A. ADMIN Dashboard ---------------------------------------
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="dashboard"]').click();

expect('Admin Dashboard has filter bar (department dropdown)',
  !!window.document.getElementById('df-dept'));
expect('Admin Dashboard has team filter',
  !!window.document.getElementById('df-team'));
expect('Admin Dashboard has user filter',
  !!window.document.getElementById('df-user'));

// Top metric strip
const adminMetrics = window.document.querySelectorAll('#app-main .metric-grid .metric');
expect('Admin Dashboard has at least 6 metric cards',
  adminMetrics.length >= 6);

// Today metric should show 7 (3+2+2)
const todayMetric = [...adminMetrics].find(m => /today/i.test(m.textContent) && /records logged today/i.test(m.textContent));
expect('Admin Dashboard "Today" metric reflects all records',
  todayMetric && /\b7\b/.test(todayMetric.textContent));

// Cross-team leaderboard
expect('Admin Dashboard has cross-team leaderboard',
  !!window.document.querySelector('.dash-team-board'));
expect('Top team is Alpha (5 records this week vs Bravo 2)',
  /Team Alpha/.test(window.document.querySelector('.dash-team-row').textContent));

// Department filter narrows to Alerts only
const dfDept = window.document.getElementById('df-dept');
dfDept.value = 'Alerts';
dfDept.dispatchEvent(new window.Event('change'));
const todayMetricFiltered = [...window.document.querySelectorAll('#app-main .metric-grid .metric')]
  .find(m => /today/i.test(m.textContent) && /records logged today/i.test(m.textContent));
expect('After dept=Alerts filter, Today metric drops to 5',
  todayMetricFiltered && /\b5\b/.test(todayMetricFiltered.textContent));
expect('After dept filter, "Clear filters" button appears',
  !!window.document.getElementById('df-clear'));

// Team filter narrows further
const dfTeam = window.document.getElementById('df-team');
dfTeam.value = teamA.id;
dfTeam.dispatchEvent(new window.Event('change'));
expect('After team=Alpha filter, only Alpha members in user dropdown',
  [...window.document.getElementById('df-user').options]
    .filter(o => o.value)
    .every(o => /Alpha/.test(o.textContent)));

// User filter narrows to single user
const dfUser = window.document.getElementById('df-user');
dfUser.value = 'a1@test.com';
dfUser.dispatchEvent(new window.Event('change'));
const todayMetricUser = [...window.document.querySelectorAll('#app-main .metric-grid .metric')]
  .find(m => /today/i.test(m.textContent) && /records logged today/i.test(m.textContent));
expect('After user=a1 filter, Today metric is 3 (a1 only)',
  todayMetricUser && /\b3\b/.test(todayMetricUser.textContent));

// Clear filters
window.document.getElementById('df-clear').click();
expect('After Clear, dept dropdown is reset',
  window.document.getElementById('df-dept').value === '');

// --- B. MANAGER Dashboard ------------------------------------
State.setSession('manager', 'alpha@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="dashboard"]').click();

expect('Manager Dashboard has member filter',
  !!window.document.getElementById('dash-member'));

const mgrMetrics = window.document.querySelectorAll('#app-main .metric-grid .metric');
expect('Manager Dashboard has 4+ metric cards',
  mgrMetrics.length >= 4);
const mgrTodayMetric = [...mgrMetrics].find(m => /today/i.test(m.textContent) && /records logged today/i.test(m.textContent));
expect('Manager Dashboard Today metric = 5 (Alpha team total)',
  mgrTodayMetric && /\b5\b/.test(mgrTodayMetric.textContent));

expect('Manager Dashboard shows "Top Performers" leaderboard',
  /Top Performers/.test(window.document.querySelector('#app-main').textContent));
expect('Manager Dashboard shows Goal Hit Rate card',
  /Goal Hit Rate/.test(window.document.querySelector('#app-main').textContent));

// Member filter
const dashMember = window.document.getElementById('dash-member');
dashMember.value = 'a1@test.com';
dashMember.dispatchEvent(new window.Event('change'));
const mgrTodayFiltered = [...window.document.querySelectorAll('#app-main .metric-grid .metric')]
  .find(m => /today/i.test(m.textContent) && /records logged today/i.test(m.textContent));
expect('Manager Dashboard filter narrows Today to 3 (a1 only)',
  mgrTodayFiltered && /\b3\b/.test(mgrTodayFiltered.textContent));

// --- C. MEMBER Dashboard --------------------------------------
State.setSession('member', 'a1@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="dashboard"]').click();

const mbrMetrics = window.document.querySelectorAll('#app-main .metric-grid .metric');
expect('Member Dashboard has 4 metric cards',
  mbrMetrics.length === 4);
const mbrTodayMetric = [...mbrMetrics].find(m => /today/i.test(m.textContent) && /records logged today/i.test(m.textContent));
expect('Member Dashboard Today metric = 3 (a1 own records)',
  mbrTodayMetric && /\b3\b/.test(mbrTodayMetric.textContent));

expect('Member Dashboard shows "You vs The Team" card (team has >1 member)',
  /You vs The Team/.test(window.document.querySelector('#app-main').textContent));
expect('Member Dashboard shows rank "#1" or "#2"',
  /#[12]/.test(window.document.querySelector('#app-main').textContent));

// Solo team: no rank card
State.setSession('member', 'b1@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="dashboard"]').click();
expect('Solo-team member Dashboard does NOT show "You vs The Team"',
  !/You vs The Team/.test(window.document.querySelector('#app-main').textContent));

// ----- 15. Phase 6 part 6: History tab + PDF reports -----
console.log('\n[15] History tab + PDF reports (all 3 roles)');

// jsPDF + autotable load via CDN in production. In JSDOM there's no
// network, so we install a minimal mock that records what the report
// would have contained — enough to verify the wiring is correct.
let lastPdf = null;
window.jspdf = {
  jsPDF: function(opts) {
    this._opts = opts;
    this._calls = [];
    this.internal = {
      pageSize: { getWidth: () => 215.9, getHeight: () => 279.4 },
      getNumberOfPages: () => 1,
    };
    this.setFillColor   = () => {};
    this.setDrawColor   = () => {};
    this.setTextColor   = () => {};
    this.setFont        = () => {};
    this.setFontSize    = () => {};
    this.rect           = () => {};
    this.roundedRect    = () => {};
    this.text           = (txt, x, y, opts) => { this._calls.push({op:'text', txt, x, y}); };
    this.autoTable      = (opts) => { this._calls.push({op:'table', head: opts.head, body: opts.body}); };
    this.save           = (filename) => {
      lastPdf = { filename, calls: this._calls };
    };
    return this;
  },
};
// Attach autoTable to API prototype (matches real plugin shape)
window.jspdf.jsPDF.API = { autoTable: function(){} };

// Re-test isAvailable (Reports module was created before mock was set)
expect('Reports.isAvailable() returns true with mock', Reports.isAvailable() === true);

// --- Set up: shared seed used by all role tests ---
State.reset();
State.bootstrapDev();
const histTeam = State.addTeam({
  name: 'History Team', department: 'Alerts',
  managerEmail: 'histmgr@test.com',
  workUnits: ['alert_handled'], workUnitLabels: {},
  fields: ['amount'], roles: ['Analyst'], goals: { alert_handled: 5 },
});
State.addManager({
  email: 'histmgr@test.com', username: 'histmgr', displayName: 'History Manager',
  password: 'longpassword!', teamId: histTeam.id, approvedBy: '__test__',
});
State.addMember({
  email: 'histmem@test.com', username: 'histmem', displayName: 'History Member',
  password: 'longpassword!', teamId: histTeam.id, role: 'Analyst', approvedBy: '__test__',
});
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
for (let i = 0; i < 3; i++) State.addRecord({ teamId: histTeam.id, memberEmail: 'histmem@test.com', date: today, workUnit: 'alert_handled', fields: { amount: 100 } });
for (let i = 0; i < 2; i++) State.addRecord({ teamId: histTeam.id, memberEmail: 'histmem@test.com', date: yesterday, workUnit: 'alert_handled', fields: { amount: 50 } });

// --- A. Reports.preset() returns sensible date ranges ---
const [pmFrom, pmTo] = Reports.preset('thisMonth', '2026-05-15');
expect('preset thisMonth returns ISO date pair',
  pmFrom === '2026-05-01' && pmTo === '2026-05-31');
const [lmFrom, lmTo] = Reports.preset('lastMonth', '2026-05-15');
expect('preset lastMonth returns previous month',
  lmFrom === '2026-04-01' && lmTo === '2026-04-30');
const [l30From, l30To] = Reports.preset('last30', '2026-05-15');
expect('preset last30 returns 30-day window ending today',
  l30From === '2026-04-16' && l30To === '2026-05-15');
const [yFrom, yTo] = Reports.preset('thisYear', '2026-05-15');
expect('preset thisYear spans Jan 1 to Dec 31',
  yFrom === '2026-01-01' && yTo === '2026-12-31');

// --- B. Reports.filterByRange filters records correctly ---
const allRecs = State.get().records;
const inRange = Reports.filterByRange(allRecs, today, today);
expect('filterByRange today-only returns 3 records',
  inRange.length === 3);
const empty = Reports.filterByRange(allRecs, '2099-01-01', '2099-12-31');
expect('filterByRange far-future returns 0 records',
  empty.length === 0);

// --- C. Admin History tab renders & generates PDF ---
State.setSession('super', 'devadmin@prodlabs.dev');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="history"]').click();

expect('Admin History has Generate PDF button',
  !!window.document.getElementById('hi-pdf'));
expect('Admin History has filter dropdowns',
  !!window.document.getElementById('hf-dept') &&
  !!window.document.getElementById('hf-team') &&
  !!window.document.getElementById('hf-user'));
expect('Admin History has date range inputs',
  !!window.document.getElementById('hf-from') &&
  !!window.document.getElementById('hf-to'));
expect('Admin History has preset buttons',
  window.document.querySelectorAll('[data-preset]').length >= 5);
expect('Admin History shows record count metric',
  /\b5\b/.test(window.document.querySelector('#app-main .metric-grid').textContent));

// Click "Last 30 days" preset → date inputs populate
window.document.querySelector('[data-preset="last30"]').click();
const fromAfterPreset = window.document.getElementById('hf-from').value;
const toAfterPreset = window.document.getElementById('hf-to').value;
expect('Preset click populates From input',
  fromAfterPreset && /^\d{4}-\d{2}-\d{2}$/.test(fromAfterPreset));
expect('Preset click populates To input',
  toAfterPreset && /^\d{4}-\d{2}-\d{2}$/.test(toAfterPreset));

// Generate the PDF
lastPdf = null;
window.document.getElementById('hi-pdf').click();
expect('Admin PDF: doc.save called', lastPdf !== null);
expect('Admin PDF: filename starts with ProdLabs_Admin',
  lastPdf && /^ProdLabs_Admin_/.test(lastPdf.filename));
expect('Admin PDF: filename ends in .pdf',
  lastPdf && /\.pdf$/.test(lastPdf.filename));
const adminTableCall = lastPdf && lastPdf.calls.find(c => c.op === 'table');
expect('Admin PDF: includes record table', !!adminTableCall);
expect('Admin PDF: table has Date/Team/Member/Work Unit headers',
  adminTableCall && adminTableCall.head[0].includes('Date') &&
  adminTableCall.head[0].includes('Team') &&
  adminTableCall.head[0].includes('Member'));
expect('Admin PDF: table contains 5 rows (all records)',
  adminTableCall && adminTableCall.body.length === 5);

// Test filtering: filter to today only, regenerate
window.document.getElementById('hf-from').value = today;
window.document.getElementById('hf-from').dispatchEvent(new window.Event('change'));
window.document.getElementById('hf-to').value = today;
window.document.getElementById('hf-to').dispatchEvent(new window.Event('change'));
lastPdf = null;
window.document.getElementById('hi-pdf').click();
const adminFilteredTable = lastPdf && lastPdf.calls.find(c => c.op === 'table');
expect('Admin PDF respects date filter (today only = 3 records)',
  adminFilteredTable && adminFilteredTable.body.length === 3);

// --- D. Manager History tab ---
State.setSession('manager', 'histmgr@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="history"]').click();

expect('Manager History tab page header is "History" (was "Activity")',
  /^History\b/.test(window.document.querySelector('#app-main h2').textContent));
expect('Manager History has Generate PDF button',
  !!window.document.getElementById('hi-pdf'));
expect('Manager History has preset buttons',
  window.document.querySelectorAll('[data-preset]').length >= 5);

// Click thisMonth preset → applies to af-from/af-to
window.document.querySelector('[data-preset="thisMonth"]').click();
expect('Manager preset click updates af-from',
  /^\d{4}-\d{2}-\d{2}$/.test(window.document.getElementById('af-from').value));

// Generate PDF
lastPdf = null;
window.document.getElementById('hi-pdf').click();
expect('Manager PDF: doc.save called', lastPdf !== null);
expect('Manager PDF: filename starts with ProdLabs_Manager',
  lastPdf && /^ProdLabs_Manager_/.test(lastPdf.filename));
const mgrTable = lastPdf && lastPdf.calls.find(c => c.op === 'table');
expect('Manager PDF: table has Date/Member/Work Unit/Amount cols',
  mgrTable && mgrTable.head[0].includes('Date') && mgrTable.head[0].includes('Member'));

// --- E. Member History tab ---
State.setSession('member', 'histmem@test.com');
Router.go('app');
window.document.querySelector('#app .tabs .tab[data-tab="history"]').click();

expect('Member History has Download Report button',
  !!window.document.getElementById('mh-pdf'));
expect('Member History has preset buttons',
  window.document.querySelectorAll('[data-preset]').length >= 5);

// Click "thisMonth" preset
window.document.querySelector('[data-preset="thisMonth"]').click();
expect('Member preset click updates mhf-from',
  /^\d{4}-\d{2}-\d{2}$/.test(window.document.getElementById('mhf-from').value));

// Generate member PDF
lastPdf = null;
window.document.getElementById('mh-pdf').click();
expect('Member PDF: doc.save called', lastPdf !== null);
expect('Member PDF: filename starts with ProdLabs_Member',
  lastPdf && /^ProdLabs_Member_/.test(lastPdf.filename));
const memTable = lastPdf && lastPdf.calls.find(c => c.op === 'table');
expect('Member PDF: table has Date and Work Unit cols (no Member col — own records)',
  memTable && memTable.head[0].includes('Date') &&
  memTable.head[0].includes('Work Unit') &&
  !memTable.head[0].includes('Member'));
expect('Member PDF: table contains all my records (5)',
  memTable && memTable.body.length === 5);

// --- F. PDF unavailable graceful fallback ---
const savedJsPDF = window.jspdf;
delete window.jspdf;
expect('Reports.isAvailable() returns false when jsPDF missing',
  Reports.isAvailable() === false);
const okFalse = Reports.generate({ scope: 'Test', tableHead: [], tableBody: [] });
expect('Reports.generate returns false when jsPDF missing',
  okFalse === false);
window.jspdf = savedJsPDF; // restore

// ----- summary -----
console.log(`\n${pass} passed, ${fail} failed`);
if (fail === 0) console.log('ALL CLEAN');
else            process.exit(1);
