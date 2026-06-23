/* ═══════════════════════════════════════════
   AdminPocket — Service Worker PWA
   Gère le cache et le mode hors ligne
═══════════════════════════════════════════ */

const VERSION_CACHE = 'adminpocket-v1';

/* Fichiers à mettre en cache au premier chargement */
const FICHIERS_CACHE = [
  './adminpocket.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

/* ── INSTALLATION : mise en cache initiale ── */
self.addEventListener('install', (event) => {
  console.log('[AdminPocket SW] Installation...');
  event.waitUntil(
    caches.open(VERSION_CACHE).then((cache) => {
      console.log('[AdminPocket SW] Mise en cache des fichiers essentiels');
      return cache.addAll(FICHIERS_CACHE).catch(err => {
        console.log('[AdminPocket SW] Certains fichiers non cachés (normal en dev) :', err);
      });
    })
  );
  self.skipWaiting();
});

/* ── ACTIVATION : nettoyage des anciens caches ── */
self.addEventListener('activate', (event) => {
  console.log('[AdminPocket SW] Activation...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== VERSION_CACHE)
          .map((name) => {
            console.log('[AdminPocket SW] Suppression ancien cache :', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

/* ── FETCH : stratégie Cache First puis Réseau ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Ignorer les requêtes non-GET et les API externes */
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin && !url.href.includes('fonts.googleapis')) return;

  event.respondWith(
    caches.match(request).then((responseCache) => {

      /* Si on a le fichier en cache → on le sert immédiatement */
      if (responseCache) {
        /* En arrière-plan, on essaie de mettre à jour le cache */
        fetch(request)
          .then((responseReseau) => {
            if (responseReseau && responseReseau.status === 200) {
              caches.open(VERSION_CACHE).then((cache) => {
                cache.put(request, responseReseau.clone());
              });
            }
          })
          .catch(() => {}); /* Pas de réseau = pas grave, on a le cache */

        return responseCache;
      }

      /* Pas en cache → on va chercher sur le réseau */
      return fetch(request)
        .then((responseReseau) => {
          if (!responseReseau || responseReseau.status !== 200) {
            return responseReseau;
          }

          /* On met en cache pour la prochaine fois */
          const responseACache = responseReseau.clone();
          caches.open(VERSION_CACHE).then((cache) => {
            cache.put(request, responseACache);
          });

          return responseReseau;
        })
        .catch(() => {
          /* Hors ligne et pas en cache → page de fallback */
          return caches.match('./adminpocket.html');
        });
    })
  );
});

/* ── NOTIFICATION PUSH (pour les relances documents) ── */
self.addEventListener('push', (event) => {
  let data = { title: 'AdminPocket', body: 'Vous avez une mise à jour sur votre dossier.' };

  try {
    data = event.data.json();
  } catch (e) {}

  const options = {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './adminpocket.html' },
    actions: [
      { action: 'ouvrir', title: 'Voir mon dossier' },
      { action: 'fermer', title: 'Plus tard' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

/* ── CLIC SUR NOTIFICATION ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'fermer') return;

  const urlCible = event.notification.data.url || './adminpocket.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      /* Si l'app est déjà ouverte → on l'amène au premier plan */
      for (const client of clientList) {
        if (client.url.includes('adminpocket') && 'focus' in client) {
          return client.focus();
        }
      }
      /* Sinon on ouvre une nouvelle fenêtre */
      if (clients.openWindow) {
        return clients.openWindow(urlCible);
      }
    })
  );
});
