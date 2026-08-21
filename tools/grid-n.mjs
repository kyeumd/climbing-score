import { launch, sleep } from './cdp.mjs';
const p = await (await launch({ width: 414, height: 896, dark: true })).connect();
await p.goto('http://localhost:8099/index.html', { wait: 700 });
await p.eval(() => localStorage.clear());
await p.goto('http://localhost:8099/index.html', { wait: 2600 });
await p.clickReal('.btn'); await sleep(700);
await p.typeReal('.field[type=search]', '더클라임 강남'); await sleep(400);
await p.clickReal('.gymrow__pick'); await sleep(800);
const okI = await p.eval(() => [...document.querySelectorAll('.btn')].findIndex(b=>b.textContent.includes('맞아요')));
if (okI >= 0) { await p.clickReal('.btn', {nth: okI}); await sleep(500); }
for (const name of ['가','나','다','라']) {
  const i = await p.eval(() => [...document.querySelectorAll('.btn')].findIndex(b=>/참가자/.test(b.textContent)));
  await p.clickReal('.btn', { nth: i }); await sleep(600);
  const nb = await p.eval(() => [...document.querySelectorAll('.modal .btn')].findIndex(b=>b.textContent.includes('새 참가자')));
  if (nb >= 0) { await p.clickReal('.modal .btn', {nth: nb}); await sleep(500); }
  await p.typeReal('.modal .field', name);
  const ab = await p.eval(() => [...document.querySelectorAll('.modal .btn')].findIndex(b=>b.textContent.trim().startsWith('추가')));
  await p.clickReal('.modal .btn', {nth: ab}); await sleep(800);
  const r = await p.eval(() => {
    const head = document.querySelector('.grid__head');
    const row = document.querySelector('.grid__row');
    const cols = (s) => getComputedStyle(s).gridTemplateColumns.split(' ').length;
    const tops = [...document.querySelectorAll('.grid__head > *')].map(e=>Math.round(e.getBoundingClientRect().top));
    return { 사람수: document.querySelectorAll('.grid__person').length,
             머리글열: cols(head), 본문열: cols(row),
             한줄인가: new Set(tops).size === 1 };
  });
  console.log(`${name} 추가 후:`, JSON.stringify(r));
}
await p.shot('tools/shots/_grid4.png');
await p.close();
