# AGENTS.md — ProdLabs CB911 Project Rules

This document is the rule book for any AI assistant (Claude, Codex, Cursor, Copilot, etc.) **and** any human developer working on this repository. Rules in this file override default tool behavior. When a rule here conflicts with a tool's general best practice, follow the rule here.

This project is a **vanilla HTML/CSS/JavaScript prototype** of an internal team productivity platform for Chargebacks911. It will be **rebuilt** by a separate dev team in Laravel + Postgres. The purpose of this prototype is to validate product behavior, design system, and user flows before the production rebuild starts.

---

## 1. Project Status & Intent

- Repository: `prodlabs-cb911` — a working prototype, not production code.
- Production rebuild target: **Laravel 13 + PHP 8.5 + Postgres** (separate codebase, not in this repo).
- This prototype's job: communicate the product to the Laravel dev team unambiguously, in working form.
- Treat every change as if a new developer will read it cold next week — they often will.

## 2. Technical Baseline

- Runtime: any modern browser. No build step. No `npm install`. No server.
- Stack: HTML, CSS with CSS variables, JavaScript ES2017+ (no transpilation).
- Persistence: `localStorage` only. No backend exists in this repo.
- External dependency: Chart.js 4.x via cdnjs. No bundler, no module resolver.
- **Do not introduce build tools, frameworks, transpilers, or package managers.** This is intentional. Adding them defeats the prototype's purpose (zero-friction to read and run).
- **Do not introduce TypeScript.** The Laravel rebuild can pick its own typing strategy; this codebase stays plain JS.

## 3. Module Architecture

Every JavaScript file is an **IIFE** (Immediately Invoked Function Expression) that returns a public object:

```js
const Foo = (() => {
  // private state
  function publicMethod() { ... }
  function _internal() { ... }
  return { publicMethod };
})();
```

Rules:

- One module per file.
- One concern per module.
- Modules expose a public object via `const X = (() => { ... return { ... }; })();` — never assign to `window` directly.
- Modules are loaded in dependency order in `index.html`. Adding a new module means adding its `<script>` tag in the correct position.
- Views (`js/views/*.js`) never reach into each other. They navigate via the router (`Router.go(...)`).
- Pure logic (analytics, csv parsing, chart construction) lives in **standalone modules**, not in views. Views call those modules.
- Shared state goes through `State.*`. Don't mutate `state` directly from views.

### Module dependency tree (must be respected when adding new code)

```
config.js
  ↓
utils.js → library.js → state.js → auth.js
  ↓
charts.js → analytics.js → csv.js
  ↓
views/landing.js → views/auth.js → views/wizard.js
  → views/super.js → views/manager.js → views/member.js
  ↓
app.js
```

## 4. Configuration & "Magic Numbers"

- Every tunable, threshold, or magic number lives in **`js/config.js`**.
- This includes: time windows, list sizes, table caps, debounce timings, validation limits, feature flags.
- Code outside `config.js` reads from `CONFIG.*` — never duplicates the values.
- When introducing a new tunable, add it to `CONFIG` first, then read it from there.

## 5. Feature Flags

- All gated features go through `CONFIG.FEATURES.*`.
- Both the UI affordance AND the action handler check the flag (defense in depth).
- Flag names are present-tense capabilities: `csvImport`, `editRecords`, `memberSelfDelete` — not `enableCsvImport` or `csvImportEnabled`.

## 6. Styling Rules

- Use CSS variables (`var(--cb-red)`, `var(--ink)`, `var(--bor)`) — never hardcode colors in CSS rules or JS.
- Hardcoded colors are allowed in **one place only**: as fallbacks inside `getComputedStyle(...) || '#fallback'` in JS, since the variable might not have resolved yet at chart construction time.
- New utility classes go in `css/app.css` under a clearly labeled section (e.g. `/* PHASE 3 — utilities */`).
- New base components go in `css/styles.css`.
- **Avoid inline `style="..."` for static values.** Inline is acceptable for **dynamic** values like progress-bar widths (`style="width: ${pct}%"`).
- Don't introduce CSS frameworks (Tailwind, Bootstrap, etc.). The Laravel rebuild will pick that.

## 7. Data Rules

- Member references are by **email** (the unique key for the prototype). Display names are denormalized for UI.
- All record fields go through `LIBRARY.fieldDef(id)` so types and labels stay consistent.
- All work-unit labels go through `LIBRARY.workUnitLabel(id, team.workUnitLabels)` so per-team overrides apply.
- Storage key is `CONFIG.STORAGE_KEY`. If you change the data shape in a backwards-incompatible way, **bump the version number in the key** so existing local data resets cleanly.
- `State.save()` is the only function that writes to localStorage. Everything else mutates the in-memory state object via `State.*` setters/methods.

## 8. Comments & Code Documentation

This prototype is read by humans learning the code (the original author, the Laravel rebuild team). **Comment density is intentionally high.** Specifically:

- Every module starts with a multi-line header comment explaining: what the module does, what it depends on, and any important notes for the rebuild team.
- Every public function (anything in the module's return object) has a one-line comment above it describing what it does.
- Any non-obvious decision (e.g. "we use Mon-start because ISO 8601") gets a `// NOTE: ...` or `// TZ NOTE: ...` comment.
- Comments explain **why**, not **what**. Don't write `// loop through records` — write `// Filter to records dated this month so the chart matches the metric tile`.
- When you're refactoring or learning, leave inline `// <-- explanation` comments on lines that aren't obvious. Future-you will thank you.

## 9. Refactoring Rules

- Don't refactor working code unless you have a concrete reason (clarity, removing duplication, fixing a bug). Random reorganization wastes context.
- When refactoring, run the smoke test (or its successor) before committing. The headless smoke at `/home/claude/smoke-p3.js` covers chart lifecycle, CSV import, edit, delete, and tab rendering.
- Never delete tests (the smoke script in particular) without explicit approval.
- A refactor that adds files but doesn't reduce complexity in the call sites is not a successful refactor — verify the views are simpler afterwards.

## 10. UI Conventions

- Buttons use semantic classes: `btn btn-primary` for primary actions, `btn btn-ghost` for secondary, `btn btn-danger` for destructive, `btn-sm` for compact.
- Icons come from `Utils.icon(name, size)` — don't inline SVG or use external icon libraries.
- Toasts come from `Utils.toast(message, type)` where type is `'good' | 'warn' | 'bad'`.
- Modals come from `Utils.openModal(html)` and `Utils.closeModal()`.
- Confirm dialogs come from `Utils.confirm(message)` returning bool.
- All user-facing strings should pass through `escape()` before going into HTML templates. Treat all data as untrusted — even though it came from your own users, this practice catches bugs.

## 11. Testing

- The smoke test (`smoke-p3.js`) is run with `node smoke-p3.js`. It uses jsdom to load all modules and exercise the views.
- A test is "passing" only when the final line reads `ALL CLEAN` and chart counts created/destroyed match.
- Add coverage to the smoke test when adding any new feature. The smoke test is the canary; if it fails, the change isn't done.
- The smoke test is **not** in the repo (it lives in the dev container) but its logic should be re-creatable by reading what features the views advertise.

## 12. Handoff Documentation

The repo ships four canonical docs that the Laravel rebuild team relies on:

- **`README.md`** — what this is, how to run it, layout, conventions
- **`SPEC.md`** — feature spec, business rules, decisions, out-of-scope
- **`DATA_MODEL.md`** — entities, relationships, suggested Postgres schema, migration plan
- **`PERMISSIONS.md`** — role × action × condition matrix, edge cases, approval flows

Rules:

- These docs and the code must agree. If you change behavior, update the relevant doc in the same commit.
- Do not delete sections from these docs without explicit approval. They were curated.
- New cross-cutting decisions (anything that affects more than one module) need an entry in SPEC.md §12 — "Cross-cutting decisions".
- New permission rules need an entry in PERMISSIONS.md §2 — "Permission matrix".

## 13. AI Assistant Rules

When working as an AI assistant on this project:

- **Read existing modules before adding new ones.** Don't duplicate logic that's already in `Utils`, `LIBRARY`, `Analytics`, etc.
- **Read the relevant doc before changing behavior.** SPEC.md is the source of truth for what the app does.
- **Don't make stylistic refactors uninvited.** If the task is "add CSV import", don't also rename variables or restructure files.
- **Run a sanity check before declaring done.** Either the smoke test, or at minimum: `node --check` every JS file you touched.
- **Comment generously.** The author is learning the code; assume they will read every line.
- **When unsure, ask one question, not three.** This prototype has a single decision-maker; don't drown them in choices.
- **Don't introduce new dependencies.** No new CDN scripts, no new libraries. The current set is final for the prototype.
- **Don't mention tooling churn.** This codebase predates and post-dates many AI assistants. Stick to the rules in this file.

## 14. Commit Hygiene

- Commit messages follow the pattern: `Phase N: <short summary> + <key features>`.
- Phase boundaries are explicit: `Phase 1`, `Phase 2`, `Phase 3` etc. Match the planning conversation.
- One logical change per commit when possible. Refactor + new feature can ship together if the refactor enables the feature.
- Never commit credentials, real customer data, or production exports.

## 15. Out of Scope

For clarity — these are explicitly **not** in scope for this prototype:

- Real backend / API
- Authentication beyond the prototype's plaintext-in-localStorage model
- Multi-tenancy
- Real-time / websocket updates
- Mobile app
- Email / push notifications
- File upload (CSV is paste-only by design)
- Integrations (Salesforce, Zendesk, Stripe, etc.)
- Tests beyond the headless smoke

If any of these come up, they go to the Laravel rebuild team, not into this repo.

---

## Quick reference — where things live

| Need to... | Edit |
|---|---|
| Change a magic number | `js/config.js` |
| Add a feature flag | `js/config.js` → `FEATURES` |
| Add a chart type | `js/charts.js` |
| Add an analytics calculation | `js/analytics.js` |
| Add a tracked field type | `js/library.js` |
| Add a route or view | `js/app.js` (router) + new file in `js/views/` |
| Add a CSS utility | `css/app.css` |
| Document a new business rule | `SPEC.md` §12 |
| Document a new permission rule | `PERMISSIONS.md` §2 |

---

End of rules.
