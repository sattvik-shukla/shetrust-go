/**
 * NotificationBell
 * – Floating bell icon showing unread count
 * – Dropdown inbox with mark-read, deeplinks
 * – Push subscription toggle
 * – Connects to Socket.io user room for real-time delivery
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import styles from './NotificationBell.module.css';

const TYPE_ICON = {
  sti_drop:        '🔴',
  sti_improve:     '🟢',
  zone_alert:      '⚠️',
  incident_nearby: '🚨',
  weekly_digest:   '📊',
  system:          '📣',
};

export default function NotificationBell({ socket }) {
  const { user }          = useAuth() || {};
  const [open, setOpen]   = useState(false);
  const [notifs, setNotifs]     = useState([]);
  const [unread, setUnread]     = useState(0);
  const [loading, setLoading]   = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const bellRef = useRef(null);

  const isLoggedIn = !!user;

  // Load notifications
  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const res = await api.get('/notifications?limit=20');
      setNotifs(res.data.data || []);
      setUnread(res.data.unreadCount || 0);
    } catch (_) {} finally { setLoading(false); }
  }, [isLoggedIn]);

  useEffect(() => { load(); }, [load]);

  // Real-time socket notifications
  useEffect(() => {
    if (!socket || !user?._id) return;
    socket.emit('join-user', user._id);
    socket.on('notification', (notif) => {
      setNotifs(prev => [notif, ...prev].slice(0, 30));
      setUnread(c => c + 1);
    });
    // Zone alerts (no login needed)
    socket.on('zone-alert', (alert) => {
      setNotifs(prev => [{
        _id: `zone-${Date.now()}`,
        type: 'zone_alert',
        title: alert.title,
        body:  alert.body,
        createdAt: alert.sentAt,
        read: false,
      }, ...prev].slice(0, 30));
      if (!isLoggedIn) setUnread(c => c + 1);
    });
    return () => {
      socket.off('notification');
      socket.off('zone-alert');
    };
  }, [socket, user?._id, isLoggedIn]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id) => {
    setNotifs(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
    setUnread(c => Math.max(0, c - 1));
    try { await api.put(`/notifications/${id}/read`); } catch (_) {}
  };

  const markAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
    try { await api.put('/notifications/read-all'); } catch (_) {}
  };

  const togglePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported in this browser.');
      return;
    }
    if (pushEnabled) {
      await api.delete('/notifications/push-sub');
      setPushEnabled(false);
      return;
    }
    try {
      const permResult = await Notification.requestPermission();
      if (permResult !== 'granted') { alert('Notification permission denied.'); return; }

      const keyRes = await api.get('/notifications/vapid-key');
      const vapidKey = keyRes.data.vapidPublicKey;
      if (!vapidKey) { alert('Push not configured on server.'); return; }

      const sw = await navigator.serviceWorker.ready;
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await api.post('/notifications/push-sub', sub.toJSON());
      setPushEnabled(true);
    } catch (e) { console.error('Push sub error:', e); }
  };

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  const timeAgo = (d) => {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className={styles.wrap} ref={bellRef}>
      <button
        className={styles.bell}
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.header}>
            <span className={styles.headerTitle}>Notifications</span>
            <div className={styles.headerActions}>
              {unread > 0 && (
                <button className={styles.markAllBtn} onClick={markAllRead}>Mark all read</button>
              )}
              {isLoggedIn && (
                <button
                  className={`${styles.pushBtn} ${pushEnabled ? styles.pushOn : ''}`}
                  onClick={togglePush}
                  title={pushEnabled ? 'Disable push notifications' : 'Enable push notifications'}
                >
                  {pushEnabled ? '🔔 On' : '🔕 Off'}
                </button>
              )}
            </div>
          </div>

          {!isLoggedIn && (
            <div className={styles.loginHint}>
              <a href="/auth">Sign in</a> to receive personalised safety alerts for locations you've rated.
            </div>
          )}

          <div className={styles.list}>
            {loading && <div className={styles.empty}>Loading…</div>}
            {!loading && notifs.length === 0 && (
              <div className={styles.empty}>
                No notifications yet.<br />
                <span className={styles.emptyHint}>You'll be alerted when safety changes near you.</span>
              </div>
            )}
            {notifs.map(n => (
              <div
                key={n._id}
                className={`${styles.item} ${!n.read ? styles.itemUnread : ''}`}
                onClick={() => { markRead(n._id); if (n.url) window.location.href = n.url; }}
              >
                <span className={styles.itemIcon}>{TYPE_ICON[n.type] || '📣'}</span>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>{n.title}</div>
                  <div className={styles.itemText}>{n.body}</div>
                  <div className={styles.itemTime}>{timeAgo(n.createdAt)}</div>
                </div>
                {!n.read && <span className={styles.unreadDot} />}
              </div>
            ))}
          </div>

          {isLoggedIn && (
            <div className={styles.footer}>
              <a href="/auth?tab=notifications" className={styles.footerLink}>Manage alert preferences →</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
