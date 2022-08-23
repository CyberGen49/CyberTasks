
self.addEventListener('activate', (e) => {
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const reqUrl = e.request.url;
    e.respondWith((async() => {
        const cache = await caches.open('assets');
        const match = await caches.match(e.request);
        const netRes = fetch(e.request).then((res) => {
            if (res.ok && !reqUrl.match(/\/api\/.*$/))
                cache.put(e.request, res.clone());
            return res;
        });
        return match || netRes;
    })());
});