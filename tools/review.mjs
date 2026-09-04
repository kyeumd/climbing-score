/**
 * 검토 루프 — 실제 앱(index.html)만 본다. 시드와 조작 코드는 seed.mjs 가 갖고 있다.
 *
 *   node tools/review.mjs                다크 414x896
 *   node tools/review.mjs --light        라이트
 *   node tools/review.mjs --small        360x640
 *   node tools/review.mjs --only 짐      이름에 '짐'이 든 장면만
 */
import { launch, sleep } from './cdp.mjs';
import { open, scene } from './seed.mjs';
import { readdirSync, unlinkSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const light = args.includes('--light');
const small = args.includes('--small');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const [W, H] = small ? [360, 640] : [414, 896];
const VARIANT = small ? 'small' : (light ? 'light' : 'dark');
const OUT = `tools/shots/${VARIANT}`;

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
  ['13 참가자시트', `tap(q('.grid__add'))`],
  ['14 사람시트', `tap(q('.grid__person'))`],
  ['15 세션편집', `tap(q('.tab', 1)); await wait(600); q('.sessionrow').click()`],
  ['16 색고르기', `tap(q('.tab', 3)); await wait(600); tap(q('.graderow__dot'))`],
  ['17 짐추가', `tap(q('.matchbar__gym')); await wait(600); tap(byText('.modal .btn', '직접 추가'))`],
];

const FRESH = [
  ['18 첫실행', null],
  ['19 첫실행-기록탭', `tap(q('.tab', 1))`],
  ['20 첫실행-짐설정탭', `tap(q('.tab', 3))`],
];

/*
 * 기본 시드로는 절대 안 나오는 상태들. 몇 라운드 동안 60장 어디에도 없어서
 * 검사에 한 번도 오르지 않았다. (배너는 시드가 '맞아요'를 눌러 치워 버리고,
 * 색 없는 짐·즐겨찾기·은퇴 등급은 애초에 만들어지지 않았다.)
 */
const VARIANTS = [
  ['21 색순서확인배너', { confirm: false }, null],
  ['22 색없는짐', { gym: '강동클라이밍짐', record: false }, null],
  ['23 색없는짐-목록', { gym: '강동클라이밍짐', record: false }, `tap(q('.matchbar__gym'))`],
  ['24 즐겨찾기', {}, `tap(q('.matchbar__gym')); await wait(700);
    tap(q('.gymrow__star', 2)); await wait(400);
    q('.modal__body').scrollTop = 0`],
  ['25 은퇴등급', {}, `tap(q('.tab', 3)); await wait(600);
    tap(q('.graderow', 1).querySelectorAll('.iconbtn')[2])`],
];

mkdirSync(OUT, { recursive: true });
// --only 로 한 장만 찍을 때도 폴더를 통째로 비우고 있었다. 방금 지운 나머지를
// 다시 찍느라 시간을 버린다. 이번에 찍을 것만 지운다. (flow.mjs 도 같은 버그였다)
const willShoot = (name) => !only || name.includes(only);
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.png') && willShoot(f.replace(/_/g, ' '))) unlinkSync(`${OUT}/${f}`);
}

async function run(scenes, seeded) {
  for (const row of scenes) {
    // [이름, 코드] 또는 [이름, 시드옵션, 코드]
    const [name, a, b] = row;
    const [opts, code] = row.length === 3 ? [a, b] : [{}, a];
    if (only && !name.includes(only)) continue;
    const page = await (await launch({ width: W, height: H, dark: !light })).connect();
    try {
      await open(page, { seed: seeded, sleep, ...opts });
      await scene(page, code, { sleep });
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
await run(VARIANTS, true);
console.log(`\n${OUT} 에 저장. 원본 크기로 한 장씩 보세요 (격자 썸네일은 세부가 안 보입니다).`);
