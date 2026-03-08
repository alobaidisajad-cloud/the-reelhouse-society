const CACHE_NAME = 'reelhouse-shell-v2';
const API_CACHE = 'reelhouse-tmdb-api-v2';
const IMAGE_CACHE = 'reelhouse-tmdb-images-v2';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    // Install immediately
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    // Clear out old obsolete caches
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (![CACHE_NAME, API_CACHE, IMAGE_CACHE].includes(key)) {
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

    // 1. TMDB Image CDN — Cache First strategy (Images don't change)
    if (url.hostname === 'image.tmdb.org') {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(request).then((networkResponse) => {
                    if (networkResponse.ok) {
                        const clone = networkResponse.clone();
                        caches.open(IMAGE_CACHE).then((cache) => cache.put(request, clone));
                    }
                    return networkResponse;
                }).catch(() => new Response('', { status: 404 })); // Fallback
            })
        );
        return;
    }

    // 2. TMDB API Calls — Stale-While-Revalidate (Fast UI, updates cache in background)
    if (url.hostname === 'api.themoviedb.org' && request.method === 'GET') {
        event.respondWith(
            caches.open(API_CACHE).then((cache) => {
                return cache.match(request).then((cachedResponse) => {
                    const fetchPromise = fetch(request).then((networkResponse) => {
                        if (networkResponse.ok) cache.put(request, networkResponse.clone());
                        return networkResponse;
                    }).catch(() => cachedResponse); // Fallback to cache if offline

                    // Return cached instantly if available, otherwise wait for network
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // 3. App Shell & Assets (JS/CSS) — Network First, fallback to cache
    if (request.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
        event.respondWith(
            fetch(request).then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                return response;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // Default fetch for everything else
    event.respondWith(fetch(request));
});
