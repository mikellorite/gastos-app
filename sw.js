// Guarda la app para que abra sin conexión. Los datos (datos.enc) los gestiona app.js:
// siempre intenta descargar los últimos y, si no hay red, usa la última copia.
const CACHE = "rosie-v2";
const APP = ["./", "index.html", "estilos.css", "app.js", "manifest.webmanifest", "icono-180.png", "icono-192.png", "icono-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("datos.enc")) return;
  // red primero (para coger versiones nuevas de la app), caché si no hay conexión
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
