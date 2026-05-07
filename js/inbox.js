/* ============================================================
 *  inbox.js — unified inbox (action items + notifications)
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  The data layer behind the universal Inbox tab. Every role
 *  (super admin, manager, member) has an Inbox; this module
 *  merges the two underlying lists into one stream:
 *
 *    1. ACTION ITEMS — pending approval requests this user can
 *       act on. Come from State.pendingForUser(session). Each
 *       has Approve / Deny buttons in the UI.
 *
 *    2. NOTIFICATIONS — read-only system messages addressed to
 *       this user (e.g. "your access was approved"). Come from
 *       State.notificationsForUser(email).
 *
 *  WHY MERGE THEM?
 *  Mia decided one Inbox is simpler than two separate tabs.
 *  The user just sees "things needing attention" — some are
 *  decisions (action items), some are FYIs (notifications).
 *
 *  ITEM SHAPE (after merge):
 *    {
 *      id,           // 'a:p_xxx' for actions, 'n:n_xxx' for notes
 *      kind,         // 'action' | 'notification'
 *      subtype,      // pending.type ('super'|'manager'|'member')
 *                    // OR notification.kind ('access-approved' etc.)
 *      title,        // headline shown in bold
 *      subtitle,     // smaller line under title
 *      createdAt,    // for sorting newest-first
 *      isUnread,     // actions are ALWAYS unread; notifs unread until readAt set
 *      payload,      // the original pending or notification object
 *    }
 *
 *  PUBLIC API:
 *    Inbox.itemsForUser(session)        → unified array, newest first
 *    Inbox.unreadCountForUser(session)  → number, used for tab badge
 *    Inbox.notify(emailOrSession, info) → convenience wrapper
 *    Inbox.markRead(item)               → mark a notification read
 * ============================================================ */

const Inbox = (() => {

  // Map a pending request type to a human title for the inbox
  // card. Kept tiny and inline because it's only used here.
  function actionTitle(p) {
    if (p.type === 'super')   return 'New super admin request';
    if (p.type === 'manager') return 'New manager request';
    if (p.type === 'member')  return 'New member request';
    return 'New request';
  }

  // The big merge. Defensive against a null session — returns []
  // so callers can blindly do `.length` on the result.
  function itemsForUser(session) {
    if (!session || !session.user) return [];

    const pendings = State.pendingForUser(session) || [];
    const notes    = State.notificationsForUser(session.user.email) || [];

    // Action items. These are ALWAYS shown as unread — they
    // require a decision, so they don't have a "read" state of
    // their own. Once approved/denied, they fall out of
    // pendingForUser() entirely.
    const actionItems = pendings.map(p => ({
      id: 'a:' + p.id,
      kind: 'action',
      subtype: p.type,
      title: actionTitle(p),
      subtitle: `${p.displayName || p.email} · ${p.email}`,
      createdAt: p.requestedAt || 0,
      isUnread: true,
      payload: p,
    }));

    // Notifications. Unread iff `readAt` is null/undefined.
    const noteItems = notes.map(n => ({
      id: 'n:' + n.id,
      kind: 'notification',
      subtype: n.kind || 'info',
      title: n.title || '',
      subtitle: n.body || '',
      createdAt: n.createdAt || 0,
      isUnread: !n.readAt,
      payload: n,
    }));

    // Newest first. Sort is stable across browsers when comparing
    // numbers, so equal timestamps keep insertion order.
    return [...actionItems, ...noteItems].sort((a, b) => b.createdAt - a.createdAt);
  }

  function unreadCountForUser(session) {
    return itemsForUser(session).filter(it => it.isUnread).length;
  }

  // Convenience wrapper to add a notification by email or session.
  // info: { kind, title, body }
  function notify(emailOrSession, info) {
    const email = typeof emailOrSession === 'string'
      ? emailOrSession
      : (emailOrSession && emailOrSession.user && emailOrSession.user.email);
    if (!email) return null;
    return State.addNotification({ recipientEmail: email, ...info });
  }

  // Mark a (notification) inbox item read. No-op for action items
  // since they don't have a read state.
  function markRead(item) {
    if (!item || item.kind !== 'notification') return;
    State.markNotificationRead(item.payload.id);
  }

  return { itemsForUser, unreadCountForUser, notify, markRead };

})();
