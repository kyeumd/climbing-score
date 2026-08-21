/** 모든 팝업을 실제로 열고 그 안까지 검사한다. 닫힌 화면만 보면 아무것도 안 나온다. */
import { launch, sleep } from './cdp.mjs';
const S = '/private/tmp/claude-501/-Users-leedk1130-climbing/174922e0-db02-4ae0-bb81-229ee7636811/scratchpad';
const BASE = 'http://localhost:8099/tools/demo.html';

const PROBE = function () {
  const out = { overlap: [], clipped: [], overflow: [], offscreen: [], scrollLock: null, tiny: [] };
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    if (s.clipPath?.includes('inset(50%)') || el.classList.contains('sr-only')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const desc = (el) => {
    const c = (el.className || '').toString().trim().split(/\s+/)[0];
    const t = (el.textContent || '').trim().slice(0, 22);
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}${t ? ` "${t}"` : ''}`;
  };
  // 스크롤 컨테이너 밖으로 잘려 화면에 없는 요소는 겹침 판정에서 빼야 한다.
  // getBoundingClientRect는 잘린 자식의 원래 위치를 그대로 돌려주기 때문이다.
  const clipped = (el) => {
    const r = el.getBoundingClientRect();
    let n = el.parentElement;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) {
        const cr = n.getBoundingClientRect();
        const w = Math.min(r.right, cr.right) - Math.max(r.left, cr.left);
        const h = Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top);
        if (w <= 1 || h <= 1) return true;
      }
      n = n.parentElement;
    }
    return false;
  };
  const modal = document.querySelector('.modal');
  const scope = modal || document.body;
  const all = [...scope.querySelectorAll('*')].filter(vis);

  // 모달이 화면 밖으로 나가거나 잘리는가
  if (modal) {
    const sheet = modal.querySelector('.modal__sheet');
    const r = sheet.getBoundingClientRect();
    if (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1) {
      out.offscreen.push({
        el: 'modal__sheet',
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        vh: innerHeight, overflowsBy: Math.round(Math.max(0, r.bottom - innerHeight) + Math.max(0, -r.top)),
      });
    }
    // 모달이 열렸는데 뒤 페이지가 스크롤되면 배경이 밀려 어지럽다
    out.scrollLock = getComputedStyle(document.body).overflow;
  }

  for (const el of all) {
    const s = getComputedStyle(el);
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis'
        && !['auto', 'scroll'].includes(s.overflowX)) {
      out.clipped.push({ el: desc(el), w: el.clientWidth, need: el.scrollWidth });
    }
    if (own && parseFloat(s.fontSize) < 12) out.tiny.push({ el: desc(el), px: parseFloat(s.fontSize) });
    const p = el.parentElement;
    if (p && p !== document.body) {
      const ps = getComputedStyle(p);
      if (ps.overflow === 'visible' && ps.overflowX === 'visible') {
        const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
        if (pr.width > 0 && r.right > pr.right + 1.5 && r.width <= pr.width) {
          out.overflow.push({ el: desc(el), parent: desc(p), by: Math.round(r.right - pr.right) });
        }
      }
    }
  }

  const stickyish = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'sticky' || p === 'fixed') return true;
    }
    return false;
  };
  const texty = all.filter((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    && !clipped(el) && !stickyish(el));
  for (let i = 0; i < texty.length; i++) {
    for (let j = i + 1; j < texty.length; j++) {
      const a = texty[i], b = texty[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 2 && h > 2 && w * h > 8) out.overlap.push({ a: desc(a), b: desc(b), area: Math.round(w * h) });
    }
  }
  return out;
};

// 모달을 여는 시나리오들
const CASES = [
  ['짐 선택기',      () => document.querySelector('.matchbar__gym').click()],
  ['참가자 선택',    () => [...document.querySelectorAll('.btn')].find(b => b.textContent.includes('참가자 추가')).click()],
  ['새 참가자',      async () => { [...document.querySelectorAll('.btn')].find(b => b.textContent.includes('참가자 추가')).click();
                       await new Promise(r=>setTimeout(r,350));
                       [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('새 참가자')).click(); }],
  ['클라이밍장 추가', async () => { document.querySelector('.matchbar__gym').click();
                       await new Promise(r=>setTimeout(r,350));
                       [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('직접 추가')).click(); }],
  ['레벨 설정',      async () => { document.querySelectorAll('.tab')[2].click();
                       await new Promise(r=>setTimeout(r,350));
                       document.querySelector('.profilerow .iconbtn').click(); }],
  ['세션 편집',      async () => { document.querySelectorAll('.tab')[1].click();
                       await new Promise(r=>setTimeout(r,400));
                       document.querySelector('.sessionrow').click(); }],
  ['색 고르기',      async () => { document.querySelectorAll('.tab')[3].click();
                       await new Promise(r=>setTimeout(r,400));
                       document.querySelector('.graderow__dot').click(); }],
];

for (const dark of [true, false]) {
  const theme = dark ? 'dark' : 'light';
  for (const [name, open] of CASES) {
    const page = await (await launch({ width: 414, height: 896, dark })).connect();
    await page.goto(dark ? BASE : BASE + '?theme=light', { wait: 2200 });
    try {
      await page.eval(new Function(`return (${open.toString()})()`));
      await sleep(800);
      const g = await page.eval(PROBE);
      const hits = [];
      if (g.offscreen.length) hits.push(`모달이 화면 밖으로 ${g.offscreen[0].overflowsBy}px 넘침 (top ${g.offscreen[0].top}, bottom ${g.offscreen[0].bottom} / 화면 ${g.offscreen[0].vh})`);
      if (g.scrollLock && g.scrollLock !== 'hidden') hits.push(`모달 열린 채 배경 스크롤 가능 (body overflow: ${g.scrollLock})`);
      for (const o of g.overlap.slice(0, 3)) hits.push(`겹침: ${o.a} ↔ ${o.b} (${o.area}px²)`);
      for (const o of g.clipped.slice(0, 3)) hits.push(`잘림: ${o.el} ${o.w}→${o.need}px`);
      for (const o of g.overflow.slice(0, 3)) hits.push(`넘침: ${o.el} +${o.by}px`);
      for (const o of g.tiny.slice(0, 2)) hits.push(`작은 글자: ${o.el} ${o.px}px`);
      console.log(`\n[${theme}] ${name}: ${hits.length ? '' : 'OK'}`);
      hits.forEach(x => console.log('   ·', x));
      if (dark) await page.shot(`${S}/modal-${CASES.findIndex(c=>c[0]===name)}-${name.replace(/\s/g,'')}.png`);
    } catch (e) {
      console.log(`\n[${theme}] ${name}: 열기 실패 - ${String(e.message).slice(0, 80)}`);
    }
    await page.close();
  }
}
