/**
 * 오프라인 지원.
 *
 * 암장은 지하가 많아 신호가 끊긴다. 기록은 localStorage에 있으니
 * 껍데기(HTML·CSS·JS·시드)만 캐시해 두면 신호 없이도 앱이 뜬다.
 *
 * 전략: 껍데기는 캐시 우선(빠르고 오프라인에서도 동작),
 *       그 외는 네트워크 우선. 버전을 올리면 옛 캐시를 지운다.
 */
const VERSION = 'v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './src/app.js',
  './src/styles/app.css',
  './src/styles/tokens.css',
  './src/domain/scoring.js',
  './src/domain/session.js',
  './src/domain/match.js',
  './src/domain/gym.js',
  './src/domain/profile.js',
  './src/domain/ids.js',
  './src/storage/adapter.js',
  './src/storage/local-storage.js',
  './src/storage/seed.js',
  './src/ui/components.js',
  './src/ui/hold.js',
  './src/ui/view-match.js',
  './src/ui/view-stats.js',
  './src/ui/view-profile.js',
  './src/ui/view-gym.js',
  './src/ui/view-score-table.js',
  './src/ui/session-editor.js',
  './src/ui/gym-picker.js',
  './data/gyms.seed.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // 한 파일이 실패해도 나머지는 캐시한다
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;   // 폰트 등 외부는 브라우저에 맡긴다

  e.respondWith(
    caches.match(request).then((hit) => {
      // 캐시가 있으면 바로 주고, 뒤에서 조용히 갱신한다
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit ?? fresh;
    }),
  );
});
