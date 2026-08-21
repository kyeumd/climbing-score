/** 오프라인에서 앱이 뜨는지 확인한다. 캐시가 실제로 동작하는지가 핵심. */
import { launch, sleep } from './cdp.mjs';

const p = await (await launch({ width: 414, height: 896, dark: true })).connect();
// 서비스워커가 캐시를 채우려면 캐시를 켜 둬야 한다
await p.send('Network.setCacheDisabled', { cacheDisabled: false });
await p.goto('http://localhost:8099/index.html', { wait: 3000 });

const sw = await p.eval(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const keys = await caches.keys();
  const c = keys.length ? await caches.open(keys[0]) : null;
  return { 등록: !!reg, 활성: !!reg?.active, 캐시: keys, 항목수: c ? (await c.keys()).length : 0 };
});
console.log('서비스워커:', JSON.stringify(sw));

// 이제 네트워크를 끊고 새로 불러온다
await p.send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
});
await p.send('Page.reload', { ignoreCache: false });
await sleep(3200);

const after = await p.eval(() => ({
  화면: document.querySelector('#app')?.textContent?.slice(0, 40) ?? '(빈 화면)',
  카드: document.querySelectorAll('.gcard').length,
  탭바: document.querySelectorAll('.tab').length,
  짐: (JSON.parse(localStorage.getItem('climbing-score/v1') || '{}').gyms ?? []).length,
}));
console.log('오프라인 재로드:', JSON.stringify(after, null, 1));
console.log(after.탭바 === 4 ? '\n오프라인에서 앱이 정상 동작합니다' : '\n오프라인 동작 실패');
await p.close();
