// Service worker: permite instalar o app e abrir a tela inicial mesmo com sinal fraco.
// Estratégia "rede primeiro": sempre tenta a versão nova; usa o cache só se estiver offline.
const CACHE = 'alerta-fogo-v2';
const BASE = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/util.js', 'js/classificacao.js',
  'js/api.js', 'js/solicitante.js', 'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css', 'lib/supabase.js',
  'img/icone.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('painel.html')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copia = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
