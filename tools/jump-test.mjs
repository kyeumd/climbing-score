/** 검색어를 한 글자씩 치면서 모달과 검색창이 움직이는지 본다 */
import { launch, sleep } from './cdp.mjs';
const p = await (await launch({ width: 414, height: 896, dark: true })).connect();
await p.goto('http://localhost:8099/index.html', { wait: 700 });
await p.eval(() => localStorage.clear());
await p.goto('http://localhost:8099/index.html', { wait: 2600 });
await p.eval(() => [...document.querySelectorAll('.btn')].find(b => b.textContent.includes('클라이밍장'))?.click());
await sleep(800);
const probe = () => p.eval(() => {
  const sh = document.querySelector('.modal__sheet').getBoundingClientRect();
  const se = document.querySelector('.field[type=search]').getBoundingClientRect();
  return { 모달높이: Math.round(sh.height), 모달상단: Math.round(sh.top),
           검색창위치: Math.round(se.top), 결과수: document.querySelectorAll('.gymrow').length };
});
console.log('빈 검색   ', JSON.stringify(await probe()));
for (const q of ['더', '더클', '더클라임', '더클라임 강남', 'zzz']) {
  await p.eval((v) => {
    const s = document.querySelector('.field[type=search]');
    s.value = v; s.dispatchEvent(new Event('input', { bubbles: true }));
  }, q);
  await sleep(300);
  console.log(`"${q}"`.padEnd(12), JSON.stringify(await probe()));
}
await p.close();
