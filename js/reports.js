/* ============================================================
 *  reports.js — Phase 6 part 6: PDF report generation
 * ============================================================
 *  Wraps jsPDF + jspdf-autotable into a small Reports API that
 *  the three History views call. All three roles produce the
 *  same broad layout (header → range/scope → metrics → table)
 *  but with role-appropriate columns and titles.
 *
 *  jsPDF & autotable are loaded via CDN in index.html; we expect
 *  window.jspdf and window.jspdf-autotable's `applyPlugin` to be
 *  present by the time any History tab is rendered.
 *
 *  The module is fail-safe: if jsPDF didn't load (offline / CDN
 *  blocked), generate() shows a toast and returns false instead
 *  of crashing.
 * ============================================================ */

const Reports = (() => {

  // ---- jsPDF + autotable availability check -----------------
  // Returns the jsPDF constructor or null. autotable is attached
  // automatically when the umd build is loaded after jsPDF.
  function getJsPDF() {
    if (typeof window === 'undefined') return null;
    // jsPDF UMD loads itself onto window.jspdf.jsPDF (note the dot)
    const ns = window.jspdf;
    if (!ns || typeof ns.jsPDF !== 'function') return null;
    return ns.jsPDF;
  }

  function isAvailable() {
    const J = getJsPDF();
    if (!J) return false;
    // autotable plugin attaches a `.autoTable` method to the jsPDF prototype
    return typeof J.API.autoTable === 'function';
  }

  // ---- Filename builder -------------------------------------
  // "ProdLabs_AdminReport_2026-01-01_2026-01-31.pdf"
  function buildFilename(scope, fromIso, toIso) {
    const safe = String(scope || 'Report').replace(/[^A-Za-z0-9-]+/g, '');
    return `ProdLabs_${safe}_${fromIso}_${toIso}.pdf`;
  }

  // ---- Public API: generate(opts) ---------------------------
  // opts = {
  //   scope:        'Admin' | 'Manager' | 'Member' (drives filename + title)
  //   companyName:  string
  //   reportTitle:  string (e.g. "Company-wide Activity Report")
  //   subtitle:     string (e.g. "All teams · all members")
  //   fromIso:      'YYYY-MM-DD' (inclusive)
  //   toIso:        'YYYY-MM-DD' (inclusive)
  //   summary:      [{ label, value }] — top-of-report summary cards
  //   tableHead:    [string] — column headers
  //   tableBody:    [[string]] — row data, already stringified
  //   filterSummary:string (optional, e.g. "Department: Alerts · Team: Alpha")
  //   sectionTitle: string (optional, replaces "Records" above the table)
  // }
  // Returns true on success, false if jsPDF unavailable.
  function generate(opts) {
    if (!isAvailable()) {
      Utils.toast('PDF library not loaded — check your connection and try again.', 'bad');
      return false;
    }
    const J = getJsPDF();
    const doc = new J({ unit: 'mm', format: 'letter', orientation: 'portrait' });

    // ---- Page geometry ---------------------------------------
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;       // mm
    let y = margin;          // running y cursor

    // ---- Header strip ----------------------------------------
    // Black band, 12mm tall, with company name + report title.
    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, pageW, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`ProdLabs · ${opts.companyName || 'Chargebacks911'}`, margin, 7.5);
    // Right-align the scope tag
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const scopeLabel = (opts.scope || 'Report').toUpperCase() + ' REPORT';
    doc.text(scopeLabel, pageW - margin, 7.5, { align: 'right' });

    y = 22;

    // ---- Title block -----------------------------------------
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(opts.reportTitle || 'Activity Report', margin, y);
    y += 7;

    if (opts.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(opts.subtitle, margin, y);
      y += 5;
    }

    // Date range line
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(`Date range: ${opts.fromIso} to ${opts.toIso}`, margin, y);
    y += 5;

    // Optional filter summary (e.g. "Department: Alerts")
    if (opts.filterSummary) {
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(opts.filterSummary, margin, y);
      y += 5;
    }

    // Generated-on line
    const stamp = new Date().toLocaleString();
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text(`Generated ${stamp}`, margin, y);
    y += 8;

    // ---- Summary cards (4 across) ----------------------------
    if (Array.isArray(opts.summary) && opts.summary.length) {
      const cardW = (pageW - margin * 2 - 6 * (opts.summary.length - 1)) / opts.summary.length;
      const cardH = 18;
      let x = margin;

      opts.summary.forEach((item, i) => {
        // Card background (very light gray)
        doc.setFillColor(248, 248, 250);
        doc.setDrawColor(220, 220, 226);
        doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'FD');

        // Label (small, gray)
        doc.setTextColor(120, 120, 130);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(String(item.label || '').toUpperCase(), x + 3, y + 5);

        // Value (large, dark)
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(String(item.value || '0'), x + 3, y + 13);

        x += cardW + 6;
      });

      y += cardH + 8;
    }

    // ---- Section title above table ---------------------------
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(opts.sectionTitle || 'Records', margin, y);
    y += 2;

    // ---- Records table (autoTable handles pagination) --------
    if (Array.isArray(opts.tableBody) && opts.tableBody.length) {
      doc.autoTable({
        startY: y + 2,
        head: [opts.tableHead || []],
        body: opts.tableBody,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [232, 25, 44],   // CB911 red
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
        },
        alternateRowStyles: {
          fillColor: [250, 238, 239], // very pale red tint
        },
        // Page footer with page number
        didDrawPage: (data) => {
          const str = `Page ${doc.internal.getNumberOfPages()}`;
          doc.setFontSize(8);
          doc.setTextColor(140, 140, 140);
          doc.text(str, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
        },
      });
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(140, 140, 140);
      doc.text('No records in this date range.', margin, y + 8);
    }

    // ---- Save (triggers download in browser) -----------------
    const filename = buildFilename(opts.scope, opts.fromIso, opts.toIso);
    doc.save(filename);
    return true;
  }

  // ---- Date-range preset helpers ----------------------------
  // These return [fromIso, toIso] for common report windows.
  function preset(name, refIso) {
    const today = refIso || new Date().toISOString().slice(0, 10);
    const d = new Date(today + 'T00:00:00');
    const iso = (dt) => dt.toISOString().slice(0, 10);

    switch (name) {
      case 'thisMonth': {
        const from = new Date(d.getFullYear(), d.getMonth(), 1);
        const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return [iso(from), iso(to)];
      }
      case 'lastMonth': {
        const from = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        const to   = new Date(d.getFullYear(), d.getMonth(), 0);
        return [iso(from), iso(to)];
      }
      case 'last30': {
        const from = new Date(d); from.setDate(from.getDate() - 29);
        return [iso(from), today];
      }
      case 'thisQuarter': {
        const q = Math.floor(d.getMonth() / 3);
        const from = new Date(d.getFullYear(), q * 3, 1);
        const to   = new Date(d.getFullYear(), q * 3 + 3, 0);
        return [iso(from), iso(to)];
      }
      case 'thisYear': {
        const from = new Date(d.getFullYear(), 0, 1);
        const to   = new Date(d.getFullYear(), 11, 31);
        return [iso(from), iso(to)];
      }
      case 'allTime':
      default:
        return ['', '']; // empty = no filter
    }
  }

  // ---- Filter helper ----------------------------------------
  // Filter records to a date range (inclusive). Empty fromIso/toIso means
  // no bound on that end. Returns a new array.
  function filterByRange(records, fromIso, toIso) {
    return records.filter(r => {
      if (fromIso && r.date < fromIso) return false;
      if (toIso   && r.date > toIso)   return false;
      return true;
    });
  }

  return {
    isAvailable,
    generate,
    preset,
    filterByRange,
    buildFilename,
  };
})();
