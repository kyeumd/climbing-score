/**
 * 진짜 Firebase 에 대고 확인한다. 가짜 서버로는 확인할 수 없는 것들이다.
 *
 *   1. 규칙이 게시됐는가 — 짧은 코드는 막히고 16자 코드는 열리는가
 *   2. 방 목록을 훑어 갈 수 없는가
 *   3. 쓰기가 되는가, 규칙에 어긋난 모양은 거절되는가
 *   4. EventSource 로 스트림이 열리는가  ← 이것 하나 때문에 이 파일이 있다
 *
 * 4번은 브라우저 안에서만 확인된다. Node 의 fetch 로는 헤더를 흉내 낼 수
 * 있지만, 정작 앱이 쓰는 건 브라우저의 EventSource 라서 그게 되는지를 봐야 한다.
 *
 *   node tools/check-firebase.mjs
 */
import { launch, sleep } from './cdp.mjs';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const DB = cfg.match(/export const DATABASE_URL = '([^']*)'/)?.[1] ?? '';
if (!DB) { console.log('src/config.js 에 주소가 없습니다.'); process.exit(1); }

/*
 * 규칙 파일이 요구하는 최소 길이를 그대로 가져와, 그 경계를 시험한다.
 * 숫자를 여기 또 적어 두면 규칙을 고칠 때 한쪽만 바뀐다.
 */
const RULES = JSON.parse(readFileSync(new URL('../firebase.rules.json', import.meta.url), 'utf8'));
const MIN = Number(RULES.rules.rooms.$room['.read'].match(/\$room\.length >= (\d+)/)?.[1]);
if (!Number.isFinite(MIN)) { console.log('firebase.rules.json 에서 길이 조건을 찾지 못했습니다.'); process.exit(1); }

/* 검증 전용 방. 사람 기록과 섞이지 않는 값이다. */
const ROOM = 'CHECK234567WXYZ2';   // 16자. 옛 규칙에서도 열리도록.
const JUST_LONG = 'A'.repeat(MIN);        // 딱 최소 길이 — 열려야 한다
const TOO_SHORT = 'A'.repeat(MIN - 1);    // 한 글자 모자람 — 막혀야 한다

let pass = 0; let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra ? ' — ' + extra : ''}`); }
};
const status = async (path, init) =>
  (await fetch(`${DB}${path}`, init).catch(() => ({ status: 0 }))).status;

console.log(`--- 규칙 (최소 ${MIN}자) ---`);
const roomRead = await status(`/rooms/${ROOM}.json`);
const justRead = await status(`/rooms/${JUST_LONG}.json`);
const shortRead = await status(`/rooms/${TOO_SHORT}.json`);
const listRead = await status('/rooms.json');
const rootRead = await status('/.json');

if (roomRead === 401) {
  console.log('  규칙이 아직 게시되지 않았습니다. 콘솔 규칙 탭에 firebase.rules.json 을 붙여 넣고 게시해 주세요.');
  process.exit(2);
}
if (justRead === 401) {
  console.log(`  게시된 규칙이 ${MIN}자보다 긴 코드를 요구합니다. firebase.rules.json 을 다시 게시해 주세요.`);
  console.log('  이대로 두면 앱이 만든 코드를 서버가 거절해, 화면에는 오류 없이 동기화만 죽습니다.');
  process.exit(2);
}
ok('앱이 쓰는 길이의 코드로 읽을 수 있다', roomRead === 200, `HTTP ${roomRead}`);

/*
 * 게시된 규칙이 파일보다 느슨한 경우.
 *
 * 앱은 언제나 정해진 길이의 코드만 만들고 받으므로 이건 앱을 깨뜨리지 않는다.
 * 우리 방을 여는 난이도와도 무관하다 — 그건 코드 길이가 아니라 코드가
 * 무작위라서 지켜진다. 다만 남이 짧은 이름으로 방을 만들어 이 데이터베이스를
 * 공짜 저장소로 쓸 수 있다. 실패로 세지는 않고 알리기만 한다.
 */
if (shortRead === 200) {
  console.log(`  참고: 게시된 규칙이 ${MIN - 1}자 방도 허용합니다. firebase.rules.json 을 다시 게시하면 조여집니다.`);
  console.log('  앱 동작에는 영향이 없습니다. 앱은 언제나 ' + MIN + '자 코드만 씁니다.');
} else {
  ok(`${MIN - 1}자 코드는 막힌다`, shortRead === 401, `HTTP ${shortRead}`);
}
ok('방 목록은 훑을 수 없다', listRead === 401, `HTTP ${listRead}`);
ok('루트는 읽을 수 없다', rootRead === 401, `HTTP ${rootRead}`);

console.log('--- 쓰기 ---');
const session = {
  id: 'ses_check', profileId: 'pf_check', gymId: 'gym_check',
  date: '2026-09-04', levelAtTime: 0, counts: { g1: 1 },
};
const wrote = await status(`/rooms/${ROOM}/sessions/ses_check.json`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(session),
});
ok('제대로 된 세션은 써진다', wrote === 200, `HTTP ${wrote}`);

/*
 * 거절은 응답 코드로 판정하지 않는다.
 *
 * 규칙에 어긋난 값도 Firebase 는 401 로 답한다. 권한 거절과 같은 코드다.
 * 코드만 보고 판정하면 "막혔다" 와 "주소가 틀렸다" 를 구분하지 못한다.
 * 써 보고 다시 읽어서, 실제로 없는 것을 확인한다.
 */
async function rejected(path, body) {
  await fetch(`${DB}${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => {});
  const back = await fetch(`${DB}${path}`).then((r) => r.json()).catch(() => 'read-failed');
  return back === null;
}

ok('모양이 틀린 세션은 안 써진다',
   await rejected(`/rooms/${ROOM}/sessions/ses_junk.json`, { hello: 'world' }));
ok('id 가 자기 자리와 다른 값도 안 써진다',
   await rejected(`/rooms/${ROOM}/profiles/pf_a.json`, { id: 'pf_b', name: '남' }));
ok('정해진 갈래 밖에는 못 쓴다',
   await rejected(`/rooms/${ROOM}/junk.json`, { x: 1 }));

console.log('--- 브라우저 EventSource 로 스트림 ---');
const page = await (await launch({ width: 414, height: 896, dark: true })).connect();
try {
  /*
   * 스트림을 연 뒤 다른 곳에서 값을 바꾸고, 그게 밀려 들어오는지 본다.
   * 붙자마자 오는 첫 이벤트는 초기 적재라 그것만으로는 '실시간'이 확인되지 않는다.
   */
  await page.goto(`${DB}/rooms/${ROOM}.json`, { wait: 800 });
  const started = await page.eval((url) => new Promise((resolve) => {
    window.__got = [];
    const es = new EventSource(url);
    window.__es = es;
    es.addEventListener('put', (e) => window.__got.push(e.data));
    es.addEventListener('open', () => resolve('open'));
    es.addEventListener('error', () => resolve('error'));
    setTimeout(() => resolve('timeout'), 8000);
  }), `${DB}/rooms/${ROOM}.json`);
  ok('EventSource 로 스트림이 열린다', started === 'open', started);

  await sleep(1200);
  const first = await page.eval(() => window.__got.length);
  ok('붙자마자 방 전체가 한 번 온다', first >= 1, `이벤트 ${first}개`);

  // 바깥에서 값을 바꾼다
  await fetch(`${DB}/rooms/${ROOM}/sessions/ses_check.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...session, counts: { g1: 7 } }),
  });
  let pushed = null;
  for (let i = 0; i < 40; i++) {
    const got = await page.eval(() => window.__got);
    pushed = got.find((g) => g.includes('"g1":7'));
    if (pushed) break;
    await sleep(250);
  }
  ok('다른 곳의 변경이 밀려 들어온다', !!pushed, pushed ? '' : '8초 안에 안 옴');
  await page.eval(() => window.__es?.close());
} catch (e) {
  fail++; console.log('  실패:', e.message);
}
await page.close();

// 검증용 방을 치운다
await fetch(`${DB}/rooms/${ROOM}.json`, { method: 'DELETE' }).catch(() => {});
console.log(fail ? `\n${pass}개 통과, ${fail}개 실패` : `\n전부 통과 (${pass}개)`);
process.exit(fail ? 1 : 0);
