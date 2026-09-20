import { useCallback, useEffect, useRef, useState } from 'react';
import { getNotifications, markNotificationRead, type ApiNotification } from '../services/api';

/**
 * How often the bell asks the API for new rows, in ms.
 *
 * Notifications are written by staff actions and by the nightly job, so a
 * refresh on this order keeps the badge current without a page reload and
 * without polling hard enough to matter.
 */
export const NOTIFICATION_POLL_MS = 30000;

/**
 * The signed in account's notification feed, shared by both portals.
 *
 * The API scopes every row to the caller, so this hook never asks for a user
 * id: whichever account the token belongs to is the one whose rows come back.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Set on unmount so a reply that lands late does not touch dead state.
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    try {
      const feed = await getNotifications();
      if (!mounted.current) return;
      setNotifications(feed.notifications);
      setUnreadCount(feed.unread_count);
    } catch {
      // A failed poll leaves the last known list on screen. The next tick
      // retries, so a brief network drop never empties the bell.
    } finally {
      if (mounted.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    reload();

    const timer = window.setInterval(reload, NOTIFICATION_POLL_MS);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [reload]);

  /**
   * Mark one row read.
   *
   * The row is marked on screen first so the dropdown reacts to the click, and
   * the API's own count replaces the guess once it answers.
   */
  const markRead = useCallback(async (notificationId: number) => {
    let wasUnread = false;

    setNotifications((current) =>
      current.map((notification) => {
        if (notification.notifications_id !== notificationId || notification.is_read) return notification;
        wasUnread = true;
        return { ...notification, is_read: true };
      })
    );

    if (!wasUnread) return;

    setUnreadCount((current) => Math.max(0, current - 1));

    try {
      const result = await markNotificationRead(notificationId);
      if (mounted.current) setUnreadCount(result.unread_count);
    } catch {
      // The row is still unread on the server. The next poll puts it back.
      reload();
    }
  }, [reload]);

  /** Mark every unread row read, one call each, as the API scopes them one by one. */
  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((notification) => !notification.is_read);
    if (unread.length === 0) return;

    setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
    setUnreadCount(0);

    await Promise.all(unread.map((notification) => markNotificationRead(notification.notifications_id).catch(() => undefined)));
    reload();
  }, [notifications, reload]);

  return { notifications, unreadCount, loaded, reload, markRead, markAllRead };
}
