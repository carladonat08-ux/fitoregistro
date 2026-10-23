// FitoLupa: funciona sin conexión en el campo.
// La página y los datos se piden primero a la red (siempre lo más reciente) y, si no hay cobertura,
// se sirven desde la copia guardada en el móvil o el ordenador.
const CACHE = "fitoregistro-v11";
const BASE = ["./", "index.html", "data/indice.json", "data/usos.json", "data/version.json", "data/wwf.json", "manifest.webmanifest", "icon.svg", "importar.js", "vendor/pdf.min.js", "vendor/pdf.worker.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const propio = url.origin === location.origin;
  const libreria = /^(cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com)$/.test(url.hostname);
  if (!propio && !libreria) return;
  if (libreria) {
    // Librerías y fuentes: versión fija, se sirven de la copia si existe
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
});
