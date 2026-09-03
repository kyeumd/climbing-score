/**
 * 모바일 레이아웃 전수조사.
 *
 * 기존 검사는 414x896 과 360x640 만 봤다. 실기기에서 깨지는데 도구는 0건을
 * 내는 일이 있었고, 원인은 셋이었다.
 *
 *   1. 320px 폭을 한 번도 보지 않았다
 *   2. 주소창이 있는 상태(= 보이는 높이가 레이아웃 높이보다 작음)를 흉내내지 않았다
 *   3. mobile 플래그 없이 띄워 데스크톱 레이아웃 규칙으로 계산했다
 *
 * 여기서는 좁고 낮은 화면까지 훑고, 고정 요소가 보이는 영역을 벗어나는지 본다.
 *
 *   node tools/mobile-audit.mjs
 */
import { launch, sleep } from './cdp.mjs';
import { open as openApp, scene } from './seed.mjs';

const PROBE = function () {
  const out = { 가로넘침: [], 화면밖: [], 바에가림: [] };
  const vw = innerWidth, vh = innerHeight;
  const name = (el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().trim().split(/\s+/)[0] || '-'}`;

  // 문서 자체가 가로로 넘치는가
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) out.가로넘침.push(`문서 ${vw}→${de.scrollWidth}`);

  const modal = document.querySelector('.modal');
  const scope = modal ?? document.body;

  for (const el of scope.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;

    // 오른쪽으로 삐져나감 (가로 스크롤 컨테이너 안은 정상)
    let inScroller = false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(n).overflowX)) { inScroller = true; break; }
    }
    if (!inScroller && r.right > vw + 1) {
      out.가로넘침.push(`${name(el)} 오른쪽 ${Math.round(r.right - vw)}px`);
    }

    // 고정 요소가 보이는 높이를 벗어남 — 주소창이 있는 기기에서 안 보인다
    if (cs.position === 'fixed' && r.bottom > vh + 1) {
      out.화면밖.push(`${name(el)} 아래 ${Math.round(r.bottom - vh)}px`);
    }
  }

  // 모달 시트가 화면 안에 다 들어오는가
  const sheet = modal?.querySelector('.modal__sheet');
  if (sheet) {
    const r = sheet.getBoundingClientRect();
    const over = Math.max(0, r.bottom - vh) + Math.max(0, -r.top);
    if (over > 1) out.화면밖.push(`modal__sheet ${Math.round(over)}px 밖`);
  }

  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 5);
  return out;
};

const SCENES = [
  ['기록', null],
  ['짐 선택기', `tap(q('.matchbar__gym'))`],
  ['날짜', `tap(q('.matchbar__date'))`],
  ['참가자 넣기', `tap(byText('.btn', '참가자 추가'))`],
  ['명단 편집', `tap(byText('.btn', '참가자 추가'))`],
  ['세션 편집', `tap(q('.tab', 1)); await wait(600); q('.sessionrow').click()`],
  ['짐 설정', `tap(q('.tab', 3))`],
  ['색 고르기', `tap(q('.tab', 3)); await wait(600); tap(q('.graderow__dot'))`],
  ['점수표', `tap(q('.tab', 3)); await wait(500); tap(byText('.btn', '점수표'))`],
];

/* 좁은 폭과 낮은 높이를 함께 본다. 낮은 높이는 주소창이 떠 있는 상태다. */
const VPS = [
  [320, 568, 'iPhone SE'],
  [360, 640, '작은 안드로이드'],
  [390, 664, 'iPhone 주소창'],
  [412, 780, '큰 안드로이드'],
];

let found = 0;
for (const [w, h, label] of VPS) {
  for (const [sceneName, code] of SCENES) {
    const page = await (await launch({ width: w, height: h, dark: true })).connect();
    try {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: 2, mobile: true,
      });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await openApp(page, { sleep });
      if (code) await scene(page, code, { sleep, wait: 700 });
      const r = await page.eval(PROBE);
      const hits = Object.entries(r).filter(([, v]) => v.length);
      if (hits.length) {
        found += hits.reduce((a, [, v]) => a + v.length, 0);
        console.log(`\n[${label} ${w}x${h}] ${sceneName}`);
        for (const [k, v] of hits) for (const x of v) console.log(`   ${k}: ${x}`);
      }
    } catch (e) {
      found++;
      console.log(`\n[${label} ${w}x${h}] ${sceneName} — 검사 실패: ${String(e.message).slice(0, 60)}`);
    }
    await page.close();
  }
}
console.log(found ? `\n########## 모바일 감사 — ${found}건 ##########` : '\n########## 모바일 감사 — 발견 없음 ##########');
