/* ============================================================
 *  views/inbox.js — universal Inbox panel renderer
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  The UI for the Inbox tab. Every role (super, manager, member)
 *  uses this exact same renderer — the items it shows differ
 *  per role because the underlying Inbox.itemsForUser() filters
 *  by what each role is allowed to see.
 *
 *  THE TWO ITEM TYPES:
 *    - 'action': has Approve / Deny buttons. Calls Auth.approve
 *                or Auth.deny when clicked, then re-renders.
 *    - 'notification': has a "Mark read" button if unread.
 *
 *  WHY THE rerender CALLBACK?
 *  When the user clicks Approve / Deny / Mark read, we need to
 *  do TWO things:
 *    1. Re-render the inbox panel itself (so the item disappears
 *       or its unread state flips).
 *    2. Re-render the parent dashboard, so the tab BADGE
 *       (unread count) updates.
 *  The parent passes a `rerender` function to do #2.
 *
 *  PUBLIC API:
 *    InboxView.render(main, session, rerender)
 *      main     - the DOM element to fill (#app-main)
 *      session  - current session object
 *      rerender - callback that re-renders the parent dashboard
 * ============================================================ */

const InboxView = (() => {

  function render(main, session, rerender) {
    const items = Inbox.itemsForUser(session);
    const unread = items.filter(it => it.isUnread).length;

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Inbox</h2>
          <div class="ph-sub">${unread} unread · ${items.length} total</div>
        </div>
      </div>

      <div class="card">
        ${items.length === 0
          ? `<div class="card-body">${emptyState('Inbox zero', "You're all caught up. New requests and notifications will appear here.")}</div>`
          : `<div class="inbox-list">${items.map(renderItem).join('')}</div>`}
      </div>
    `;

    bind(main, session, rerender);
  }

  function renderItem(item) {
    const isAction = item.kind === 'action';
    const dotCls   = isAction ? 'inbox-dot inbox-dot-action' : 'inbox-dot inbox-dot-note';
    const unreadCls = item.isUnread ? 'is-unread' : '';
    const when = formatRelative(item.createdAt);

    // Buttons differ by item type.
    let actions = '';
    if (isAction) {
      actions = `
        <button class="btn btn-primary btn-sm" data-approve="${escape(item.payload.id)}">${Utils.icon('check',12)} Approve</button>
        <button class="btn btn-ghost btn-sm" data-deny="${escape(item.payload.id)}">Deny</button>
      `;
    } else if (item.isUnread) {
      actions = `<button class="btn btn-ghost btn-sm" data-mark="${escape(item.payload.id)}">Mark read</button>`;
    }

    return `
      <div class="inbox-item ${unreadCls}" data-id="${escape(item.id)}">
        <div class="${dotCls}"></div>
        <div class="inbox-main">
          <div class="inbox-row1">
            <span class="inbox-title">${escape(item.title)}</span>
            <span class="muted text-xs">${when}</span>
          </div>
          <div class="inbox-sub">${escape(item.subtitle)}</div>
        </div>
        <div class="inbox-actions">${actions}</div>
      </div>
    `;
  }

  function bind(main, session, rerender) {
    // Approve buttons
    main.querySelectorAll('[data-approve]').forEach(btn => {
      btn.onclick = () => {
        const r = Auth.approve(btn.dataset.approve, session.user.email);
        if (!r.ok) { Utils.toast(r.error, 'bad'); return; }
        Utils.toast('Approved!', 'good');
        // Re-render the inbox panel inline so the user sees the
        // item disappear, AND tell the parent dashboard so its
        // tab badge updates with the new unread count.
        render(main, session, rerender);
        if (typeof rerender === 'function') rerender();
      };
    });

    // Deny buttons. prompt() returns null if user hits Cancel —
    // we bail in that case so accidental clicks don't deny.
    main.querySelectorAll('[data-deny]').forEach(btn => {
      btn.onclick = () => {
        const note = prompt('Optional reason for denying:');
        if (note === null) return; // user cancelled
        const r = Auth.deny(btn.dataset.deny, session.user.email, note);
        if (!r.ok) { Utils.toast(r.error, 'bad'); return; }
        Utils.toast('Denied', 'warn');
        render(main, session, rerender);
        if (typeof rerender === 'function') rerender();
      };
    });

    // Mark read buttons (notifications only)
    main.querySelectorAll('[data-mark]').forEach(btn => {
      btn.onclick = () => {
        State.markNotificationRead(btn.dataset.mark);
        render(main, session, rerender);
        if (typeof rerender === 'function') rerender();
      };
    });
  }

  // ---- helpers --------------------------------------------------
  function emptyState(title, desc) {
    return `
      <div class="empty">
        <div class="empty-icon">${Utils.icon('bell', 28)}</div>
        <h3>${escape(title)}</h3>
        <p>${escape(desc)}</p>
      </div>
    `;
  }

  function formatRelative(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    if (d < 30) return d + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  function escape(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render };

})();
