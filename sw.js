/* NeuroTrilha — instalação pelo link. Internet primeiro; cópia guardada só sem internet. */
const CACHE = 'neurotrilha-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  // só as telas e arquivos do site; o que vem do servidor (avaliações, pacientes) nunca é guardado
  if (r.method !== 'GET' || u.origin !== location.origin || /\/(functions|api|auth)\//.test(u.pathname)) return;
  e.respondWith(fetch(r).then((resp) => {
    if (resp.ok && !u.search) { const c = resp.clone(); caches.open(CACHE).then((k) => k.put(r, c)); }
    return resp;
  }).catch(() => caches.match(r, { ignoreSearch: true })));
});
