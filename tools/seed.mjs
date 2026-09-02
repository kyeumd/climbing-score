/**
 * 브라우저 안에서 도는 공용 조작 코드.
 *
 * 예전에는 검사 도구마다 tools/demo.html 을 열었다. 데모는 보기 좋게 꾸민
 * 화면이라 사용자가 보는 index.html 과 다르다. 도구가 스스로를 속이는 셈이었다.
 * (실제로 감사기가 데모에만 있는 h1 누락을 12건 보고하고 있었다.)
 *
 * 그래서 여기 모아 둔 코드로 실제 앱을 띄운 뒤 사용자가 하듯 눌러서 상태를 만든다.
 * 느리지만 이게 사용자가 보는 화면이다. review.mjs 와 ui-audit.mjs 가 같이 쓴다.
 */

export const APP = 'http://localhost:8099/index.html';

/** 브라우저 안에서 쓸 잡동사니. eval 로 넘기는 코드 앞에 붙인다. */
export const HELPERS = `
  const q = (s, n = 0) => document.querySelectorAll(s)[n];
  const byText = (s, t) => [...document.querySelectorAll(s)].find(e => e.textContent.includes(t));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const tap = (el) => { if (!el) throw new Error('없음');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    el.click(); };
  const until = async (fn, what, tries = 40) => {
    for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(120); }
    throw new Error('나타나지 않음: ' + what);
  };
`;

/*
 * 짐을 고르고 참가자를 만들고 완등 몇 개를 눌러, 기록이 있는 상태로 만든다.
 *
 * OPTS 로 갈래를 준다. 기본값 하나만 두었더니 검토 루프가 늘 같은 상태만 봤다.
 * 색 순서 확인 배너, 색 등급이 없는 짐, 즐겨찾기가 있는 목록은 60장 어디에도
 * 없어서 몇 라운드 동안 한 번도 검사되지 않았다.
 *
 *   gym     고를 짐 (검색어)
 *   confirm 색 순서 확인 배너를 눌러 치울지
 *   record  완등을 몇 개 눌러 둘지
 */
export const SEED = `
  ${HELPERS}
  const OPT = Object.assign({ gym: '더클라임 강남', confirm: true, record: true }, OPTS || {});

  tap(await until(() => byText('.btn', '클라이밍장'), '클라이밍장 버튼'));
  const search = await until(() => q('.field[type=search]'), '검색창');
  search.value = OPT.gym;
  search.dispatchEvent(new Event('input', { bubbles: true }));
  tap(await until(() => q('.gymrow__pick'), '검색 결과'));

  const ok = await until(
    () => byText('.btn', '맞아요') || byText('.btn', '참가자 추가') || byText('.btn', '난이도 설정하기'),
    '대결 화면');
  if (OPT.confirm && ok.textContent.includes('맞아요')) { tap(ok); await wait(400); }

  // 참가자는 팝업이 아니라 격자 머리글에 열리는 이름 칸에서 바로 붙인다
  const addBtn = byText('.btn', '참가자 추가');
  if (addBtn) {
    tap(addBtn);
    const nameInput = await until(() => q('.grid__new'), '이름 칸');
    nameInput.value = '동균';
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => q('.grid__name'), '참가자 열');
    // 이름 칸을 닫아 원래 열 너비로 돌려놓는다
    const still = q('.grid__new');
    if (still) still.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(200);
  }

  if (OPT.record) {
    await until(() => q('.grid__row'), '기록 격자');
    for (const [row, times] of [[3, 4], [4, 2], [5, 1]]) {
      for (let k = 0; k < times; k++) {
        const cell = document.querySelectorAll('.grid__row')[row]?.querySelector('button');
        if (cell) { tap(cell); await wait(130); }
      }
    }
  }
`;

/*
 * 서버가 떠 있는지 한 번만 확인한다.
 *
 * 개발 서버가 죽은 채로 검사기를 돌리면 화면마다 제각각인 오류가 쏟아진다.
 * 실제로 'SecurityError: localStorage' 8건과 'timeout: Runtime.evaluate' 11건이
 * 그렇게 나왔다. 앱이 망가진 것처럼 보이지만 원인은 꺼진 서버 하나다.
 * 처음에 한 번 물어보고, 아니면 이유를 말하고 멈춘다.
 */
let serverChecked = false;
export async function ensureServer() {
  if (serverChecked) return;
  try {
    const res = await fetch(APP, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw new Error(
      `개발 서버에 연결할 수 없습니다 (${APP}).\n`
      + `  python3 tools/dev-server.py 8099\n`
      + `  원인: ${e.message}`);
  }
  serverChecked = true;
}

/**
 * 빈 앱을 띄우고, 원하면 시드까지 심는다.
 * 고정 대기는 시드 크기에 따라 아슬아슬해지므로 화면이 준비될 때까지 기다린다.
 */
export async function open(page, { seed = true, sleep, ...opts } = {}) {
  await ensureServer();
  await page.goto(APP, { wait: 600 });
  await page.eval(() => localStorage.clear());
  await page.goto(APP, { wait: 1200 });
  for (let i = 0; i < 40; i++) {
    const ready = await page.eval(() =>
      !!document.querySelector('.btn, .matchbar__gym, .grid__row'));
    if (ready) break;
    await sleep(150);
  }
  if (seed) {
    await page.eval(new Function('OPTS', `return (async()=>{ ${SEED} })()`), opts);
    await sleep(600);
  }
}

/** 화면 안에서 한 장면을 만든다 (탭 이동, 모달 열기 등) */
export async function scene(page, code, { sleep, wait = 750 } = {}) {
  if (!code) return;
  await page.eval(new Function(`return (async()=>{ ${HELPERS} ${code} })()`));
  await sleep(wait);
}
