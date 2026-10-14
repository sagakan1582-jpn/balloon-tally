// 画面のファイルを端末に控えておき、電波が切れていてもアプリを開けるようにする。
// 常にネットワークを優先するので、更新は次に開いたときに反映される。
// ファイルを追加・改名したら SHELL を直し、CACHE の番号を上げること。
const CACHE = 'balloon-v2';
const SHELL = [
  './',
  'index.html',
  'admin.html',
  'css/style.css',
  'js/config.js',
  'js/core.js',
  'js/queue.js',
  'js/storage.js',
  'js/store.js',
  'js/dom.js',
  'js/icons.js',
  'js/input.js',
  'js/admin.js',
  'vendor/supabase.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Supabase への通信など、別オリジンや GET 以外には手を出さない。
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request, { cache: 'no-cache' }).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (!cached) return network;
  // 控えがあるときは、圏外や極端に遅い回線で待たせずに控えを返す。
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), TIMEOUT_MS));
  return Promise.race([network.catch(() => cached), timeout]);
}
