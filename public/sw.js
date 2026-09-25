/* Service worker: guarda la app para abrirla sin conexión
   y muestra las notificaciones push que manda el servidor. */
const CACHE = 'monitor-hidro-v6';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'app.js', 'historial.js', 'manifest.webmanifest', 'iconos/icon-192.png', 'iconos/icon-512.png', 'iconos/logo-claro.png', 'iconos/logo-oscuro.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Archivos de la app: primero la red (así siempre se ve la última versión);
// si no hay conexión, se usa la copia guardada. Datos (/api/...): siempre de la red.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/') || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request))
  );
});

// Llega un aviso del servidor: { titulo, cuerpo, clave, urgente }
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { titulo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Aviso del invernadero', {
    body: d.cuerpo || '',
    tag: d.clave || 'aviso',          // un aviso nuevo del mismo tipo reemplaza al anterior
    renotify: true,
    requireInteraction: !!d.urgente,  // los urgentes quedan en pantalla hasta que se tocan
    icon: 'iconos/icon-192.png',
    badge: 'iconos/icon-192.png',
    vibrate: d.urgente ? [300, 100, 300, 100, 300] : [200]
  }));
});
// Tocar la notificación abre la app en la pestaña de avisos
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(ws => ws.length ? ws[0].focus() : self.clients.openWindow('./')));
});
