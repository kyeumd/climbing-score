/**
 * 해제 전용 서비스워커.
 *
 * 오프라인 지원(PWA)을 넣었다가 되돌렸다. 그런데 파일만 지우면 이미 등록된
 * 서비스워커가 계속 살아서 옛 캐시를 내려준다. 그래서 이 파일을 남겨,
 * 브라우저가 갱신을 확인할 때 캐시를 비우고 자기 자신을 해제하게 한다.
 *
 * 모든 클라이언트가 최신 파일로 다시 로드된 뒤에는 이 파일도 지워도 된다.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(c.url);   // 최신 파일로 다시 그린다
  })());
});

// 남아 있는 동안에도 캐시를 쓰지 않고 항상 네트워크로 보낸다
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
