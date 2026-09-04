/**
 * 입력 격자만 참가자 수별로 찍는다.
 *
 * 격자는 열 개수에 따라 폭이 완전히 달라지는데, review.mjs 의 시드는 늘
 * 1명이라 2~5명일 때가 한 번도 화면에 오르지 않았다. 1명에서 멀쩡하던
 * 배치가 4명에서 무너져도 아무도 몰랐다는 뜻이다.
 *
 *   node tools/shot-grid.mjs            다크 414x896
 *   node tools/shot-grid.mjs --small    360x640
 *   node tools/shot-grid.mjs --light    라이트
 */
import { launch, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';

const APP = 'http://localhost:8099/index.html';
const args = process.argv.slice(2);
const light = args.includes('--light');
const small = args.includes('--small');
const [W, H] = small ? [360, 640] : [414, 896];
const VARIANT = small ? 'small' : (light ? 'light' : 'dark');
const OUT = `tools/shots/grid-${VARIANT}`;

// 이름 길이가 열 폭을 좌우한다. 짧은 이름만 넣으면 잘림을 못 본다.
const NAMES = ['동균', '지수', '박하늘', '민', '수현'];

const SEED = `
  const q = (s, n = 0) => document.querySelectorAll(s)[n];
  const byText = (s, t) => [...document.querySelectorAll(s)].find(e => e.textContent.includes(t));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const tap = (el) => { if (!el) throw new Error('없음');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    el.click(); };
  const until = async (fn, what, tries = 40) => {
    for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(120); }
    throw new Error('나타나지 않음: ' + what);
  };

  tap(await until(() => byText('.btn', '클라이밍장'), '클라이밍장 버튼'));
  const search = await until(() => q('.field[type=search]'), '검색창');
  search.value = '더클라임 강남';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  tap(await until(() => q('.gymrow__pick'), '검색 결과'));

  const ok = await until(() => byText('.btn', '맞아요') || q('.grid__add'), '대결 화면');
  if (ok.textContent.includes('맞아요')) { tap(ok); await wait(400); }

  // 참가자 시트는 한 번만 연다. 열린 채로 이름·엔터를 이어 친다.
  tap(await until(() => q('.grid__add'), '+ 카드'));
  for (const name of NAMES) {
    const input = await until(() => q('.modal .newperson__id'), '이름 칸');
    input.focus(); input.value = name;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(350);
  }
  tap(byText('.modal .btn', '닫기'));
  await until(() => !q('.modal'), '시트 닫힘');
  await wait(300);

  // 사람마다 다른 만큼 기록해 순위 배지와 자릿수 차이를 만든다
  await until(() => q('.grid__row'), '기록 격자');
  const rows = document.querySelectorAll('.grid__row');
  for (const [r, c, times] of [[3,0,4],[3,1,2],[4,0,2],[5,2,3],[6,1,1],[2,3,7]]) {
    const cell = rows[r]?.querySelectorAll('.cell')[c];
    for (let k = 0; k < times && cell; k++) { tap(cell); await wait(110); }
  }
`;

mkdirSync(OUT, { recursive: true });

for (let n = 1; n <= NAMES.length; n++) {
  const page = await (await launch({ width: W, height: H, dark: !light })).connect();
  try {
    await page.goto(APP, { wait: 600 });
    // 검사 도구는 서버에 붙지 않는다 (seed.mjs 의 open 주석 참고)
    await page.eval(() => {
      localStorage.clear();
      localStorage.setItem('climbing-score/sync', 'off');
    });
    await page.goto(APP, { wait: 1200 });
    for (let i = 0; i < 40; i++) {
      if (await page.eval(() => !!document.querySelector('.btn'))) break;
      await sleep(150);
    }
    await page.eval(new Function('NAMES', `return (async()=>{ ${SEED} })()`), NAMES.slice(0, n));
    await sleep(700);
    await page.shot(`${OUT}/${n}명.png`);
    process.stdout.write('.');
  } catch (e) {
    console.log(`\n  ${n}명 실패: ${String(e.message).slice(0, 80)}`);
  }
  await page.close();
}
console.log(`\n${OUT} 에 저장.`);
