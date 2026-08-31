import { launch, sleep } from './cdp.mjs';
const p = await (await launch({ width: 414, height: 896, dark: true })).connect();
await p.goto('http://localhost:8099/index.html', { wait: 700 });
await p.eval(() => localStorage.clear());
await p.goto('http://localhost:8099/index.html', { wait: 2500 });
await p.clickReal('.btn'); await sleep(700);
await p.typeReal('.field[type=search]', '더클라임 강남'); await sleep(400);
await p.clickReal('.gymrow__pick'); await sleep(700);
const i = await p.eval(() => [...document.querySelectorAll('.btn')].findIndex(b=>/참가자/.test(b.textContent)));
await p.clickReal('.btn', { nth: i }); await sleep(600);
await p.typeReal('.modal .field', '나');
const ab = await p.eval(() => [...document.querySelectorAll('.modal .btn')].findIndex(b=>b.textContent.trim().startsWith('추가')));
await p.clickReal('.modal .btn', {nth: ab}); await sleep(800);
// .cell__count 는 기록이 있는 칸에만 생긴다. 전체에서 n번째를 세면 어긋나므로
// 4번째 '칸' 안에서 찾는다.
const read = () => p.eval(() =>
  document.querySelectorAll('.cell')[3]?.querySelector('.cell__count')?.textContent || '0');
for (let k = 0; k < 6; k++) await p.tap('.cell', { nth: 3 });
console.log('탭 6번 →', await read());
await p.tap('.cell', { nth: 3, holdMs: 300 });
console.log('짧게 길게(300ms) →', await read());
await p.tap('.cell', { nth: 3, holdMs: 900 });
console.log('길게 유지(900ms) →', await read(), '(연속 감소)');
await p.close();
