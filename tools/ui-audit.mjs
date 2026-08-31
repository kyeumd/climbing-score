/**
 * UI 자동 감사기.
 *   - axe-core: 접근성·대비 위반 (업계 표준 규칙셋)
 *   - 자체 기하 검사: 겹침·잘림·터치타겟 (axe가 못 잡는 영역)
 * 다크/라이트 × 전 화면을 돈다.
 */
import { launch, sleep } from './cdp.mjs';
import { open, scene } from './seed.mjs';
import { readFileSync } from 'node:fs';

const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const S = '/private/tmp/claude-501/-Users-leedk1130-climbing/174922e0-db02-4ae0-bb81-229ee7636811/scratchpad';

/* ---------- 브라우저 안에서 도는 기하 검사기 ---------- */
const GEOMETRY_PROBE = function () {
  const out = { overlap: [], barBleed: [], clipped: [], overflow: [], tiny: [], smallTap: [], tightLeading: [] };
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const desc = (el) => {
    const cls = (el.className || '').toString().trim().split(/\s+/)[0];
    const t = (el.textContent || '').trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${t ? ` "${t}"` : ''}`;
  };
  const opaqueBg = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(',').map(Number);
        if ((p[3] ?? 1) > 0.85) return true;
      }
      n = n.parentElement;
    }
    return false;
  };

  // 스크린리더 전용 요소는 화면에 없는 것이므로 시각 검사 대상이 아니다
  const srOnly = (el) => {
    const s = getComputedStyle(el);
    return s.clipPath?.includes('inset(50%)') || el.classList.contains('sr-only');
  };
  // ::after로 히트 영역을 넓힌 컨트롤은 실제 터치 크기가 다르다
  const hitBox = (el) => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, '::after');
    if (a.content && a.content !== 'none' && a.position === 'absolute') {
      const w = parseFloat(a.width), h = parseFloat(a.height);
      if (w && h) return { width: Math.max(r.width, w), height: Math.max(r.height, h) };
    }
    return { width: r.width, height: r.height };
  };
  const fixedish = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return true;
      n = n.parentElement;
    }
    return false;
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
  const all = [...document.querySelectorAll('body *')].filter((el) => vis(el) && !srOnly(el));

  // R1 글자 크기 / R3 줄간격 / R2 터치 타겟
  for (const el of all) {
    const s = getComputedStyle(el);
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasOwnText) {
      const fs = parseFloat(s.fontSize);
      if (fs < 12) out.tiny.push({ el: desc(el), fontSize: +fs.toFixed(1) });
      const lh = s.lineHeight === 'normal' ? fs * 1.2 : parseFloat(s.lineHeight);
      // scrollHeight 로 '여러 줄'을 짐작하면 글자 한 자짜리 큰 버튼도 걸린다.
      // 실제로 몇 줄에 걸쳐 그려졌는지 Range 로 센다. 줄간격은 두 줄부터 문제다.
      if (lh / fs < 1.3) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        if (lines > 1) out.tightLeading.push({ el: desc(el), ratio: +(lh / fs).toFixed(2), lines });
      }
    }
    const interactive = el.matches('button, a, input, select, [role=button], .chip, .swatch, .iconbtn, .grid__row button, .gymrow__pick, .sessionrow');
    if (interactive) {
      // <label> 안의 input은 라벨 전체가 클릭 영역이다
      const wrapLabel = el.closest('label');
      const hb = (el.tagName === 'INPUT' && wrapLabel) ? hitBox(wrapLabel) : hitBox(el);
      if (hb.width < 44 || hb.height < 44) {
        out.smallTap.push({ el: desc(el), w: Math.round(hb.width), h: Math.round(hb.height) });
      }
    }
    // O3 텍스트 잘림
    if (hasOwnText && el.scrollWidth > el.clientWidth + 1) {
      const to = s.textOverflow, ov = s.overflowX;
      if (!(to === 'ellipsis' || ov === 'auto' || ov === 'scroll')) {
        out.clipped.push({ el: desc(el), scrollW: el.scrollWidth, clientW: el.clientWidth });
      }
    }
    // O4 부모 밖 넘침
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

  // O1/O2 겹침 — 텍스트를 직접 가진 불투명 요소끼리
  const texty = all.filter((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    && opaqueBg(el) && !clipped(el));
  for (let i = 0; i < texty.length; i++) {
    for (let j = i + 1; j < texty.length; j++) {
      const a = texty[i], b = texty[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 2 && h > 2 && w * h > 8) {
        const fa = fixedish(a), fb = fixedish(b);
        if (fa !== fb) {
          // 고정 바가 스크롤 콘텐츠를 덮는 경우. 반투명이면 글자가 비쳐 읽기 나빠진다.
          const bar = fa ? a : b;
          // 배경 스택을 누적한다. 위쪽 레이어가 반투명이어도 아래에 불투명한 층이 있으면 비치지 않는다.
          let n = bar, remaining = 1;
          while (n && n !== document.body && remaining > 0.1) {
            const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/);
            if (m) {
              const q = m[1].split(',').map(Number);
              remaining *= (1 - (q[3] ?? 1));
            }
            n = n.parentElement;
          }
          if (remaining > 0.1) {
            out.barBleed.push({ bar: desc(bar), under: desc(fa ? b : a), seeThrough: +remaining.toFixed(2) });
          }
        } else if (!fa) {
          out.overlap.push({ a: desc(a), b: desc(b), area: Math.round(w * h) });
        }
      }
    }
  }
  return out;
};

/* ---------- 화면 정의 ----------
 * 예전에는 tools/demo.html 의 ?route= 로 화면을 갈아 끼웠다. 데모는 실제 앱과
 * 마크업이 달라서, 감사기는 데모에만 있는 h1 누락을 12건 보고하면서 정작
 * 사용자가 보는 화면은 한 번도 검사하지 않았다. 이제 실제 앱을 눌러서 이동한다.
 */
const SCREENS = [
  { name: '대결(데이터 있음)', code: null },
  // 1명 시드로는 순위 배지·좁아진 열·접힌 칸이 한 번도 화면에 오르지 않는다
  { name: '대결(여러 명)', code: `
    for (const name of ['지수', '박하늘']) {
      tap(await until(() => byText('.btn', '참가자 추가'), '참가자 버튼'));
      const i = await until(() => q('.modal .field'), '이름 입력칸');
      i.value = name; i.dispatchEvent(new Event('input', { bubbles: true }));
      tap(await until(() => byText('.modal .btn', '추가'), '추가 버튼'));
      await wait(350);
    }
    tap(q('.grid__row', 6).querySelectorAll('.cell')[2]); await wait(200);
  ` },
  { name: '기록/통계',        code: `tap(q('.tab', 1))` },
  { name: '짐 설정',          code: `tap(q('.tab', 3))` },
  { name: '점수표',           code: `tap(q('.tab', 3)); await wait(500); tap(byText('.btn', '점수표'))` },
  { name: '프로필',           code: `tap(q('.tab', 2))` },
  { name: '짐 선택기',        code: `tap(q('.matchbar__gym'))` },
  { name: '세션 편집',        code: `tap(q('.tab', 1)); await wait(600); q('.sessionrow').click()` },
  { name: '첫 실행(빈 상태)', code: null, seed: false },
  /*
   * 기본 시드로는 절대 안 나오는 상태들. 몇 라운드 동안 감사에 한 번도 오르지 않았다.
   * (시각 검사기에는 넣지 않는다. 뷰포트 3종 x 테마 2종이라 한 화면이 6번 도는데,
   *  이미 5분 30초가 걸린다. axe·기하 검사만으로 이 세 화면은 충분히 걸린다.)
   */
  { name: '색 순서 확인 배너', code: null, opts: { confirm: false } },
  { name: '색 등급 없는 짐', code: null, opts: { gym: '강동클라이밍짐', record: false } },
  { name: '즐겨찾기 목록', code: `tap(q('.matchbar__gym')); await wait(700);
      tap(q('.gymrow__star', 2)); await wait(400)` },
];

const report = [];
for (const dark of [true, false]) {
  const theme = dark ? 'dark' : 'light';
  for (const sc of SCREENS) {
    // 화면마다 브라우저를 새로 띄운다. 한 브라우저를 돌려쓰면 앞 화면이 남긴
    // 상태(열린 모달, 스크롤, 저장된 기록)가 다음 검사에 섞인다.
    const page = await (await launch({ width: 414, height: 896, dark })).connect();
    try {
    await open(page, { seed: sc.seed !== false, sleep, ...(sc.opts ?? {}) });
    await scene(page, sc.code, { sleep });

    // 스크롤 위치별로 검사한다. 최상단만 보면 고정 바가 마지막 콘텐츠를 먹는 걸 놓친다.
    const geo = { overlap: [], barBleed: [], clipped: [], overflow: [], tiny: [], smallTap: [], tightLeading: [], covered: [] };
    const maxScroll = await page.eval(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
    for (const pos of [0, Math.round(maxScroll / 2), maxScroll]) {
      await page.eval((y) => window.scrollTo(0, y), pos);
      await sleep(220);
      const g = await page.eval(GEOMETRY_PROBE);
      for (const k of Object.keys(g)) (geo[k] ??= []).push(...g[k]);
    }
    // 최하단에서 고정 바에 완전히 덮인 콘텐츠가 있는가
    await page.eval(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(250);
    geo.covered = await page.eval(() => {
      // 모달이 떠 있으면 뒤 화면은 보이지 않으므로 가림 판정 대상이 아니다
      if (document.querySelector('.modal')) return [];
      const bars = [...document.querySelectorAll('.tabbar__inner, .editfoot, .grid__head')]
        .map((b) => b.getBoundingClientRect());
      if (!bars.length) return [];
      const hit = [];
      for (const el of document.querySelectorAll('.grid__row button, .graderow, .sessionrow, .bento__cell, .btn, .swatch')) {
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= innerHeight) continue;
        for (const b of bars) {
          const ov = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
          if (ov > r.height * 0.5) {
            hit.push({ el: `${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ')[0]} "${(el.textContent||'').trim().slice(0,20)}"`,
                       coveredPct: Math.round((ov / r.height) * 100) });
            break;
          }
        }
      }
      return hit;
    });

    await page.eval(new Function(AXE + '; return true;'));
    const axe = await page.eval(async () => {
      const r = await window.axe.run(document, {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'],
        resultTypes: ['violations'],
      });
      return r.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.slice(0, 4).map((n) => ({
          target: n.target.join(' '),
          summary: (n.failureSummary || '').split('\n').filter(Boolean).slice(1, 3).join(' / '),
        })),
        count: v.nodes.length,
      }));
    });
    report.push({ theme, screen: sc.name, geo, axe });
    } catch (e) {
      console.log(`  ${theme}·${sc.name} 준비 실패: ${String(e.message).slice(0, 70)}`);
    }
    await page.close();
  }
}

/* ---------- 출력 ---------- */
const agg = new Map();
const add = (k, detail) => { if (!agg.has(k)) agg.set(k, new Set()); agg.get(k).add(detail); };

for (const r of report) {
  for (const v of r.axe) {
    for (const n of v.nodes) add(`AXE/${v.id} (${v.impact})`, `${r.theme}·${r.screen} · ${n.target} — ${n.summary.slice(0, 110)}`);
  }
  for (const o of r.geo.overlap)      add('겹침 O1(레이아웃 붕괴)', `${r.theme}·${r.screen} · ${o.a} ↔ ${o.b} (${o.area}px²)`);
  for (const o of r.geo.barBleed)     add('고정바 비침 O2', `${r.theme}·${r.screen} · ${o.bar} 아래 ${o.under} (알파 ${o.alpha})`);
  for (const o of r.geo.clipped)      add('잘림 O3', `${r.theme}·${r.screen} · ${o.el} ${o.clientW}→${o.scrollW}px`);
  for (const o of r.geo.overflow)     add('넘침 O4', `${r.theme}·${r.screen} · ${o.el} in ${o.parent} +${o.by}px`);
  for (const o of r.geo.tiny)         add('작은 글자 R1', `${r.theme}·${r.screen} · ${o.el} ${o.fontSize}px`);
  for (const o of r.geo.smallTap)     add('작은 탭 타겟 R2', `${r.theme}·${r.screen} · ${o.el} ${o.w}×${o.h}`);
  for (const o of r.geo.tightLeading) add('좁은 줄간격 R3', `${r.theme}·${r.screen} · ${o.el} ${o.ratio}`);
  for (const o of (r.geo.covered ?? [])) add('최하단에서 고정바에 덮임 O2b', `${r.theme}·${r.screen} · ${o.el} ${o.coveredPct}% 가려짐`);
}

console.log('\n########## UI 감사 결과 ##########\n');
for (const [k, set] of [...agg].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`### ${k} — ${set.size}건`);
  for (const d of [...set].slice(0, 8)) console.log('   ·', d);
  if (set.size > 8) console.log(`   … 외 ${set.size - 8}건`);
  console.log();
}
console.log('총 이슈 종류:', agg.size, '/ 총 건수:', [...agg.values()].reduce((a, s) => a + s.size, 0));
