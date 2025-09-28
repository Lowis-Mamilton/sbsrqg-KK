// 定義快取名稱和要快取的檔案清單
const CACHE_NAME = 'lucky-formula-generator-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
  // 若有其他外部腳本或樣式，也請加入此處
];

// 安裝 Service Worker 並快取所有檔案
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 攔截所有網路請求，優先從快取中回應
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 如果在快取中找到資源，則直接回傳
        if (response) {
          return response;
        }
        // 若快取中沒有，則進行網路請求
        return fetch(event.request).then(
            (response) => {
                // 檢查是否為有效的回應
                if(!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // 複製一份回應並加入快取
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                return response;
            }
        );
      })
  );
});

// 啟用新的 Service Worker 並清除舊的快取
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});