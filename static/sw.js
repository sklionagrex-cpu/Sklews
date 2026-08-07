const CACHE = 'sklews-v3';
const ASSETS = [
  '/static/css/style.css?v=20260807c',
  '/static/js/script.js?v=20260807c',
  '/static/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) {
    return;
  }
  // network-first for JS/CSS so updates apply
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.search.includes('v=')) {
    e.respondWith(fetch(e.request).then(r => r).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
