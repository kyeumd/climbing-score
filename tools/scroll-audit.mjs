/** 스크롤 전수조사: 어디에 스크롤이 생기고, 그게 필요한 것인지 */
import { launch, sleep } from './cdp.mjs';
import { open as openApp, scene } from './seed.mjs';

const PROBE = function () {
  const out = [];
  const modal = document.querySelector('.modal');
  const scope = modal ?? document.body;
  const name = (el) => el === document.scrollingElement ? '__page__'
    : `${el.tagName.toLowerCase()}.${(el.className || '').toString().trim().split(/\s+/)[0] || '(무명)'}`;

  const check = (el) => {
    const cs = getComputedStyle(el);
    const scrollableY = /(auto|scroll)/.test(cs.overflowY);
    const scrollableX = /(auto|scroll)/.test(cs.overflowX);
    const overY = el.scrollHeight - el.clientHeight;
    const overX = el.scrollWidth - el.clientWidth;
    if ((scrollableY && overY > 2) || (scrollableX && overX > 2)) {
      out.push({ el: name(el), h: el.clientHeight, sh: el.scrollHeight, overY,
                 w: el.clientWidth, sw: el.scrollWidth, overX,
                 ovY: cs.overflowY, ovX: cs.overflowX });
    }
  };
  for (const el of [scope, ...scope.querySelectorAll('*')]) check(el);
  if (!modal) check(document.scrollingElement);

  const r = {};
  if (modal) {
    const sheet = modal.querySelector('.modal__sheet');
    const core = modal.querySelector('.modal__sheet > .core');
    r.sheetH = Math.round(sheet.getBoundingClientRect().height);
    r.coreScrollH = core.scrollHeight;
    r.viewportH = innerHeight;
    // 시트가 화면에 다 들어갈 만한 내용인가
    r.contentH = [...core.children].reduce((a, c) => a + c.getBoundingClientRect().height, 0);
  }
  return { scrollers: out, ...r };
};

const SCENES = [
  ['기록 화면', null],
  ['짐 선택기', `tap(q('.matchbar__gym'))`],
  ['날짜 고르기', `tap(q('.matchbar__date'))`],
  ['참가자 시트', `tap(q('.grid__add'))`],
  ['사람 시트', `tap(q('.grid__person'))`],
  ['세션 편집', `tap(q('.tab', 1)); await wait(600); q('.sessionrow').click()`],
  ['색 고르기', `tap(q('.tab', 3)); await wait(600); tap(q('.graderow__dot'))`],
  ['점수표', `tap(q('.tab', 3)); await wait(500); tap(byText('.btn', '점수표'))`],
];
const VPS = [[414, 896, '폰'], [360, 640, '작은폰']];

for (const [w, h, vp] of VPS) {
  for (const [label, code] of SCENES) {
    const page = await (await launch({ width: w, height: h, dark: true })).connect();
    try {
      await openApp(page, { sleep });
      if (code) await scene(page, code, { sleep, wait: 700 });
      const r = await page.eval(PROBE);
      const head = `${vp} · ${label}`;
      if (r.sheetH != null) {
        const fits = r.contentH <= r.viewportH * 0.92;
        console.log(`\n[${head}] 시트 ${r.sheetH}px / 화면 ${r.viewportH}px · 내용 ${Math.round(r.contentH)}px ${fits ? '(다 들어감)' : '(넘침)'}`);
      } else {
        console.log(`\n[${head}]`);
      }
      if (!r.scrollers.length) console.log('   스크롤 없음');
      for (const s of r.scrollers) {
        const dir = s.overY > 2 ? `세로 ${s.h}→${s.sh} (+${s.overY})` : '';
        const dx = s.overX > 2 ? `가로 ${s.w}→${s.sw} (+${s.overX})` : '';
        console.log(`   ${s.el}  ${dir}${dir && dx ? ' | ' : ''}${dx}`);
      }
    } catch (e) {
      console.log(`\n[${vp} · ${label}] 실패: ${String(e.message).slice(0, 60)}`);
    }
    await page.close();
  }
}
