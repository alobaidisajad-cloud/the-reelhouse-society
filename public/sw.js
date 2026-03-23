// ============================================================
// REELHOUSE — SERVICE WORKER v7 (NUCLEAR RESET)
// Forces a complete cache clear and re-activation.
// ============================================================

const IMAGE_CACHE = 'reelhouse-tmdb-images-v7';
const API_CACHE = 'reelhouse-tmdb-api-v7';
const OFFLINE_CACHE = 'reelhouse-offline-v7';

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

    // 1. TMDB Image CDN — Cache First (images are immutable by URL)
    if (url.hostname === 'image.tmdb.org') {
        event.respondWith(
            caches.open(IMAGE_CACHE).then((cache) => {
                return cache.match(request).then((cached) => {
                    if (cached) return cached;
                    return fetch(request).then((response) => {
                        if (response.ok) cache.put(request, response.clone());
                        return response;
                    }).catch(() => new Response('', { status: 404 }));
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
                        if (response.ok) cache.put(request, response.clone());
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

    // 4. JS/CSS Assets (hashed by Vite)
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(
            fetch(request).then((response) => {
                if (response.ok) return response;
                return new Response('', { status: 200, headers: { 'content-type': 'text/javascript' } });
            }).catch(() => new Response('', { status: 200, headers: { 'content-type': 'text/javascript' } }))
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
