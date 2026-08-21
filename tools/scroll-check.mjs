import { launch, sleep } from './cdp.mjs';
const OPEN = {
  '짐 선택기': `document.querySelector('.matchbar__gym').click()`,
  '세션 편집': `document.querySelectorAll('.tab')[1].click();
    await new Promise(r=>setTimeout(r,600)); document.querySelector('.sessionrow').click()`,
  '숙련도': `document.querySelectorAll('.tab')[2].click();
    await new Promise(r=>setTimeout(r,500)); document.querySelector('.profilerow .iconbtn').click()`,
  '색 고르기': `document.querySelectorAll('.tab')[3].click();
    await new Promise(r=>setTimeout(r,500)); document.querySelector('.graderow__dot').click()`,
};
for (const [w, h, label] of [[414, 896, '폰'], [360, 640, '작은폰']]) {
  for (const [name, code] of Object.entries(OPEN)) {
    const p = await (await launch({ width: w, height: h, dark: true })).connect();
    await p.goto('http://localhost:8099/tools/demo.html', { wait: 2200 });
    await p.eval(new Function(`return (async()=>{ ${code} })()`));
    await sleep(700);
    const r = await p.eval(() => {
      const out = [];
      for (const el of document.querySelectorAll('.modal, .modal *')) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) {
          out.push(`${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ')[0]}(+${el.scrollHeight-el.clientHeight})`);
        }
      }
      return out;
    });
    console.log(`${label} ${name}: ${r.length === 0 ? '스크롤 없음' : r.length === 1 ? '스크롤 1곳 ' + r[0] : '중첩! ' + r.join(', ')}`);
    await p.close();
  }
}
