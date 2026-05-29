// GestOK Service Worker
const CACHE_NAME = 'gestok-v1';

self.addEventListener('install', e => {
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
    // Dejar pasar todas las requests normalmente
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
