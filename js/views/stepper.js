/* ============================================================
 *  views/stepper.js — global signup-journey step indicator
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  A tiny renderer for the 7-step pill bar that appears across
 *  the entire signup journey (NOT just inside the manager
 *  wizard). It exposes ONE public function: render(currentStep).
 *
 *  THE 7 STEPS (and where each one is "shown"):
 *    1. Sign up   — the create-account form (super/manager/member)
 *    2. Role      — the role-pick screen
 *    3. Team      — manager wizard step "team"
 *    4. Units     — manager wizard step "workUnits"
 *    5. Fields    — manager wizard step "fields"
 *    6. Roles     — manager wizard step "roles"
 *    7. Goals     — manager wizard step "goals" (and review/done)
 *
 *  WHY GLOBAL (instead of per-screen)?
 *  Mia wants the user to FEEL like signup is one continuous
 *  flow, even though under the hood the role-pick screen is
 *  in `views/auth.js` and the wizard is in `views/wizard.js`.
 *  Showing the same numbered indicator on every screen makes
 *  the whole journey feel cohesive.
 *
 *  HOW MEMBER/SUPER FLOWS WORK:
 *  Members and super admins only ever see steps 1–2 (sign up,
 *  role pick). Their journey ends at step 2. The wizard's
 *  steps 3–7 are only reachable for managers.
 *
 *  STATE-PILL COLORS:
 *    - step <  current  → "done"  (green check icon)
 *    - step === current → "on"    (red, the brand color)
 *    - step >  current  → dim     (default, muted)
 *  Each step is followed by a connector line (.step-line);
 *  on the "done" side, the line gets the .done class so it
 *  paints green to match.
 *
 *  PUBLIC API:
 *    Stepper.render(currentStep)   → HTML string
 *  Pass 0 (or any falsy) when you DON'T want the stepper
 *  shown — e.g. on the sign-IN form.
 * ============================================================ */

const Stepper = (() => {

  // The 7-step labels. Order matters and maps directly to the
  // step numbers used by callers (Wizard, AuthView, etc.).
  const STEPS = ['Sign up', 'Role', 'Team', 'Units', 'Fields', 'Roles', 'Goals'];

  function render(currentStep) {
    // Guard: 0 / falsy / out-of-range = no stepper at all.
    // Sign-in screen passes 0 so the indicator is hidden there.
    if (!currentStep || currentStep < 1) return '';

    // Build each pill + its trailing connector line.
    // The last step has no connector (nothing to connect TO).
    const pills = STEPS.map((label, i) => {
      const stepNum = i + 1;
      let cls = '';
      let dotContent = String(stepNum);
      if (stepNum < currentStep) { cls = 'done'; dotContent = '✓'; }
      else if (stepNum === currentStep) { cls = 'on'; }
      // else: future step — default styling (dim)

      const isLast = stepNum === STEPS.length;
      // Connector line: gets .done class if THIS step is done
      // (so the line matches the green color of the done pill).
      const lineCls = stepNum < currentStep ? 'step-line done' : 'step-line';
      const lineHTML = isLast ? '' : `<div class="${lineCls}"></div>`;

      return `
        <div class="step ${cls}">
          <div class="step-dot">${dotContent}</div>
          <div class="step-label">${label}</div>
        </div>${lineHTML}
      `;
    }).join('');

    return `<div class="stepper">${pills}</div>`;
  }

  return { render };

})();
