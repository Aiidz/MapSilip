/* Public assets only. Never cache account HTML, API, auth or Flight responses. */
const CACHE = 'mapsilip-public-v1';
const ASSETS = ['/offline.html', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('mapsilip-public-') && key !== CACHE)
    .map(key => caches.delete(key)))));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'MAPSILIP_ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const headers = request.headers;
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      request.mode !== 'navigate' || request.destination !== 'document' || url.pathname.includes('%') ||
      !headers.get('accept')?.includes('text/html') ||
      headers.has('rsc') || headers.has('next-router-state-tree') ||
      headers.get('accept')?.includes('text/x-component') || url.searchParams.has('_rsc') ||
      headers.has('next-router-prefetch') || headers.has('next-router-segment-prefetch') ||
      /prefetch/i.test(headers.get('purpose') ?? '') || /prefetch/i.test(headers.get('sec-purpose') ?? '') ||
      /^\/(api|auth|login|forgot-password|reset-password|tenant-login|tenant-forgot-password|tenant-reset-password|activate|request-account)(\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(request).catch(async error => {
    if (error?.name === 'AbortError') throw error;
    const fallback = await caches.match('/offline.html');
    if (fallback) return fallback;
    throw error;
  }));
});

const NOTICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LABELS = { payments: 'payment', maintenance: 'maintenance', accounts: 'account and room', visitors: 'visitor', concerns: 'concern' };
self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch { return; }
  if (data?.v !== 1 || !NOTICE_ID.test(data.notificationId) || !Object.hasOwn(LABELS, data.category)) return;
  event.waitUntil(self.registration.showNotification('MapSilip', {
    body: `You have a new ${LABELS[data.category]} update.`, icon: '/icon-192.png',
    tag: `mapsilip:${data.notificationId}`, renotify: false, data: { notificationId: data.notificationId },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const id = event.notification.data?.notificationId;
  if (!NOTICE_ID.test(id)) return;
  const destination = `${self.location.origin}/notifications/open?id=${id}`;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse only a window already on the fixed resolver; do not disrupt an unsaved form.
    const existing = clients.find(client => client.url === destination);
    if (existing) return existing.focus();
    return self.clients.openWindow(destination);
  })());
});
