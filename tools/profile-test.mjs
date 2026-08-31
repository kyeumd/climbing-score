/**
 * 참가자 추가를 진짜 입력으로 검증한다.
 * 스크린샷이 아니라 결과를 단정한다 — "에러 안 남"과 "의도대로 됨"은 다르다.
 */
import { launch, sleep } from './cdp.mjs';
const p = await (await launch({ width: 414, height: 896, dark: true })).connect();
const fail = [];
const ok = (name, cond, got) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${got !== undefined ? ` — ${JSON.stringify(got)}` : ''}`);
  if (!cond) fail.push(name);
};

await p.goto('http://localhost:8099/index.html', { wait: 700 });
await p.eval(() => localStorage.clear());
await p.goto('http://localhost:8099/index.html', { wait: 2600 });

// 짐 고르기 (진짜 입력)
await p.clickReal('.btn');
await sleep(700);
await p.typeReal('.field[type=search]', '더클라임 강남');
await sleep(400);
await p.clickReal('.gymrow__pick');
await sleep(700);

const state = () => p.eval(() => {
  const s = JSON.parse(localStorage.getItem('climbing-score/v1') || '{}');
  return { profiles: (s.profiles ?? []).map((x) => x.name), gymPicked: !!s.gyms?.length };
});
ok('짐 선택됨', (await state()).gymPicked);

// 프로필 고르기 버튼
const btns = await p.eval(() => [...document.querySelectorAll('.btn')].map((b) => b.textContent.trim()));
console.log('  버튼:', btns.join(' / '));
const idx = btns.findIndex((t) => t.includes('프로필') || t.includes('참가자'));
ok('프로필 만들기 버튼 있음', idx >= 0, btns[idx]);
await p.clickReal('.btn', { nth: idx });
await sleep(700);

const m1 = await p.eval(() => [...document.querySelectorAll('.modal .btn')].map((b) => b.textContent.trim()));
console.log('  모달 버튼:', m1.join(' / '));
const newIdx = m1.findIndex((t) => t.includes('새 참가자'));
ok('새 참가자 버튼 있음', newIdx >= 0);
await p.clickReal('.modal .btn', { nth: newIdx });
await sleep(700);

// 이름을 진짜로 타이핑
const hasField = await p.count('.modal .field');
ok('이름 입력칸 있음', hasField > 0, hasField);
await p.typeReal('.modal .field', '민서');
const typed = await p.eval(() => document.querySelector('.modal .field')?.value);
ok('타이핑이 실제로 들어감', typed === '민서', typed);

// 추가
const m2 = await p.eval(() => [...document.querySelectorAll('.modal .btn')].map((b) => b.textContent.trim()));
const addIdx = m2.findIndex((t) => t.includes('추가'));
await p.clickReal('.modal .btn', { nth: addIdx });
await sleep(900);

const after = await state();
ok('프로필이 저장됨', after.profiles.includes('민서'), after.profiles);
ok('모달이 닫힘', (await p.count('.modal')) === 0);
const board = await p.eval(() => ({
  cards: document.querySelectorAll('.cell').length,
  name: document.querySelector('.grid__name')?.textContent ?? null,
  deck: document.querySelector('.section-head .eyebrow')?.textContent ?? null,
}));
ok('입력부가 나타남 (카드 표시)', board.cards > 0, board);

console.log(fail.length ? `\n실패 ${fail.length}건: ${fail.join(', ')}` : '\n전부 통과');
await p.close();
