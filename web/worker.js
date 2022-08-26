
self.addEventListener('activate', (e) => {
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const reqUrl = e.request.url;
    e.respondWith((async() => {
        // Open asset cache and see if this request is in it
        const cache = await caches.open('assets');
        const match = await caches.match(e.request);
        // Request the resource from the network
        const netRes = fetch(e.request).then((res) => {
            // If the request was successful and this isn't an API call,
            // update the cached resource
            if (res.ok && !reqUrl.match(/\/api\/.*$/)) {
                cache.put(e.request, res.clone());
            }
            // Return the response
            return res;
        });
        // Return the cached resource if it exists
        // Otherwise, return the network request
        return match || netRes;
    })());
});