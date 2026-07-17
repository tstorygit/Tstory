// Service Worker for PWA installation + offline support.
//
// Strategy: NETWORK-FIRST for all same-origin GET requests, falling back to
// the cache only when the network is unavailable. This guarantees that after
// an app upgrade the browser always picks up fresh JS/CSS/HTML immediately
// (no stale-module bugs), while still allowing the app to open offline.
//
// Bump CACHE_VERSION whenever the caching logic itself changes — old caches
// are purged on activate.
const CACHE_VERSION = 'ai-reader-cache-v3';

self.addEventListener('install', () => {
    // Activate the new worker immediately instead of waiting for old tabs to close.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    // Never intercept cross-origin requests (Gemini API, CDN, sync URLs).
    let url;
    try { url = new URL(req.url); } catch (_) { return; }
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        try {
            const fresh = await fetch(req);
            // Cache successful responses for offline fallback.
            if (fresh && fresh.ok) {
                const cache = await caches.open(CACHE_VERSION);
                cache.put(req, fresh.clone());
            }
            return fresh;
        } catch (err) {
            const cached = await caches.match(req);
            if (cached) return cached;
            throw err;
        }
    })());
});
