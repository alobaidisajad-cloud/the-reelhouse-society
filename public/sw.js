// ============================================================
// REELHOUSE — SERVICE WORKER v5
// Elite Strategy:
//   - HTML/navigation: NETWORK FIRST (never cached — always fresh from Vercel CDN)
//   - JS/CSS assets: NETWORK FIRST with cache fallback (Vercel handles immutable cache via headers)
//   - TMDB Images: CACHE FIRST (images are immutable by URL hash)
//   - TMDB API: STALE-WHILE-REVALIDATE (fast UI, background refresh)
//
// Cache busting is handled by vercel.json headers, NOT by sw version strings.
// ============================================================

const IMAGE_CACHE = 'reelhouse-tmdb-images-v6';
const API_CACHE = 'reelhouse-tmdb-api-v6';
const OFFLINE_CACHE = 'reelhouse-offline-v6';

// Install — skip waiting to activate immediately, don't pre-cache any shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(OFFLINE_CACHE).then((cache) => cache.add('/offline.html'))
    );
    self.skipWaiting();
});

// Activate — purge ALL old caches
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

    // 2. TMDB API — Stale-While-Revalidate (fast UI, background cache update)
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

    // 3. HTML Navigation — NETWORK FIRST, NO CACHE
    // Vercel CDN delivers fresh HTML with no-cache headers (handled by vercel.json)
    // We must not intercept or cache HTML — it causes the exact deployment mismatch bug we had.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match('/offline.html'))
        );
        return;
    }

    // 4. All other requests — pass through to network
    // JS/CSS assets have immutable cache-control from Vercel CDN directly.
    // We do not need to cache them in the service worker.
    event.respondWith(fetch(request));
});
