/** 선 전수조사: 모달 안에 실제로 그려지는 가로선·테두리를 전부 나열 */
import { launch, sleep } from './cdp.mjs';
import { open as openApp, scene } from './seed.mjs';

const PROBE = function (focusSel) {
  if (focusSel) document.querySelector(focusSel)?.focus();
  const out = [];
  const sheet = document.querySelector('.modal__sheet');
  if (!sheet) return out;
  const name = (el) => `${el.tagName.toLowerCase()}.${(el.className||'').toString().trim().split(/\s+/)[0]||'-'}`;
  const seen = (el, kind, detail, y) => out.push({ el: name(el), kind, detail, y: Math.round(y) });
  for (const el of [sheet, ...sheet.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 1) continue;
    for (const side of ['Top', 'Bottom']) {
      const w = parseFloat(cs[`border${side}Width`]);
      const st = cs[`border${side}Style`];
      const c = cs[`border${side}Color`];
      if (w > 0 && st !== 'none' && !/rgba\(.*,\s*0\)/.test(c)) {
        seen(el, `테두리-${side === 'Top' ? '위' : '아래'}`, `${w}px ${c}`, side === 'Top' ? r.top : r.bottom);
      }
    }
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) {
      seen(el, '아웃라인', `${cs.outlineWidth} ${cs.outlineColor}`, r.top);
    }
    if (cs.boxShadow !== 'none') seen(el, '그림자', cs.boxShadow.slice(0, 46), r.top);
    // ::before/::after 로 그린 막대
    for (const pe of ['::before', '::after']) {
      const p = getComputedStyle(el, pe);
      if (p.content === 'none' || p.content === 'normal') continue;
      const h = parseFloat(p.height), bg = p.backgroundColor;
      if (h > 0 && h <= 6 && bg && !/rgba\(.*,\s*0\)/.test(bg)) {
        seen(el, `가짜요소${pe}`, `높이 ${p.height} ${bg}`, r.top);
      }
    }
  }
  return out.sort((a, b) => a.y - b.y);
};

for (const [label, code, focus] of [
  ['날짜 고르기', `tap(q('.matchbar__date'))`, null],
  ['색 고르기', `tap(q('.tab', 3)); await wait(600); tap(q('.graderow__dot'))`, null],
]) {
  const page = await (await launch({ width: 414, height: 896, dark: true })).connect();
  await openApp(page, { sleep });
  await scene(page, code, { sleep, wait: 700 });
  const rows = await page.eval(PROBE, focus);
  console.log(`\n## ${label} — 선 ${rows.length}개`);
  for (const r of rows) console.log(`  y=${String(r.y).padStart(4)}  ${r.kind.padEnd(14)} ${r.el.padEnd(22)} ${r.detail}`);
  await page.close();
}
