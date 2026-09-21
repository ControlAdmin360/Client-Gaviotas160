// Service worker mínimo: solo habilita la instalación como app y da un
// respaldo offline para el "cascarón" estático. Los datos (RPC al backend)
// SIEMPRE van a la red — nunca se cachean, para no mostrar cifras viejas.
const CACHE_NAME = 'gaviotas160-shell-v2';
const SHELL_FILES = [
  './index.html',
  './CSS.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo intervenimos GET de nuestro propio origen (el "cascarón" estático).
  // Todo lo demás (RPC al backend, recursos externos) va directo a la red,
  // tal cual lo haría sin service worker.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    // cache: 'reload' evita que el navegador conteste con su propia caché
    // HTTP (Cache-Control) antes de llegar a la red — así una actualización
    // publicada se ve de inmediato, sin depender de que el usuario borre caché.
    fetch(req, { cache: 'reload' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
