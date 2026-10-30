/* NeuroTrilha — instalação pelo link. Internet primeiro; cópia guardada só sem internet. */
const CACHE = 'neurotrilha-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then((resp) => {
    if (resp.ok && !u.search) { const c = resp.clone(); caches.open(CACHE).then((k) => k.put(r, c)); }
    return resp;
  }).catch(() => caches.match(r, { ignoreSearch: true })));
});
