/**
 * 동기화 규칙 중 브라우저 없이 지킬 수 있는 것들.
 *
 * 실제 동기화는 tools/e2e-sync.mjs 가 브라우저 둘로 확인한다. 여기서는
 * "이건 절대 이러면 안 된다" 는 규칙만 파일을 읽어 지킨다. 이런 것은 나중에
 * 누가 무심코 되돌리기 쉬운데, 되돌아간 걸 화면으로는 알아채기 어렵다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('서버 주소는 https 이거나 비어 있다', () => {
  /*
   * GitHub Pages 는 https 로 서빙된다. 여기에 http 주소를 넣으면 브라우저가
   * 혼합 콘텐츠로 막아, 화면에는 아무 오류도 없이 동기화만 조용히 죽는다.
   */
  const cfg = read('src/config.js');
  const url = cfg.match(/export const DATABASE_URL = '([^']*)'/)?.[1];
  assert.notEqual(url, undefined, 'DATABASE_URL 을 찾지 못했습니다');
  if (url) assert.ok(url.startsWith('https://'), `https 가 아닙니다: ${url}`);
});

test('시드 적재는 방에 올리지 않는다', () => {
  // 112곳을 방마다 복사하면 앱을 열 때마다 통째로 내려받는다
  const synced = read('src/storage/synced.js');
  const block = synced.slice(synced.indexOf('replaceAll(state)'));
  const line = block.slice(0, block.indexOf('\n'));
  assert.doesNotMatch(line, /remote/, `replaceAll 이 서버로 나갑니다: ${line}`);
});

test('서버 변경은 종류를 달고 온다', () => {
  /*
   * 개수만 바뀐 것과 구조가 바뀐 것을 구분하지 않으면, 빠른 갱신 통로가
   * 색 이름 변경을 삼켜서 다른 기기 화면이 영영 안 바뀐다. 실제로 그랬다.
   */
  const app = read('src/app.js');
  assert.match(app, /function onRemoteChange\(what\)/);
  assert.match(app, /what === 'sessions' && liveSync/);
});

test('보안 규칙과 앱이 같은 길이 조건을 쓴다', () => {
  /*
   * 둘이 어긋나면 앱에서는 받아 주는 코드를 서버가 거절한다. 화면에는
   * 아무 오류도 없이 동기화만 조용히 죽는다.
   */
  const rules = JSON.parse(read('firebase.rules.json'));
  const room = rules.rules.rooms.$room;
  const ruleMin = Number(room['.read'].match(/\$room\.length >= (\d+)/)?.[1]);
  const appLen = Number(read('src/domain/room.js').match(/const LENGTH = (\d+)/)?.[1]);
  assert.ok(Number.isFinite(ruleMin), '규칙에서 길이 조건을 찾지 못했습니다');
  assert.ok(Number.isFinite(appLen), '앱에서 코드 길이를 찾지 못했습니다');
  assert.equal(ruleMin, appLen, `규칙 ${ruleMin} vs 앱 ${appLen}`);
  assert.equal(room['.write'], room['.read'], '읽기와 쓰기 조건이 다릅니다');
});

test('초대 링크는 코드를 # 뒤에 둔다', () => {
  /*
   * # 뒤는 브라우저가 서버로 보내지 않는다. 경로나 물음표 뒤에 넣으면 코드가
   * GitHub Pages 접속 기록에 그대로 남는데, 그 코드가 곧 비밀번호다.
   */
  const app = read('src/app.js');
  assert.match(app, /shareLink\(\)\s*\{[\s\S]*?#room=/,
    '초대 링크가 # 뒤에 코드를 두지 않습니다');
  assert.match(app, /location\.hash\.match/, '링크에서 코드를 읽는 곳이 없습니다');
});

test('링크로 들어오면 주소창에서 코드를 지운다', () => {
  // 남겨 두면 뒤로 가기 기록과 화면 캡처에 열쇠가 따라다닌다
  const app = read('src/app.js');
  assert.match(app, /history\.replaceState/);
});

test('방 목록 자체는 읽을 수 없다', () => {
  // rooms 에 .read 가 있으면 코드를 몰라도 전부 훑어 갈 수 있다
  const rules = JSON.parse(read('firebase.rules.json'));
  assert.equal(rules.rules.rooms['.read'], undefined);
  assert.equal(rules.rules['.read'], undefined);
});

test('검사 도구는 서버에 붙지 않는다', () => {
  /*
   * 앱을 띄우는 것만으로 진짜 방이 하나 생기고 시드가 올라간다. review 한 번이
   * 25개다. 앱을 부르기 전에 꺼야 한다.
   */
  for (const tool of ['tools/seed.mjs', 'tools/shot-grid.mjs']) {
    const src = read(tool);
    assert.match(src, /climbing-score\/sync['"],\s*['"]off/, `${tool} 가 동기화를 끄지 않습니다`);
  }
});

test('검증용 페이지는 서버에 붙지 않는다', () => {
  /*
   * tools/e2e-*.html 은 app.js 를 그대로 불러온다. 주소가 채워진 뒤로는 그
   * 페이지가 만든 가짜 기록이 진짜 방으로 올라갔다. 실제로 그렇게 새고 나서
   * 막았다.
   */
  for (const page of ['tools/e2e-record.html', 'tools/e2e-editor.html']) {
    const src = read(page);
    assert.match(src, /climbing-score\/sync['"],\s*['"]off/, `${page} 가 동기화를 끄지 않습니다`);
    const offAt = src.indexOf("climbing-score/sync");
    const importAt = src.indexOf("import('../src/app.js')");
    assert.ok(offAt > 0 && importAt > 0 && offAt < importAt,
      `${page} 에서 앱을 부르기 전에 꺼야 합니다`);
  }
});
