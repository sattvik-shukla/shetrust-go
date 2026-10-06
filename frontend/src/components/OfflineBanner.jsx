/**
 * OfflineBanner
 * Shows a banner when the user is offline.
 * Shows a "synced N ratings" toast when back online.
 */
import React, { useState, useEffect } from 'react';
import { onConnectionChange, onRatingSynced, getLocalQueue } from '../utils/offlineManager';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncedCount, setSyncedCount] = useState(0);
  const [showSyncedToast, setShowSyncedToast] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const unsub = onConnectionChange((online) => {
      setIsOnline(online);
      if (online) {
        const pending = getLocalQueue().length;
        if (pending > 0) {
          setTimeout(() => {
            setShowSyncedToast(true);
            setSyncedCount(pending);
            setTimeout(() => setShowSyncedToast(false), 4000);
          }, 2000);
        }
      }
    });

    const unsubSync = onRatingSynced(() => {
      setSyncedCount(c => c + 1);
    });

    // Update pending count
    const updatePending = () => setPendingCount(getLocalQueue().length);
    updatePending();
    const interval = setInterval(updatePending, 5000);

    return () => { unsub(); unsubSync(); clearInterval(interval); };
  }, []);

  if (isOnline && !showSyncedToast) return null;

  if (!isOnline) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: 'linear-gradient(135deg, #1f1f23, #2d1f1f)',
        borderBottom: '2px solid #EF4444',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📵</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#FCA5A5' }}>
              You're offline — showing cached data
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
              Ratings will be saved and submitted when you're back online
              {pendingCount > 0 && ` · ${pendingCount} pending`}
            </div>
          </div>
        </div>
        <a
          href="/offline.html"
          style={{ fontSize: 11, color: '#E63B6F', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Emergency info →
        </a>
      </div>
    );
  }

  if (showSyncedToast) {
    return (
      <div style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#065F46', border: '1px solid #059669',
        borderRadius: 10, padding: '10px 18px',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 13, color: '#A7F3D0',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        animation: 'fadeInDown 0.3s ease',
      }}>
        <span>✅</span>
        Back online — {syncedCount} rating{syncedCount !== 1 ? 's' : ''} submitted
      </div>
    );
  }

  return null;
}
