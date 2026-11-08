/* ============================================================
   Service worker: hace que el juego abra SIN INTERNET después
   de la primera visita. Es solo para la página web: no instala
   ninguna app (funciona igual en iPhone, Android y computador).

   - Archivos del juego (html, css, js): primero intenta la red
     (así siempre ves la última versión) y si no hay internet usa
     la copia guardada.
   - MediaPipe, su modelo de la mano y las letras: usa la
     copia guardada (son archivos que no cambian) y si no la hay,
     la descarga y la guarda.
   Al cambiar VERSION se borran las copias viejas.
   ============================================================ */
const VERSION = 'fingergol-1.5.2';

const ARCHIVOS = [
  './',
  'index.html',
  'css/estilos.css?v=1.5.2',
  'assets/icono.svg',
  'js/config.js?v=1.5.2',
  'js/utilidades.js?v=1.5.2',
  'js/audio/sonidos.js?v=1.5.2',
  'js/juego/fisica.js?v=1.5.2',
  'js/juego/cpu.js?v=1.5.2',
  'js/entrada/camara.js?v=1.5.2',
  'js/entrada/hand-tracker.js?v=1.5.2',
  'js/entrada/gestos.js?v=1.5.2',
  'js/entrada/puntero.js?v=1.5.2',
  'js/render/render-pantalla.js?v=1.5.2',
  'js/red/red.js?v=1.5.2',
  'js/tutorial/tutorial.js?v=1.5.2',
  'js/app.js?v=1.5.2'
];

// librerías y archivos de otros sitios que vale la pena guardar
const EXTERNOS = [
  'cdn.jsdelivr.net',
  'storage.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // /salud dice si el servidor está corriendo: siempre se pregunta a la red
    if (url.pathname.endsWith('/salud') || url.pathname.endsWith('/ws')) return;
    ev.respondWith(redPrimero(req));
    return;
  }
  if (EXTERNOS.includes(url.hostname)) ev.respondWith(copiaPrimero(req));
});

/** Archivos del juego: la red primero; sin internet, la copia. */
async function redPrimero(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const copia = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
    if (copia) return copia;
    if (req.mode === 'navigate') {
      const inicio = await cache.match('index.html');
      if (inicio) return inicio;
    }
    throw e;
  }
}

/** Librerías externas: la copia primero; si no hay, se descarga y se guarda. */
async function copiaPrimero(req) {
  const cache = await caches.open(VERSION);
  const copia = await cache.match(req);
  if (copia) return copia;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
