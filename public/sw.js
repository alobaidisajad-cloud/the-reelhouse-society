// ============================================================
// REELHOUSE — SERVICE WORKER (NITRATE NOIR SYNC)
// Cache version auto-increments on every deploy via timestamp.
// Any byte change here triggers an automatic SW update.
// ============================================================

// BUILD_HASH changes every deploy, forcing SW update + cache bust
const BUILD_HASH = '20260407v1';
const CACHE_VERSION = `v-${BUILD_HASH}`;
const IMAGE_CACHE = `reelhouse-tmdb-images-${CACHE_VERSION}`;
const API_CACHE = `reelhouse-tmdb-api-${CACHE_VERSION}`;
const OFFLINE_CACHE = `reelhouse-offline-${CACHE_VERSION}`;
const ASSET_CACHE = `reelhouse-assets-${CACHE_VERSION}`;

// Cache size limits — prevent unbounded storage growth
const MAX_IMAGE_CACHE = 500;
const MAX_API_CACHE = 200;
const MAX_ASSET_CACHE = 100;

// Trim cache to max size — evicts oldest entries first
async function trimCache(cacheName, maxItems) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
        for (let i = 0; i < keys.length - maxItems; i++) {
            await cache.delete(keys[i]);
        }
    }
}

// Install — skip waiting to activate immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        // Delete ALL existing caches first, then cache offline page
        caches.keys().then((keys) =>
            Promise.all(keys.map((k) => caches.delete(k)))
        ).then(() =>
            caches.open(OFFLINE_CACHE).then((cache) => cache.add('/offline.html'))
        )
    );
    self.skipWaiting();
});

// Activate — purge ALL old caches and claim all clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== IMAGE_CACHE && key !== API_CACHE && key !== OFFLINE_CACHE) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. TMDB Image CDN — Stale-While-Revalidate (images rarely change)
    if (url.hostname === 'image.tmdb.org') {
        event.respondWith(
            caches.open(IMAGE_CACHE).then((cache) => {
                return cache.match(request).then((cached) => {
                    const fetchPromise = fetch(request).then((response) => {
                        if (response.ok) {
                            cache.put(request, response.clone());
                            trimCache(IMAGE_CACHE, MAX_IMAGE_CACHE);
                        }
                        return response;
                    }).catch(() => cached || new Response('', { status: 404 }));
                    return cached || fetchPromise;
                });
            })
        );
        return;
    }

    // 2. TMDB API — Stale-While-Revalidate
    if (url.hostname === 'api.themoviedb.org' && request.method === 'GET') {
        event.respondWith(
            caches.open(API_CACHE).then((cache) => {
                return cache.match(request).then((cached) => {
            const fetchPromise = fetch(request).then((response) => {
                        if (response.ok) {
                            cache.put(request, response.clone());
                            trimCache(API_CACHE, MAX_API_CACHE);
                        }
                        return response;
                    }).catch(() => cached);
                    return cached || fetchPromise;
                });
            })
        );
        return;
    }

    // 3. HTML Navigation — ALWAYS NETWORK, NEVER CACHE
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match('/offline.html'))
        );
        return;
    }

    // 4. JS/CSS Assets (hashed by Vite) — Cache First for hashed assets
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(
            caches.open(ASSET_CACHE).then((cache) => {
                return cache.match(request).then((cached) => {
                    if (cached) return cached;
                    return fetch(request).then((response) => {
                        if (response.ok) {
                            cache.put(request, response.clone());
                            trimCache(ASSET_CACHE, MAX_ASSET_CACHE);
                        }
                        return response;
                    });
                });
            })
        );
        return;
    }

    // 5. All other requests — pass through to network, no caching
    event.respondWith(fetch(request));
});

// Listen for messages
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data === 'CLEAR_CACHES') {
        caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    }
});

// ============================================================
// WEB PUSH NOTIFICATIONS
// ============================================================

self.addEventListener('push', (event) => {
    let payload = { title: 'ReelHouse', body: 'New cinematic activity.', url: '/' };
    try {
        if (event.data) {
            payload = event.data.json();
        }
    } catch (e) {
        // Fallback to text if JSON parse fails
        payload.body = event.data ? event.data.text() : payload.body;
    }

    const options = {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/icon-32-new.png',
        vibrate: [100, 50, 100],
        data: {
            url: payload.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            const urlToOpen = event.notification.data.url;
            // If reelhouse is already open, focus it and navigate
            for (let client of windowClients) {
                if (client.url.includes('thereelhousesociety.com') && 'focus' in client) {
                    client.focus();
                    if (urlToOpen && urlToOpen !== '/') client.navigate(urlToOpen);
                    return;
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen || '/');
            }
        })
    );
});
