/* ============================================================
 *  views/wizard-settings.js — Phase 6 part 3
 * ============================================================
 *  Multi-step team-setup wizard, opened from inside the Settings
 *  tab. Replaces the deleted Phase 4 standalone wizard with a
 *  modal-based flow that lives where managers expect it.
 *
 *  Steps:
 *    1. Team basics  — name + department (with "Other" → free-text)
 *    2. Work units   — pick from LIBRARY.workUnits + add custom
 *    3. Fields       — pick from LIBRARY.fields
 *    4. Roles        — pick from LIBRARY.roles + add custom
 *    5. Goals        — daily target per work unit (number)
 *    6. Done         — summary + save
 *
 *  Two modes:
 *    - 'admin'   → admin runs the wizard; can target an existing
 *                  team (opts.teamId) or create a new one (no teamId)
 *    - 'manager' → manager runs the wizard for their own team only;
 *                  team already exists, name/dept editable
 *
 *  All draft state is held in a module-local object until the final
 *  step. Cancel at any point = nothing persists. This avoids orphan
 *  empty teams from create-then-bail flows.
 * ============================================================ */

const WizardSettings = (() => {

  // Total number of steps in the flow. Step 0 is "team basics",
  // step 5 is the "done" review. Indexed 0..5.
  const TOTAL_STEPS = 6;

  // Module-local draft. Reset each time open() is called.
  let draft = null;
  let step = 0;
  let opts = null;

  // open({ mode, teamId, onClose })
  //   mode    = 'admin' | 'manager'
  //   teamId  = string | null (null = create new team)
  //   onClose = callback fired after Done or Cancel; receives the
  //             saved/created team id (or null on cancel)
  function open(o) {
    opts = o || {};
    step = 0;

    // Build initial draft from an existing team (if editing) or
    // from blanks (if creating). For manager mode, teamId is required
    // and points at the manager's own team.
    if (opts.teamId) {
      const t = State.teamById(opts.teamId);
      if (!t) { Utils.toast('Team not found', 'bad'); return; }
      draft = {
        teamId: t.id,
        name: t.name || '',
        department: t.department || '',
        workUnits: [...(t.workUnits || [])],
        // workUnitLabels lets teams rename a library unit (e.g.
        // "Alert Handled" → "RDR Resolved"). Carried through unchanged
        // unless explicitly edited (which the wizard doesn't expose
        // in v1 — the Team Info quick-edit covers it).
        workUnitLabels: { ...(t.workUnitLabels || {}) },
        fields: [...(t.fields || [])],
        roles: [...(t.roles || [])],
        goals: { ...(t.goals || {}) },
        // Track whether anything beyond name/dept was already configured —
        // used to label the wizard "Run again" vs "Set up team".
        wasConfigured: (t.workUnits||[]).length > 0,
      };
    } else {
      draft = {
        teamId: null,
        name: '',
        department: '',
        workUnits: [],
        workUnitLabels: {},
        fields: [],
        roles: [],
        goals: {},
        wasConfigured: false,
      };
    }

    renderStep();
  }

  // ----- STEP RENDERERS ----------------------------------------
  function renderStep() {
    Utils.openModal(`
      <div class="wiz-modal">
        <div class="wiz-head">
          <h3 class="wiz-title">${stepTitle()}</h3>
          <div class="wiz-stepper">
            ${Array.from({length: TOTAL_STEPS}, (_, i) => `
              <span class="wiz-dot ${i===step?'active':''} ${i<step?'done':''}">${i<step?'✓':i+1}</span>
              ${i<TOTAL_STEPS-1?'<span class="wiz-line"></span>':''}
            `).join('')}
          </div>
        </div>
        <div class="wiz-body" id="wiz-body">
          ${stepBody()}
        </div>
        <div class="wiz-foot">
          <button class="btn btn-ghost btn-sm" id="wiz-cancel">Cancel</button>
          <div class="wiz-foot-right">
            ${step > 0 ? '<button class="btn btn-ghost btn-sm" id="wiz-back">Back</button>' : ''}
            <button class="btn btn-primary btn-sm" id="wiz-next">
              ${step === TOTAL_STEPS-1 ? 'Save team' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    `);

    // Resize the underlying modal so the wizard has room to breathe
    const modalEl = document.querySelector('#modal-wrap .modal');
    if (modalEl) modalEl.classList.add('modal-wide');

    bindStep();
  }

  function stepTitle() {
    switch (step) {
      case 0: return draft.teamId ? 'Edit team basics' : 'Create your team';
      case 1: return 'Pick work units';
      case 2: return 'Pick tracked fields';
      case 3: return 'Pick team roles';
      case 4: return 'Set daily goals';
      case 5: return 'Review and save';
    }
    return '';
  }

  function stepBody() {
    switch (step) {
      case 0: return bodyBasics();
      case 1: return bodyWorkUnits();
      case 2: return bodyFields();
      case 3: return bodyRoles();
      case 4: return bodyGoals();
      case 5: return bodyReview();
    }
    return '';
  }

  // ----- STEP 0: basics (name + dept) --------------------------
  function bodyBasics() {
    const isManagerMode = opts.mode === 'manager';
    const depts = State.getDepartments();
    return `
      <p class="wiz-help">
        ${draft.teamId
          ? 'Update your team\u2019s display name and department.'
          : 'Give the team a name and pick its department. You can add a new department if none of the options fit.'}
      </p>
      <div class="form-row">
        <label class="label">Team name</label>
        <input id="w-name" placeholder="e.g. Alerts West" value="${esc(draft.name)}"
               ${isManagerMode && draft.teamId ? '' : ''}>
      </div>
      <div class="form-row">
        <label class="label">Department</label>
        <select id="w-dept">
          ${depts.map(d => `<option value="${esc(d)}" ${draft.department===d?'selected':''}>${esc(d)}</option>`).join('')}
          <option value="__other__" ${draft.department && !depts.includes(draft.department) ? 'selected' : ''}>Other (type below)\u2026</option>
        </select>
      </div>
      <div class="form-row" id="w-dept-other-row" style="display:none">
        <label class="label">New department name</label>
        <input id="w-dept-other" placeholder="e.g. Underwriting"
               value="${draft.department && !depts.includes(draft.department) ? esc(draft.department) : ''}">
      </div>
    `;
  }

  // ----- STEP 1: work units ------------------------------------
  function bodyWorkUnits() {
    return `
      <p class="wiz-help">Choose every work unit your team logs. You can pick multiple. Add custom units at the bottom if your team tracks something the library doesn\u2019t cover.</p>
      <div class="wiz-pickgrid">
        ${LIBRARY.workUnits.map(u => `
          <label class="wiz-pick ${draft.workUnits.includes(u.id)?'on':''}">
            <input type="checkbox" data-pick-wu="${u.id}" ${draft.workUnits.includes(u.id)?'checked':''}>
            <div>
              <div class="wp-label">${esc(u.label)}</div>
              <div class="wp-hint">${esc(u.hint||'')}</div>
            </div>
          </label>
        `).join('')}
        ${draft.workUnits.filter(id => !LIBRARY.workUnits.some(u=>u.id===id)).map(id => `
          <label class="wiz-pick on wp-custom">
            <input type="checkbox" data-pick-wu="${esc(id)}" checked>
            <div>
              <div class="wp-label">${esc(draft.workUnitLabels[id] || id)}</div>
              <div class="wp-hint">Custom</div>
            </div>
          </label>
        `).join('')}
      </div>
      <div class="wiz-add-row">
        <input id="w-custom-wu" placeholder="Add a custom work unit (e.g. \u201cCallback Made\u201d)">
        <button class="btn btn-ghost btn-sm" id="w-custom-wu-add">${Utils.icon('plus',12)} Add</button>
      </div>
    `;
  }

  // ----- STEP 2: fields ----------------------------------------
  function bodyFields() {
    return `
      <p class="wiz-help">Each record stores a date, a work unit, and the count. These are the optional fields you also want to track per record.</p>
      <div class="wiz-pickgrid">
        ${LIBRARY.fields.map(f => `
          <label class="wiz-pick ${draft.fields.includes(f.id)?'on':''}">
            <input type="checkbox" data-pick-fld="${f.id}" ${draft.fields.includes(f.id)?'checked':''}>
            <div>
              <div class="wp-label">${esc(f.label)}</div>
              <div class="wp-hint">${esc(f.hint||'')}</div>
            </div>
          </label>
        `).join('')}
      </div>
    `;
  }

  // ----- STEP 3: roles -----------------------------------------
  function bodyRoles() {
    return `
      <p class="wiz-help">Pick the roles that exist on your team. Members get assigned a role when they\u2019re added.</p>
      <div class="wiz-pickgrid">
        ${LIBRARY.roles.map(r => `
          <label class="wiz-pick ${draft.roles.includes(r)?'on':''}">
            <input type="checkbox" data-pick-role="${esc(r)}" ${draft.roles.includes(r)?'checked':''}>
            <div><div class="wp-label">${esc(r)}</div></div>
          </label>
        `).join('')}
        ${draft.roles.filter(r => !LIBRARY.roles.includes(r)).map(r => `
          <label class="wiz-pick on wp-custom">
            <input type="checkbox" data-pick-role="${esc(r)}" checked>
            <div><div class="wp-label">${esc(r)}</div><div class="wp-hint">Custom</div></div>
          </label>
        `).join('')}
      </div>
      <div class="wiz-add-row">
        <input id="w-custom-role" placeholder="Add a custom role (e.g. \u201cPlatform Owner\u201d)">
        <button class="btn btn-ghost btn-sm" id="w-custom-role-add">${Utils.icon('plus',12)} Add</button>
      </div>
    `;
  }

  // ----- STEP 4: goals -----------------------------------------
  function bodyGoals() {
    if (draft.workUnits.length === 0) {
      return `
        <p class="wiz-help">No work units selected — go back to step 2 to pick at least one before setting goals.</p>
        <div class="empty-stub" style="padding:2rem 1rem;margin:1rem auto;max-width:400px">
          ${Utils.icon('flag', 36)}
          <p style="margin-top:1rem">Goals attach to work units. Pick a work unit first.</p>
        </div>
      `;
    }
    return `
      <p class="wiz-help">For each work unit, set a daily target per person. Leave 0 to skip a goal for that unit. You can change these later from Team Settings.</p>
      <div class="wiz-goals">
        ${draft.workUnits.map(id => {
          const label = LIBRARY.workUnitLabel(id, draft.workUnitLabels);
          const v = draft.goals[id] || 0;
          return `
            <div class="wiz-goal-row">
              <label class="kv-label">${esc(label)}</label>
              <div class="wiz-goal-input">
                <input type="number" min="0" max="999" data-goal="${esc(id)}" value="${v}">
                <span class="muted text-xs">per day</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ----- STEP 5: review ----------------------------------------
  function bodyReview() {
    const goalsActive = Object.entries(draft.goals).filter(([, v]) => Number(v) > 0);
    return `
      <p class="wiz-help">Review your setup. Click <strong>Save team</strong> to commit, or Back to revise.</p>
      <div class="wiz-review">
        <div class="wiz-review-row">
          <span class="kv-label">Team</span>
          <strong>${esc(draft.name) || '<span class="muted">(unnamed)</span>'}</strong>
        </div>
        <div class="wiz-review-row">
          <span class="kv-label">Department</span>
          <span>${esc(draft.department) || '<span class="muted">(none)</span>'}</span>
        </div>
        <div class="wiz-review-row">
          <span class="kv-label">Work units</span>
          <span class="pill-list">
            ${draft.workUnits.length
              ? draft.workUnits.map(id => `<span class="pill pill-r">${esc(LIBRARY.workUnitLabel(id, draft.workUnitLabels))}</span>`).join('')
              : '<span class="muted">None</span>'}
          </span>
        </div>
        <div class="wiz-review-row">
          <span class="kv-label">Fields</span>
          <span class="pill-list">
            ${draft.fields.length
              ? draft.fields.map(f => {
                  const def = LIBRARY.fieldDef(f);
                  return `<span class="pill pill-b">${def?esc(def.label):esc(f)}</span>`;
                }).join('')
              : '<span class="muted">None</span>'}
          </span>
        </div>
        <div class="wiz-review-row">
          <span class="kv-label">Roles</span>
          <span class="pill-list">
            ${draft.roles.length
              ? draft.roles.map(r => `<span class="pill pill-burg">${esc(r)}</span>`).join('')
              : '<span class="muted">None</span>'}
          </span>
        </div>
        <div class="wiz-review-row">
          <span class="kv-label">Goals</span>
          <span>
            ${goalsActive.length
              ? goalsActive.map(([id,v]) => `<span class="pill pill-g">${esc(LIBRARY.workUnitLabel(id, draft.workUnitLabels))}: ${v}/day</span>`).join(' ')
              : '<span class="muted">No goals set</span>'}
          </span>
        </div>
      </div>
    `;
  }

  // ----- BINDING -----------------------------------------------
  function bindStep() {
    document.getElementById('wiz-cancel').onclick = () => {
      Utils.closeModal();
      if (typeof opts.onClose === 'function') opts.onClose(null);
    };

    const backBtn = document.getElementById('wiz-back');
    if (backBtn) backBtn.onclick = () => { step--; renderStep(); };

    document.getElementById('wiz-next').onclick = () => {
      if (!commitStep()) return; // validation failed, stay on step
      if (step === TOTAL_STEPS - 1) {
        finalize();
      } else {
        step++;
        renderStep();
      }
    };

    // Per-step bindings
    if (step === 0) bindBasics();
    else if (step === 1) bindWorkUnits();
    else if (step === 2) bindFields();
    else if (step === 3) bindRoles();
    else if (step === 4) bindGoals();
  }

  function bindBasics() {
    const deptSel = document.getElementById('w-dept');
    const otherRow = document.getElementById('w-dept-other-row');
    function syncOther() { otherRow.style.display = deptSel.value === '__other__' ? '' : 'none'; }
    syncOther();
    deptSel.addEventListener('change', syncOther);
  }

  function bindWorkUnits() {
    document.querySelectorAll('[data-pick-wu]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.pickWu;
        if (cb.checked && !draft.workUnits.includes(id)) draft.workUnits.push(id);
        if (!cb.checked) draft.workUnits = draft.workUnits.filter(x => x !== id);
        // mirror "on" class on the parent label for visual feedback
        cb.closest('.wiz-pick').classList.toggle('on', cb.checked);
      });
    });
    document.getElementById('w-custom-wu-add').onclick = () => {
      const inp = document.getElementById('w-custom-wu');
      const label = inp.value.trim();
      if (!label) return;
      // Generate a custom id with a prefix so it's distinguishable
      const id = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
      if (draft.workUnits.includes(id)) {
        Utils.toast('Already added', 'bad');
        return;
      }
      draft.workUnits.push(id);
      draft.workUnitLabels[id] = label;
      inp.value = '';
      renderStep(); // re-render to show the new pick
    };
  }

  function bindFields() {
    document.querySelectorAll('[data-pick-fld]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.pickFld;
        if (cb.checked && !draft.fields.includes(id)) draft.fields.push(id);
        if (!cb.checked) draft.fields = draft.fields.filter(x => x !== id);
        cb.closest('.wiz-pick').classList.toggle('on', cb.checked);
      });
    });
  }

  function bindRoles() {
    document.querySelectorAll('[data-pick-role]').forEach(cb => {
      cb.addEventListener('change', () => {
        const r = cb.dataset.pickRole;
        if (cb.checked && !draft.roles.includes(r)) draft.roles.push(r);
        if (!cb.checked) draft.roles = draft.roles.filter(x => x !== r);
        cb.closest('.wiz-pick').classList.toggle('on', cb.checked);
      });
    });
    document.getElementById('w-custom-role-add').onclick = () => {
      const inp = document.getElementById('w-custom-role');
      const r = inp.value.trim();
      if (!r) return;
      if (draft.roles.includes(r)) { Utils.toast('Already added', 'bad'); return; }
      draft.roles.push(r);
      inp.value = '';
      renderStep();
    };
  }

  function bindGoals() {
    document.querySelectorAll('[data-goal]').forEach(inp => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.goal;
        const v = parseInt(inp.value, 10);
        if (isNaN(v) || v <= 0) delete draft.goals[id];
        else draft.goals[id] = v;
      });
    });
  }

  // ----- VALIDATION + COMMIT -----------------------------------
  // Each step validates and writes its inputs back to draft.
  // Returns true if step is valid and we can advance.
  function commitStep() {
    if (step === 0) {
      const name = (document.getElementById('w-name').value || '').trim();
      if (name.length < CONFIG.TEAM_NAME_MIN_LENGTH) {
        Utils.toast(`Team name must be at least ${CONFIG.TEAM_NAME_MIN_LENGTH} characters`, 'bad');
        return false;
      }
      if (name.length > CONFIG.TEAM_NAME_MAX_LENGTH) {
        Utils.toast(`Team name must be ${CONFIG.TEAM_NAME_MAX_LENGTH} characters or fewer`, 'bad');
        return false;
      }
      let dept = document.getElementById('w-dept').value;
      if (dept === '__other__') {
        dept = (document.getElementById('w-dept-other').value || '').trim();
        if (!dept) { Utils.toast('Department name required', 'bad'); return false; }
      }
      draft.name = name;
      draft.department = dept;
      return true;
    }
    if (step === 1) {
      // Allow zero work units — wizard might be running just to update
      // basics. The Goals step shows a hint if list is empty.
      return true;
    }
    if (step === 2) return true;
    if (step === 3) return true;
    if (step === 4) {
      // Goals are bound via change events, nothing extra to do
      return true;
    }
    if (step === 5) return true;
    return true;
  }

  function finalize() {
    // Persist any new department from step 0
    if (draft.department) State.addDepartment(draft.department);

    let savedTeamId;
    if (draft.teamId) {
      // Update existing team
      State.updateTeam(draft.teamId, {
        name: draft.name,
        department: draft.department,
        workUnits: draft.workUnits,
        workUnitLabels: draft.workUnitLabels,
        fields: draft.fields,
        roles: draft.roles,
        goals: draft.goals,
      });
      savedTeamId = draft.teamId;
    } else {
      // Create new team (admin mode only — manager mode always has teamId)
      const team = State.addTeam({
        name: draft.name,
        department: draft.department,
        managerEmail: null, // assigned later via Add User flow
        workUnits: draft.workUnits,
        workUnitLabels: draft.workUnitLabels,
        fields: draft.fields,
        roles: draft.roles,
        goals: draft.goals,
      });
      savedTeamId = team.id;
    }

    Utils.closeModal();
    Utils.toast(draft.teamId ? 'Team updated' : 'Team created', 'good');
    if (typeof opts.onClose === 'function') opts.onClose(savedTeamId);
  }

  // ----- HELPERS -----------------------------------------------
  function esc(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { open };
})();
