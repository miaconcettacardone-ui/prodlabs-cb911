/* ============================================================
 *  utils.js — tiny helpers used across views
 * ============================================================ */

const Utils = {

  toast(msg, kind='ok') {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast t-' + kind;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.style.display = 'none', 3500);
  },

  el(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  },

  initials(name='') {
    return name.split(/\s+/).map(w => w[0]||'').join('').slice(0,2).toUpperCase();
  },

  fmt$(n) {
    return '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  },

  fmtRelative(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const min = Math.floor(diff/60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    const hr = Math.floor(min/60);
    if (hr < 24) return hr + 'h ago';
    const d = Math.floor(hr/24);
    if (d < 7) return d + 'd ago';
    return new Date(ts).toLocaleDateString();
  },

  todayISO() { return new Date().toISOString().slice(0,10); },

  validEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e||'').trim());
  },

  // simple modal
  openModal(html) {
    let wrap = document.getElementById('modal-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'modal-wrap';
      wrap.className = 'modal-overlay';
      wrap.addEventListener('click', e => { if (e.target === wrap) this.closeModal(); });
      document.body.appendChild(wrap);
    }
    wrap.innerHTML = `<div class="modal">${html}</div>`;
    wrap.classList.add('open');
    // focus first input
    setTimeout(() => {
      const inp = wrap.querySelector('input,select,textarea');
      if (inp) inp.focus();
    }, 50);
  },
  closeModal() {
    const w = document.getElementById('modal-wrap');
    if (w) w.classList.remove('open');
  },

  // SVG icon shortcut — uses a small embedded library
  icon(name, size=18) {
    const lib = {
      shield: '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>',
      check:  '<polyline points="5 13 9 17 19 7"/>',
      x:      '<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>',
      plus:   '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
      back:   '<polyline points="15 18 9 12 15 6"/>',
      arrow:  '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
      users:  '<path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>',
      user:   '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/>',
      bell:   '<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>',
      home:   '<path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
      shieldStar:'<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><polyline points="9 12 11 14 15 10"/>',
      trash:  '<path d="M3 6h18"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>',
      edit:   '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
      search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
      download:'<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
      upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
      chart:  '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
      crown:  '<path d="M2 19h20M2 19V8l5 4 5-7 5 7 5-4v11"/>',
      mgr:    '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 014-4h6a4 4 0 014 4v2"/><circle cx="17" cy="6" r="2"/><path d="M22 16v-1a3 3 0 00-3-3"/>',
    };
    const path = lib[name] || lib.user;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  },

  // emit a custom event so the router can refresh
  refresh() {
    document.dispatchEvent(new CustomEvent('app:refresh'));
  },

  confirm(msg) {
    return window.confirm(msg);
  }
};
