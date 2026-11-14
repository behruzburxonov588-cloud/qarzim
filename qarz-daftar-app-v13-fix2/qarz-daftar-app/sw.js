// Qarzim: o'rnatiladigan ilova (PWA) + bildirishnoma
const CACHE = 'qd-shell-v4';   // v13: uslublar HTML ichida, logo va favicon o‘rnatildi — eski kesh almashtiriladi
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// Internet yo'q bo'lsa, oxirgi ochilgan ilovani ko'rsatadi. API so'rovlariga tegmaydi.
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.mode !== 'navigate') return;
  e.respondWith(fetch(r).then((res) => { if (res.ok && new URL(r.url).pathname === '/') { const cp = res.clone(); caches.open(CACHE).then((c) => c.put('/', cp)); } return res; })
    .catch(() => caches.match('/').then((m) => m || Response.error())));
});
self.addEventListener('push', (e) => {
  let d = { title: 'Qarzim', body: '' };
  try { d = Object.assign(d, e.data.json()); } catch (err) { /* matn emas */ }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'qd-digest', renotify: true, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
