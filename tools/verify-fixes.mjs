import { launch, sleep } from './cdp.mjs';
const S='tools/shots';
const p = await (await launch({width:414,height:896,dark:true})).connect();
await p.goto('http://localhost:8099/index.html', {wait:600});
await p.eval(() => localStorage.clear());
await p.goto('http://localhost:8099/tools/demo.html', {wait:2400});

// 1) 길게 누르기: 누르는 중 시각 표시 -> 뗀 뒤 감소
await p.eval(() => {
  const c = document.querySelectorAll('.gcard')[3];
  c.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, pointerId:1}));
});
await sleep(600);
await p.shot(`${S}/_v1_holding.png`);   // 누르고 있는 중
await p.eval(() => {
  const c = document.querySelectorAll('.gcard')[3];
  c.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:1}));
});
await sleep(500);
await p.shot(`${S}/_v2_released.png`);  // 뗀 뒤

// 2) 짐 선택기: 칩 제거 + 스크롤
await p.eval(() => document.querySelector('.matchbar__gym').click());
await sleep(700);
await p.shot(`${S}/_v3_picker.png`);
await p.eval(() => { document.querySelector('.modal__body').scrollTop = 300; });
await sleep(400);
await p.shot(`${S}/_v4_scrolled.png`);
// 3) 지역 드롭다운으로 좁히기
await p.eval(() => {
  const s = document.querySelector('.pickerhead select');
  s.value = '마포구'; s.dispatchEvent(new Event('change', {bubbles:true}));
});
await sleep(400);
await p.shot(`${S}/_v5_filtered.png`);
console.log('4장 캡처');
await p.close();
