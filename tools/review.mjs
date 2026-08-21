/**
 * 검토 루프 — 실제 앱(index.html)만 본다.
 *
 * 예전에는 tools/demo.html 에 시나리오 데이터를 심어 캡처했다. 그게 함정이었다.
 * 데모는 보기 좋게 꾸민 화면이라, 사용자가 실제로 보는 index.html 과 다르다.
 * 도구가 스스로를 속이는 셈이었다.
 *
 * 그래서 여기서는 실제 앱을 띄운 뒤 사용자가 하듯 눌러서 상태를 만든다.
 * 느리지만 이게 사용자가 보는 화면이다.
 *
 *   node tools/review.mjs                다크 414x896
 *   node tools/review.mjs --light        라이트
 *   node tools/review.mjs --small        360x640
 *   node tools/review.mjs --only 짐      이름에 '짐'이 든 장면만
 */
import { launch, sleep } from './cdp.mjs';
import { readdirSync, unlinkSync, mkdirSync } from 'node:fs';

const APP = 'http://localhost:8099/index.html';
const args = process.argv.slice(2);
const light = args.includes('--light');
const small = args.includes('--small');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const [W, H] = small ? [360, 640] : [414, 896];
const VARIANT = small ? 'small' : (light ? 'light' : 'dark');
const OUT = `tools/shots/${VARIANT}`;

const $ = `
  const q = (s, n = 0) => document.querySelectorAll(s)[n];
  const byText = (s, t) => [...document.querySelectorAll(s)].find(e => e.textContent.includes(t));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const tap = (el) => { if (!el) throw new Error('없음');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    if (!el.classList.contains('gcard')) el.click(); };
`;

/** 실제 앱에서 사용자가 하듯 눌러 기록이 있는 상태를 만든다 */
const SEED_BY_HAND = `
  ${$}
  // 짐 고르기
  tap(byText('.btn', '클라이밍장'));
  await wait(700);
  const search = q('.field[type=search]');
  search.value = '더클라임 강남';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(400);
  tap(q('.gymrow__pick'));
  await wait(600);
  // 색 순서 확인
  const ok = byText('.btn', '맞아요');
  if (ok) { tap(ok); await wait(500); }
  // 프로필 만들기
  tap(byText('.btn', '프로필') || byText('.btn', '참가자'));
  await wait(600);
  const mk = byText('.modal .btn', '새 참가자');
  if (mk) { tap(mk); await wait(500); }
  const nameInput = q('.modal .field');
  nameInput.value = '동균';
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(200);
  tap(byText('.modal .btn', '추가'));
  await wait(700);
  // 완등 몇 개 기록
  for (const [i, n] of [[3, 4], [4, 2], [5, 1]]) {
    for (let k = 0; k < n; k++) { tap(q('.gcard', i)); await wait(160); }
  }
`;

const SCENES = [
  ['01 대결', null],
  ['02 대결-스크롤', `window.scrollTo(0, document.body.scrollHeight)`],
  ['03 기록', `tap(q('.tab', 1))`],
  ['04 기록-스크롤', `tap(q('.tab', 1)); await wait(500); window.scrollTo(0, document.body.scrollHeight)`],
  ['05 프로필', `tap(q('.tab', 2))`],
  ['06 짐설정', `tap(q('.tab', 3))`],
  ['07 짐설정-스크롤', `tap(q('.tab', 3)); await wait(500); window.scrollTo(0, document.body.scrollHeight)`],
  ['08 점수표', `tap(q('.tab', 3)); await wait(500); tap(byText('.btn', '점수표'))`],
  ['09 짐선택기', `tap(q('.matchbar__gym'))`],
  ['10 짐선택기-스크롤', `tap(q('.matchbar__gym')); await wait(600); q('.modal__body').scrollTop = 300`],
  ['11 짐선택기-검색', `tap(q('.matchbar__gym')); await wait(600);
    const s = q('.field[type=search]'); s.value = '강남'; s.dispatchEvent(new Event('input', {bubbles:true}))`],
  ['12 짐선택기-결과없음', `tap(q('.matchbar__gym')); await wait(600);
    const s = q('.field[type=search]'); s.value = 'zzzz'; s.dispatchEvent(new Event('input', {bubbles:true}))`],
  ['13 참가자선택', `tap(byText('.btn', '참가자 추가'))`],
  ['14 숙련도', `tap(q('.tab', 2)); await wait(500); tap(q('.profilerow .iconbtn'))`],
  ['15 세션편집', `tap(q('.tab', 1)); await wait(600); q('.sessionrow').click()`],
  ['16 색고르기', `tap(q('.tab', 3)); await wait(600); tap(q('.graderow__dot'))`],
  ['17 짐추가', `tap(q('.matchbar__gym')); await wait(600); tap(byText('.modal .btn', '직접 추가'))`],
];

const FRESH = [
  ['18 첫실행', null],
  ['19 첫실행-기록탭', `tap(q('.tab', 1))`],
  ['20 첫실행-짐설정탭', `tap(q('.tab', 3))`],
];

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.png')) unlinkSync(`${OUT}/${f}`);

async function run(scenes, seeded) {
  for (const [name, code] of scenes) {
    if (only && !name.includes(only)) continue;
    const page = await (await launch({ width: W, height: H, dark: !light })).connect();
    try {
      await page.goto(APP, { wait: 600 });
      await page.eval(() => localStorage.clear());
      await page.goto(APP, { wait: 2500 });
      if (seeded) {
        await page.eval(new Function(`return (async()=>{ ${SEED_BY_HAND} })()`));
        await sleep(600);
      }
      if (code) {
        await page.eval(new Function(`return (async()=>{ ${$} ${code} })()`));
        await sleep(750);
      }
      await page.shot(`${OUT}/${name.replace(/\s/g, '_')}.png`);
      process.stdout.write('.');
    } catch (e) {
      console.log(`\n  ${name} 실패: ${String(e.message).slice(0, 70)}`);
    }
    await page.close();
  }
}

await run(SCENES, true);
await run(FRESH, false);
console.log(`\n${OUT} 에 저장. 원본 크기로 한 장씩 보세요 (격자 썸네일은 세부가 안 보입니다).`);
