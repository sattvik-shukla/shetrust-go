/**
 * Offline Manager
 * Handles SW registration, online/offline detection, and queuing ratings
 * for background sync when connectivity is restored.
 */

let swRegistration = null;
let onlineStatusListeners = [];
let pendingSyncListeners = [];

/** Register the service worker. Call once at app startup. */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service worker registered');

    // Listen for sync completion messages from SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'RATING_SYNCED') {
        pendingSyncListeners.forEach(fn => fn(event.data.localId));
      }
      if (event.data?.type === 'RATING_QUEUED') {
        notifyListeners();
      }
    });
  } catch (e) {
    console.warn('SW registration failed:', e.message);
  }
}

/** Queue a rating for submission when offline. */
export async function queueRatingOffline(payload, token) {
  const sw = await getSW();
  if (!sw) {
    // Fallback: store in localStorage and retry manually
    const queue = getLocalQueue();
    queue.push({ payload, token, createdAt: Date.now() });
    localStorage.setItem('shetrust_offline_queue', JSON.stringify(queue));
    return;
  }
  sw.postMessage({ type: 'QUEUE_RATING', payload, token });
}

/** Get count of pending offline ratings from localStorage fallback. */
export function getLocalQueue() {
  try {
    return JSON.parse(localStorage.getItem('shetrust_offline_queue') || '[]');
  } catch { return []; }
}

/** Try to flush localStorage-queued ratings (for non-SW environments). */
export async function flushLocalQueue(apiSubmitFn) {
  const queue = getLocalQueue();
  if (!queue.length) return { flushed: 0, remaining: 0 };

  let flushed = 0;
  const remaining = [];
  for (const item of queue) {
    try {
      await apiSubmitFn(item.payload);
      flushed++;
    } catch (_) {
      remaining.push(item);
    }
  }
  localStorage.setItem('shetrust_offline_queue', JSON.stringify(remaining));
  return { flushed, remaining: remaining.length };
}

/** Subscribe to online/offline changes. Returns unsubscribe fn. */
export function onConnectionChange(fn) {
  onlineStatusListeners.push(fn);
  window.addEventListener('online',  handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => {
    onlineStatusListeners = onlineStatusListeners.filter(l => l !== fn);
  };
}

/** Subscribe to pending-sync-complete events. */
export function onRatingSynced(fn) {
  pendingSyncListeners.push(fn);
  return () => { pendingSyncListeners = pendingSyncListeners.filter(l => l !== fn); };
}

function handleOnline() {
  notifyListeners(true);
  // Attempt to flush localStorage queue when coming back online
  if (!swRegistration) {
    import('../utils/api').then(({ ratingsApi }) => {
      flushLocalQueue(payload => ratingsApi.submit(payload));
    });
  }
}

function handleOffline() {
  notifyListeners(false);
}

function notifyListeners(isOnline = navigator.onLine) {
  onlineStatusListeners.forEach(fn => fn(isOnline));
}

async function getSW() {
  if (swRegistration) return navigator.serviceWorker.controller;
  return null;
}

export function isOnline() {
  return navigator.onLine;
}
