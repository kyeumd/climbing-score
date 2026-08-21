import { launch, sleep } from './cdp.mjs';
const p = await (await launch({ width: 414, height: 896, dark: true })).connect();
await p.goto('http://localhost:8099/index.html', { wait: 700 });
await p.eval(() => localStorage.clear());
await p.goto('http://localhost:8099/index.html', { wait: 2600 });
await p.clickReal('.btn'); await sleep(700);
await p.typeReal('.field[type=search]', '더클라임 강남'); await sleep(400);
await p.clickReal('.gymrow__pick'); await sleep(700);
const ok = await p.eval(() => [...document.querySelectorAll('.btn')].findIndex(b=>b.textContent.includes('맞아요')));
if (ok >= 0) { await p.clickReal('.btn', {nth: ok}); await sleep(500); }
// 참가자 3명
for (const name of ['동균', '지수', '현우']) {
  const i = await p.eval(() => [...document.querySelectorAll('.btn')].findIndex(b=>/참가자/.test(b.textContent)));
  await p.clickReal('.btn', { nth: i }); await sleep(600);
  const nb = await p.eval(() => [...document.querySelectorAll('.modal .btn')].findIndex(b=>b.textContent.includes('새 참가자')));
  if (nb >= 0) { await p.clickReal('.modal .btn', {nth: nb}); await sleep(500); }
  await p.typeReal('.modal .field', name);
  const ab = await p.eval(() => [...document.querySelectorAll('.modal .btn')].findIndex(b=>b.textContent.trim().startsWith('추가')));
  await p.clickReal('.modal .btn', {nth: ab}); await sleep(800);
}
// 격자에서 여러 사람을 전환 없이 기록
await p.eval(() => {
  const cells = document.querySelectorAll('.cell');
  const tap = (el) => { el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));
                        el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1})); };
  return (async () => {
    for (const i of [9, 10, 11, 12, 13, 15, 18]) { tap(document.querySelectorAll('.cell')[i]); await new Promise(r=>setTimeout(r,180)); }
  })();
});
await sleep(600);
await p.shot('tools/shots/_grid.png');
const m = await p.eval(() => ({
  참가자: [...document.querySelectorAll('.grid__name')].map(e=>e.textContent),
  점수: [...document.querySelectorAll('.grid__score')].map(e=>e.textContent),
  난이도행: document.querySelectorAll('.grid__row').length,
  칸: document.querySelectorAll('.cell').length,
}));
console.log(JSON.stringify(m));
await p.close();
