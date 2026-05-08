/* ============================================================
 *  csv.js — CSV / TSV paste-import logic
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  When the manager clicks "Bulk Import" on the Activity tab,
 *  they paste a chunk of CSV (or pasted-from-Excel TSV) into a
 *  textarea. This file's job is to:
 *    1. PARSE that text into structured rows
 *    2. VALIDATE each row against the team's config
 *    3. COMMIT valid rows to State as actual records
 *
 *  WHY IT'S "FORGIVING ON PURPOSE":
 *  Managers paste from messy sources — Excel, Google Sheets,
 *  emails, screenshots typed back out by hand. The parser
 *  accepts:
 *    - Comma OR tab as delimiters (auto-detected)
 *    - Multiple date formats (ISO, US, 2-digit-year)
 *    - Member by EMAIL or by DISPLAY NAME
 *    - Work unit by ID or by LABEL
 *    - Quoted fields with embedded commas (RFC 4180)
 *
 *  Strict validation would frustrate the people who actually
 *  use the feature. Better to forgive small format issues and
 *  surface real errors clearly.
 *
 *  TWO-STAGE FLOW:
 *  Parse and validate FIRST, then preview, then commit.
 *  The user clicks "Validate" to see what would happen, and
 *  "Import N rows" to actually do it. This makes the feature
 *  feel safe and undoable, even though there's no real undo.
 *
 *  Depends on: CONFIG, LIBRARY, State, Utils
 * ============================================================ */

const CSVImport = (() => {

  // =========================================================
  //  PUBLIC API: parse + validate
  // =========================================================

  // Main entry: takes raw pasted text and returns a result object:
  //   { rows: ValidRow[], errors: string[], warnings: string[] }
  //
  // - rows: every successfully parsed AND validated row, ready to commit
  // - errors: per-line problems that REJECTED a row from the import
  // - warnings: per-line problems that didn't reject the row but
  //             dropped a field value (e.g. unknown enum option)
  function parse(text, team) {
    const errors = [], warnings = [];
    const rows = [];

    // Quick reject — blank input gets a friendly message.
    if (!text || !text.trim()) {
      return { rows, errors: ['Paste some CSV/TSV content first.'], warnings };
    }

    const lines = splitLines(text);

    // Need at least 2 lines: a header row and one data row.
    if (lines.length < 2) {
      return { rows, errors: ['Need at least a header row + 1 data row.'], warnings };
    }

    // Hard cap on rows to import in one paste — prevents the
    // browser locking up if someone pastes 100k rows by accident.
    if (lines.length - 1 > CONFIG.CSV_MAX_ROWS) {
      return { rows, errors: [`Too many rows (max ${CONFIG.CSV_MAX_ROWS}).`], warnings };
    }

    // Auto-detect tab vs comma. We check the HEADER row because
    // it's the most likely to be clean (no quoted commas inside).
    const delim = detectDelimiter(lines[0]);

    // Parse the header row. Lowercase everything so column matching
    // is case-insensitive ("Date" matches "date" matches "DATE").
    const headers = splitRow(lines[0], delim).map(h => h.trim().toLowerCase());

    // Build a quick lookup: header name -> column index.
    // E.g. headerIdx['date'] = 0, headerIdx['member'] = 1, ...
    const headerIdx = {};
    headers.forEach((h, i) => { headerIdx[h] = i; });

    // Verify required columns are present. If they aren't, we
    // can't even start — return early with a helpful error.
    const missing = CONFIG.CSV_REQUIRED_COLUMNS.filter(c => !(c.toLowerCase() in headerIdx));
    if (missing.length) {
      return {
        rows,
        errors: [`Missing required column${missing.length>1?'s':''}: ${missing.join(', ')}. Found: ${headers.join(', ')}`],
        warnings,
      };
    }

    // Pre-load the team's members ONCE so we can resolve member
    // references without hitting State on every row.
    const teamMembers = State.membersOfTeam(team.id);

    // -------- walk every data row --------
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Skip blank lines (people often have a trailing newline).
      if (!line.trim()) continue;

      const cols = splitRow(line, delim);

      // Helper: get a column value by header name. Returns ''
      // if the column is missing from the row.
      const get = name => (cols[headerIdx[name.toLowerCase()]] || '').trim();

      // Line numbers shown to the user are 1-indexed and include
      // the header — so the first data row is "Line 2".
      const lineNum = i + 1;

      const rawDate   = get('date');
      const rawMember = get('member');

      // Accept all three case-spellings of the work unit column.
      const rawWU = get('workUnit') || get('work unit') || get('work_unit');

      // ----- Validate date -----
      const date = parseDate(rawDate);
      if (!date) {
        errors.push(`Line ${lineNum}: invalid date "${rawDate}".`);
        continue;
      }

      // ----- Validate member -----
      const memberEmail = resolveMember(rawMember, teamMembers);
      if (!memberEmail) {
        errors.push(`Line ${lineNum}: unknown member "${rawMember}".`);
        continue;
      }

      // ----- Validate work unit -----
      const workUnit = resolveWorkUnit(rawWU, team);
      if (!workUnit) {
        errors.push(`Line ${lineNum}: unknown work unit "${rawWU}".`);
        continue;
      }

      // ----- Pull the team's tracked field values -----
      // Each team has its own set of tracked fields (e.g. amount,
      // outcome, notes). We try to match each one in the CSV.
      // Missing fields in the CSV are silently skipped — only
      // BAD values produce warnings.
      const fields = {};
      team.fields.forEach(f => {
        const def = LIBRARY.fieldDef(f);
        if (!def) return;

        // Try to find the value either by field id (e.g. "amount")
        // or by display label (e.g. "Amount") — we accept either.
        const raw = get(f) || get(def.label);
        if (raw === '') return; // missing field is fine — just skip

        if (def.type === 'number') {
          const n = parseFloat(raw);
          if (isNaN(n)) {
            // Bad number doesn't reject the row; we just drop the value.
            warnings.push(`Line ${lineNum}: ${def.label} "${raw}" not a number, ignored.`);
          } else {
            fields[f] = n;
          }
        } else if (def.type === 'enum') {
          // Find a case-insensitive match in the allowed options list.
          const match = def.options.find(o => o.toLowerCase() === raw.toLowerCase());
          if (!match) {
            warnings.push(`Line ${lineNum}: ${def.label} "${raw}" not in ${def.options.join('/')}, ignored.`);
          } else {
            fields[f] = match;  // store the canonical form, not what the user typed
          }
        } else {
          // Text fields take whatever was pasted, trimmed.
          fields[f] = raw;
        }
      });

      // Row passed everything — add it to the result.
      rows.push({ teamId: team.id, memberEmail, date, workUnit, fields });
    }

    // Edge case: no errors but no valid rows either (e.g. all
    // data rows were blank). Surface a sensible message.
    if (!rows.length && !errors.length) {
      errors.push('No valid rows found after parsing.');
    }

    return { rows, errors, warnings };
  }

  // =========================================================
  //  PUBLIC API: commit
  // =========================================================

  // Commit the validated rows to State. Uses State.addRecords()
  // (the bulk insert) so we only save to localStorage ONCE at
  // the end — much faster than calling addRecord() in a loop.
  function commit(rows) {
    if (!rows.length) return 0;
    State.addRecords(rows);
    return rows.length;
  }

  // =========================================================
  //  PRIVATE: parsing helpers
  // =========================================================

  // Split text into lines, handling Windows (\r\n) and Mac (\r)
  // line endings. We normalize them all to \n first.
  function splitLines(text) {
    return text.replace(/\r\n?/g, '\n').split('\n');
  }

  // Pick comma or tab. Tab wins if it's present — that's the
  // signal that the user pasted from a spreadsheet.
  function detectDelimiter(headerLine) {
    if (headerLine.includes('\t')) return '\t';
    return ',';
  }

  // RFC 4180-style row splitter:
  // - Splits on the delimiter at the top level
  // - Treats anything inside double-quotes as a single field
  // - "" inside a quoted field becomes a literal "
  //
  // Why we wrote our own instead of using a library: this is
  // ~25 lines of code, fewer dependencies, easier for the rebuild
  // team to inspect/port.
  function splitRow(line, delim) {
    const out = [];
    let cur = '';      // the field we're currently building
    let inQ = false;   // are we inside a quoted region?

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (inQ) {
        if (ch === '"') {
          // Handle "" inside a quoted region — that's an escaped quote.
          if (line[i + 1] === '"') {
            cur += '"';
            i++; // skip the second quote
          } else {
            inQ = false; // end of quoted region
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQ = true;  // start of quoted region
        } else if (ch === delim) {
          out.push(cur);  // end of field
          cur = '';
        } else {
          cur += ch;
        }
      }
    }

    // Don't forget the last field (no trailing delimiter).
    out.push(cur);
    return out;
  }

  // Lenient date parser. Accepts:
  //   YYYY-MM-DD            (ISO)
  //   M/D/YYYY              (US)
  //   M/D/YY                (US, 2-digit year)
  // Returns ISO format string, or null if unparseable.
  function parseDate(raw) {
    if (!raw) return null;
    raw = raw.trim();

    // ISO format check
    let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return iso(+m[1], +m[2], +m[3]);

    // US format check
    m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let y = +m[3];
      // 2-digit year: "<50 = 20XX, >=50 = 19XX". This is the
      // common "Y2K cutoff" convention. So "23" -> 2023, "85" -> 1985.
      if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
      return iso(y, +m[1], +m[2]);
    }

    return null;
  }

  // Build an ISO date string and ALSO sanity-check it.
  // Catches things like 2026-13-45 or 2026-02-30.
  function iso(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d);
    // If JS auto-corrected the date (e.g. Feb 30 -> Mar 2),
    // the components won't match what we passed in. Reject it.
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Look up a member from raw input. Try email match first,
  // fall back to display name match. Both case-insensitive.
  function resolveMember(raw, members) {
    if (!raw) return null;
    const norm = raw.toLowerCase();

    const byEmail = members.find(m => m.email.toLowerCase() === norm);
    if (byEmail) return byEmail.email;

    const byName = members.find(m => m.displayName.toLowerCase() === norm);
    if (byName) return byName.email;

    return null;
  }

  // Look up a work unit from raw input. Try id match first,
  // fall back to label match.
  function resolveWorkUnit(raw, team) {
    if (!raw) return null;
    const norm = raw.trim().toLowerCase();

    const byId = team.workUnits.find(id => id.toLowerCase() === norm);
    if (byId) return byId;

    // Match against the team's labels (which include any custom overrides).
    for (const id of team.workUnits) {
      const label = LIBRARY.workUnitLabel(id, team.workUnitLabels).toLowerCase();
      if (label === norm) return id;
    }

    return null;
  }

  // =========================================================
  //  PUBLIC API: build a CSV template for the modal preview
  // =========================================================

  // Returns a sample CSV string showing exactly the columns this
  // team needs and one example data row. Helps the user get the
  // format right.
  function templateFor(team) {
    const cols = ['date', 'member', 'workUnit', ...team.fields];

    const sample = [
      Utils.todayISO(),
      State.membersOfTeam(team.id)[0]?.displayName || 'member@example.com',
      LIBRARY.workUnitLabel(team.workUnits[0] || '', team.workUnitLabels) || 'chargeback_case',
      // Provide a sensible sample value for each tracked field.
      ...team.fields.map(f => {
        const def = LIBRARY.fieldDef(f);
        if (!def) return '';
        if (def.type === 'enum') return def.options[0];
        if (def.type === 'number') return '0';
        return '';
      })
    ];

    return cols.join(',') + '\n' + sample.join(',');
  }

  // =========================================================
  //  PUBLIC API
  // =========================================================

  // Render the bulk-import UI inline into a container element.
  // This replaces the old modal-based flow when the Import tab is
  // already a dedicated page. The single-record form lives separately
  // in each view's renderImport(); this one only handles paste-CSV.
  //
  //   container = a DOM node to write into
  //   team      = team record (for templateFor and parse context)
  //   session   = needed only so a successful commit can trigger refresh
  //   opts.onCommit = optional callback fired after successful import
  function renderInline(container, team, session, opts) {
    opts = opts || {};
    const template = templateFor(team);

    container.innerHTML = `
      <div class="card">
        <div class="card-head">
          <span class="card-title">Bulk Import</span>
          <span class="muted text-xs">Paste CSV/TSV from Excel, Sheets, or any source</span>
        </div>
        <div class="card-body">
          <p class="helper" style="margin-bottom:.75rem">
            Paste rows below. First row must be headers.
            Required columns: <strong>${CONFIG.CSV_REQUIRED_COLUMNS.join(', ')}</strong>.
          </p>
          <details class="helper" style="cursor:pointer;margin-bottom:.75rem">
            <summary><strong>Show template &amp; tips</strong></summary>
            <pre class="csv-template">${escapeHtml(template)}</pre>
            <ul style="margin:8px 0 0 18px;font-size:12px;color:var(--mut)">
              <li><strong>date</strong> — YYYY-MM-DD or M/D/YYYY</li>
              <li><strong>member</strong> — display name OR email of someone on this team</li>
              <li><strong>workUnit</strong> — id (e.g. ${team.workUnits[0]||'work_unit_id'}) or label</li>
              <li>Other columns matched against your team's tracked fields (case-insensitive).</li>
            </ul>
          </details>
          <textarea id="ci-text" rows="10" placeholder="Paste CSV/TSV here..." class="mono text-xs"></textarea>
          <div id="ci-result" class="mt-2"></div>
          <div class="flex gap-8 mt-2">
            <button class="btn btn-ghost btn-sm" id="ci-validate">Validate</button>
            <button class="btn btn-primary btn-sm" id="ci-commit" disabled>Import 0 rows</button>
            <button class="btn btn-ghost btn-sm" id="ci-clear">Clear</button>
          </div>
        </div>
      </div>
    `;

    let parsed = { rows: [], errors: [], warnings: [] };

    const validate = () => {
      const text = document.getElementById('ci-text').value;
      parsed = parse(text, team);
      const result = document.getElementById('ci-result');
      const commitBtn = document.getElementById('ci-commit');
      commitBtn.disabled = parsed.rows.length === 0;
      commitBtn.textContent = `Import ${parsed.rows.length} row${parsed.rows.length!==1?'s':''}`;

      const parts = [];
      if (parsed.rows.length) {
        parts.push(`<div class="notice success"><strong>${parsed.rows.length}</strong> valid row${parsed.rows.length!==1?'s':''} ready to import.</div>`);
      }
      if (parsed.errors.length) {
        parts.push(`<div class="notice danger"><strong>${parsed.errors.length} error${parsed.errors.length!==1?'s':''}:</strong><ul class="csv-issue-list">${parsed.errors.slice(0,10).map(e=>`<li>${escapeHtml(e)}</li>`).join('')}${parsed.errors.length>10?`<li>... and ${parsed.errors.length-10} more</li>`:''}</ul></div>`);
      }
      if (parsed.warnings.length) {
        parts.push(`<div class="notice warn"><strong>${parsed.warnings.length} warning${parsed.warnings.length!==1?'s':''}:</strong><ul class="csv-issue-list">${parsed.warnings.slice(0,10).map(e=>`<li>${escapeHtml(e)}</li>`).join('')}${parsed.warnings.length>10?`<li>... and ${parsed.warnings.length-10} more</li>`:''}</ul></div>`);
      }
      result.innerHTML = parts.join('');
    };

    // Tiny inline debounce — avoid pulling in a util just for this
    let timer = null;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(validate, CONFIG.DEBOUNCE_MS_INPUT || 300);
    };

    document.getElementById('ci-text').oninput = debounced;
    document.getElementById('ci-validate').onclick = validate;
    document.getElementById('ci-clear').onclick = () => {
      document.getElementById('ci-text').value = '';
      document.getElementById('ci-result').innerHTML = '';
      const commitBtn = document.getElementById('ci-commit');
      commitBtn.disabled = true;
      commitBtn.textContent = 'Import 0 rows';
      parsed = { rows: [], errors: [], warnings: [] };
    };
    document.getElementById('ci-commit').onclick = () => {
      if (!parsed.rows.length) return;
      const n = commit(parsed.rows);
      Utils.toast(`Imported ${n} record${n!==1?'s':''}`, 'good');
      if (typeof opts.onCommit === 'function') opts.onCommit(n);
    };
  }

  // Tiny escape helper used inside renderInline. Module-scoped so it
  // doesn't pollute the outer namespace.
  function escapeHtml(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { parse, commit, templateFor, renderInline };

})();
