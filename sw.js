/* Service worker de Musée.
 *
 * Réseau d'abord pour la page, les modules et les styles : sinon une version
 * périmée resterait figée après chaque publication. Le catalogue et les
 * polices se servent du cache d'abord (ils changent au plus une fois par mois
 * et pèsent lourd). Les images des musées ne passent jamais par ici.
 *
 * Toutes les applications partagent l'origine blinytz.github.io : on ne
 * supprime que les caches qui portent notre préfixe.
 *
 * Incrémenter `CACHE` à chaque changement de la liste des fichiers.
 */

const PREFIXE = 'musee-';
const CACHE = `${PREFIXE}v4-salon`;
const CACHE_CATALOGUE = `${PREFIXE}catalogue`;

const FICHIERS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './icons/icone.svg',
  './icons/icon-192.png',
  './polices/dm-sans-latin-400-normal.woff2',
  './polices/dm-sans-latin-500-normal.woff2',
  './polices/dm-sans-latin-600-normal.woff2',
  './polices/fraunces-latin-500-normal.woff2',
  './polices/fraunces-latin-600-normal.woff2',
  './polices/fraunces-latin-500-italic.woff2',
  './js/app.js',
  './js/config.js',
  './js/jeu.js',
  './js/donnees/registre.js',
  './js/donnees/local.js',
  './js/donnees/catalogue.js',
  './js/moteur/actions.js',
  './js/moteur/alea.js',
  './js/moteur/arrivages.js',
  './js/moteur/batiment.js',
  './js/moteur/classement.js',
  './js/moteur/etat.js',
  './js/moteur/journee.js',
  './js/moteur/lieux.js',
  './js/moteur/noms.js',
  './js/moteur/personnel.js',
  './js/moteur/securite.js',
  './js/moteur/regles.js',
  './js/moteur/temps.js',
  './js/moteur/visiteurs.js',
  './js/rendu/bruit.js',
  './js/rendu/images.js',
  './js/rendu/restauration.js',
  './js/ui/composants.js',
  './js/ui/dom.js',
  './js/ui/icones.js',
  './js/ui/push.js',
  './js/vendor/portraits.js',
  './js/ui/pages/arrivages.js',
  './js/ui/pages/atelier.js',
  './js/ui/pages/classement.js',
  './js/ui/pages/direction.js',
  './js/ui/pages/expositions.js',
  './js/ui/pages/historique.js',
  './js/ui/pages/investir.js',
  './js/ui/pages/musee.js',
  './js/ui/pages/oeuvre.js',
  './js/ui/pages/personnel.js',
  './js/ui/pages/securite.js',
  './js/ui/pages/rapport.js',
  './js/ui/pages/reglages.js',
  './js/ui/pages/reserve.js',
  './js/ui/pages/session.js',
  './catalogue/meta.json',
  './catalogue/musees.json',
  './catalogue/fusions.json',
];

// `cache.addAll` passerait par le cache HTTP (max-age=600 sur GitHub Pages)
// et remplirait le cache neuf de fichiers périmés.
async function remplirCache() {
  const cache = await caches.open(CACHE);
  await Promise.all(FICHIERS.map(async (f) => {
    try {
      const r = await fetch(new Request(f, { cache: 'reload' }));
      if (r.ok) await cache.put(f, r);
    } catch { /* un fichier manquant ne bloque pas l'installation */ }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(remplirCache().then(() => self.skipWaiting(), () => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles
      .filter((c) => c.startsWith(PREFIXE) && c !== CACHE && c !== CACHE_CATALOGUE)
      .map((c) => caches.delete(c))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;

  // Le catalogue : cache d'abord, revalidé en arrière-plan. Les tranches
  // d'œuvres ne changent qu'une fois par mois.
  if (url.pathname.includes('/catalogue/')) {
    event.respondWith(caches.open(CACHE_CATALOGUE).then(async (cache) => {
      const enCache = await cache.match(event.request);
      const reseau = fetch(new Request(url.href, { cache: 'no-cache' }))
        .then((r) => { if (r.ok) cache.put(event.request, r.clone()); return r; })
        .catch(() => null);
      return enCache || (await reseau) || new Response('[]', { status: 503 });
    }));
    return;
  }

  if (url.pathname.includes('/polices/')) {
    event.respondWith(caches.match(event.request).then((c) => c || fetch(event.request)));
    return;
  }

  // Réseau d'abord, revalidé : sans `no-cache`, le cache HTTP de dix minutes
  // servirait l'ancienne version.
  event.respondWith(fetch(new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }))
    .then((r) => {
      const copie = r.clone();
      if (r.ok) caches.open(CACHE).then((c) => c.put(event.request, copie)).catch(() => {});
      return r;
    })
    .catch(() => caches.match(event.request).then((c) => c || caches.match('./index.html'))));
});

/* ---------- Notifications ---------- */

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { titre: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(d.titre || 'Musée', {
    body: d.texte || '',
    tag: d.tag || undefined,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { route: d.route || 'musee' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data?.route || 'musee';
  event.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const ici = fenetres.find((f) => new URL(f.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    if (ici) {
      await ici.focus();
      ici.postMessage({ type: 'naviguer', route });
      return;
    }
    await self.clients.openWindow(`./#/${route}`);
  })());
});
