const SHELL_CACHE = 'shetrust-shell-v2';
const DATA_CACHE  = 'shetrust-data-v2';
const SYNC_TAG    = 'shetrust-rating-sync';

const SHELL_ASSETS = ['/', '/index.html', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== DATA_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.hostname.includes('mapbox') || url.hostname.includes('googleapis')) return;

  if (url.pathname.startsWith('/api/locations') || url.pathname.startsWith('/api/ratings/location')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          caches.open(SHELL_CACHE).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/offline.html').then(r => r || caches.match('/'));
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(flushQueuedRatings());
});

async function flushQueuedRatings() {
  const db = await openDB();
  const items = await getAllPending(db);
  for (const item of items) {
    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${item.token || ''}` },
        body: JSON.stringify(item.payload),
      });
      if (res.ok) {
        await deletePending(db, item.id);
        const clients = await self.clients.matchAll();
        clients.forEach(c => c.postMessage({ type: 'RATING_SYNCED', localId: item.id }));
      }
    } catch (_) {}
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(res => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || networkPromise || new Response(
    JSON.stringify({ success: false, error: 'Offline — no cached data', offline: true }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('shetrust-offline', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending-ratings'))
        db.createObjectStore('pending-ratings', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}
function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction('pending-ratings','readonly').objectStore('pending-ratings').getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}
function deletePending(db, id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction('pending-ratings','readwrite').objectStore('pending-ratings').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

self.addEventListener('message', async (event) => {
  if (event.data?.type === 'QUEUE_RATING') {
    try {
      const db = await openDB();
      const tx = db.transaction('pending-ratings', 'readwrite');
      tx.objectStore('pending-ratings').add({ payload: event.data.payload, token: event.data.token, createdAt: Date.now() });
      if (self.registration.sync) await self.registration.sync.register(SYNC_TAG);
      event.source?.postMessage({ type: 'RATING_QUEUED' });
    } catch (e) { console.error('SW queue error:', e); }
  }
});
