/**
 * 시각 검사기 v2.
 *
 * 기존 검사기는 getBoundingClientRect로 겹침을 계산했다. 그건 레이아웃 박스일 뿐
 * 실제로 화면에 무엇이 보이는지가 아니다. z-index, transform, overflow 클리핑을
 * 직접 흉내내야 했고, 그 가정이 틀리면 진짜 문제를 놓쳤다.
 *
 * 이 검사기는 브라우저에게 직접 묻는다. document.elementFromPoint(x, y)는
 * 그 좌표에 실제로 렌더된 최상단 요소를 돌려준다. 가정이 없다.
 *
 * 검사 축: 뷰포트 4종 x 테마 2종 x 화면/모달 x 스크롤 컨테이너별 3단계
 */
import { launch, sleep } from './cdp.mjs';

const BASE = 'http://localhost:8099/tools/demo.html';

const PROBE = function () {
  const out = { hidden: [], clippedText: [], offscreen: [], tinyTap: [] };

  const meaningful = (el) => {
    const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!t) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.1) return null;
    if (cs.clipPath?.includes('inset(50%)') || el.classList.contains('sr-only')) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    return { text: t.slice(0, 26), r, cs };
  };
  const desc = (el, t) => {
    const c = (el.className || '').toString().trim().split(/\s+/)[0];
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''} "${t}"`;
  };

  // 모달이 떠 있으면 그 안이 사용자가 보는 전부다
  const modal = document.querySelector('.modal');
  const scope = modal || document.body;

  for (const el of scope.querySelectorAll('*')) {
    const info = meaningful(el);
    if (!info) continue;
    const { text, r } = info;

    // 뷰포트 밖이면 스크롤하면 되는 것이므로 문제 아님
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;

    // 스크롤 컨테이너 밖으로 나가 잘린 것은 안 보이는 게 정상이다.
    // 그 안에 있는데도 안 보이면 무언가가 덮은 것이고, 그게 진짜 문제다.
    let clippedOut = false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ncs = getComputedStyle(n);
      if (!/(auto|scroll|hidden)/.test(ncs.overflowY + ncs.overflowX)) continue;
      const nr = n.getBoundingClientRect();
      const iw = Math.min(r.right, nr.right) - Math.max(r.left, nr.left);
      const ih = Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top);
      if (iw <= 1 || ih <= 1) { clippedOut = true; break; }
    }
    if (clippedOut) continue;

    // 브라우저에게 직접 묻는다: 이 지점에 실제로 보이는 게 누구인가
    const pts = [[0.5, 0.5], [0.12, 0.5], [0.88, 0.5], [0.5, 0.15], [0.5, 0.85]];
    let sampled = 0, mine = 0, blocker = null;
    for (const [fx, fy] of pts) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue;
      sampled++;
      const top = document.elementFromPoint(x, y);
      if (!top) continue;
      if (top === el || el.contains(top) || top.contains(el)) mine++;
      else if (!blocker) blocker = top;
    }
    if (sampled === 0) continue;

    const ratio = mine / sampled;
    if (ratio === 0) {
      // 한 점도 자기 자신이 아니다 = 완전히 가려졌다
      const bt = blocker ? (blocker.textContent || '').trim().slice(0, 22) : '?';
      out.hidden.push({ el: desc(el, text), by: blocker ? desc(blocker, bt) : '알 수 없음', pct: 100 });
    } else if (ratio < 0.5) {
      const bt = blocker ? (blocker.textContent || '').trim().slice(0, 22) : '?';
      out.hidden.push({ el: desc(el, text), by: blocker ? desc(blocker, bt) : '알 수 없음',
                        pct: Math.round((1 - ratio) * 100) });
    }

    // 글자가 잘려 읽을 수 없는 경우
    if (el.scrollWidth > el.clientWidth + 1 && info.cs.textOverflow !== 'ellipsis'
        && !['auto', 'scroll'].includes(info.cs.overflowX)) {
      out.clippedText.push({ el: desc(el, text), w: el.clientWidth, need: el.scrollWidth });
    }
  }

  // 모달 자체가 화면 밖으로 나갔는가
  if (modal) {
    const sheet = modal.querySelector('.modal__sheet');
    if (sheet) {
      const r = sheet.getBoundingClientRect();
      const over = Math.max(0, r.bottom - innerHeight) + Math.max(0, -r.top);
      if (over > 2) out.offscreen.push({ el: 'modal__sheet', by: Math.round(over) });
    }
  }
  return out;
};

const SCROLLERS = function () {
  const out = [];
  const scope = document.querySelector('.modal') || document.body;
  for (const el of [scope, ...scope.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) {
      out.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
    }
  }
  if (document.documentElement.scrollHeight > innerHeight + 4 && !document.querySelector('.modal')) {
    out.push('__page__');
  }
  return out;
};

const OPENERS = {
  '대결 화면': null,
  '짐 선택기': () => document.querySelector('.matchbar__gym').click(),
  '참가자 선택': () => [...document.querySelectorAll('.btn')].find(b => b.textContent.includes('참가자 추가')).click(),
  '숙련도 설정': async () => { document.querySelectorAll('.tab')[2].click();
      await new Promise(r => setTimeout(r, 400)); document.querySelector('.profilerow .iconbtn').click(); },
  '세션 편집': async () => { document.querySelectorAll('.tab')[1].click();
      await new Promise(r => setTimeout(r, 500)); document.querySelector('.sessionrow').click(); },
  '색 고르기': async () => { document.querySelectorAll('.tab')[3].click();
      await new Promise(r => setTimeout(r, 500)); document.querySelector('.graderow__dot').click(); },
  '점수표': async () => { document.querySelectorAll('.tab')[3].click();
      await new Promise(r => setTimeout(r, 500));
      [...document.querySelectorAll('.btn')].find(b => b.textContent.includes('점수표')).click(); },
};

const VIEWPORTS = [[414, 896, '폰'], [360, 640, '작은폰'], [1280, 720, '데스크톱']];
const findings = new Map();
const add = (k, v) => { if (!findings.has(k)) findings.set(k, new Set()); findings.get(k).add(v); };

for (const [w, h, vpName] of VIEWPORTS) {
  for (const dark of [true, false]) {
    const theme = dark ? '다크' : '라이트';
    for (const [scene, open] of Object.entries(OPENERS)) {
      const page = await (await launch({ width: w, height: h, dark })).connect();
      try {
        await page.goto(dark ? BASE : BASE + '?theme=light', { wait: 2100 });
        if (open) { await page.eval(new Function(`return (${open.toString()})()`)); }
        if (open) await sleep(650);

        const scrollers = await page.eval(SCROLLERS);
        // 스크롤 컨테이너마다 위/중간/아래를 각각 본다
        const positions = scrollers.length ? scrollers : ['__none__'];
        for (const sc of positions) {
          for (const frac of [0, 0.5, 1]) {
            if (sc !== '__none__') {
              await page.eval((sel, f) => {
                const el = sel === '__page__' ? document.scrollingElement
                  : [...(document.querySelector('.modal') || document.body).querySelectorAll('*')]
                      .concat([document.querySelector('.modal') || document.body])
                      .find(e => `${e.tagName.toLowerCase()}.${(e.className||'').toString().split(' ')[0]}` === sel);
                if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
              }, sc, frac);
              await sleep(220);
            }
            const g = await page.eval(PROBE);
            const where = `${vpName}·${theme}·${scene}${sc !== '__none__' ? `·${sc}@${frac * 100}%` : ''}`;
            for (const x of g.hidden) add(`가려짐 (${x.pct}%)`, `${where} · ${x.el} ← ${x.by}`);
            for (const x of g.clippedText) add('글자 잘림', `${where} · ${x.el} ${x.w}→${x.need}px`);
            for (const x of g.offscreen) add('모달이 화면 밖', `${where} · ${x.by}px`);
          }
        }
      } catch (e) {
        add('검사 실패', `${vpName}·${theme}·${scene} · ${String(e.message).slice(0, 70)}`);
      }
      await page.close();
    }
  }
}

console.log('\n######### 시각 검사 (elementFromPoint 기반) #########\n');
if (!findings.size) console.log('발견 없음');
for (const [k, set] of [...findings].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`### ${k} — ${set.size}건`);
  for (const d of [...set].slice(0, 6)) console.log('   ·', d);
  if (set.size > 6) console.log(`   … 외 ${set.size - 6}건`);
  console.log();
}
