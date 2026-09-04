/**
 * 두 기기가 같은 방을 실시간으로 보는지 검증한다.
 *
 * 진짜 Firebase 주소가 없어도 여기까지는 확인할 수 있다. 가짜 RTDB 가 진짜와
 * 같은 REST·SSE 규약으로 답하므로, 앱 쪽 코드는 상대가 진짜인지 모른다.
 * 주소를 받은 뒤에 확인할 것은 "EventSource 로 RTDB 스트림이 열리는가" 하나만
 * 남는다.
 *
 * 브라우저 두 개를 띄워 한쪽에서 누르고 다른 쪽 화면이 스스로 바뀌는지 본다.
 * 새로고침은 하지 않는다 — 새로고침해서 보이면 실시간이 아니다.
 *
 *   node tools/e2e-sync.mjs
 */
import { launch, sleep } from './cdp.mjs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PORT = 8100;
const APP_PORT = 8101;
const DB_URL = `http://localhost:${DB_PORT}`;
const ROOM = 'ABCD23456789WXYZ';   // 16자, 알파벳 안의 글자만

let pass = 0; let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra ? ' — ' + extra : ''}`); }
};

/*
 * 앱을 서빙하되 config.js 만 갈아 끼운다.
 *
 * 저장소의 config.js 를 건드렸다가 도중에 죽으면 서버 주소가 박힌 채로 남는다.
 * 파일은 그대로 두고 응답만 바꾼다.
 */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json' };

const appServer = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const headers = { 'Cache-Control': 'no-store' };
  if (path === '/src/config.js') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/javascript' });
    res.end(`export const DATABASE_URL = ${JSON.stringify(DB_URL)};\n`);
    return;
  }
  try {
    const file = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { ...headers, 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404, headers); res.end('not found');
  }
});
await new Promise((r) => appServer.listen(APP_PORT, r));

/*
 * 앞선 실행이 남긴 가짜 서버가 포트를 잡고 있으면, 새로 띄운 것은 조용히
 * 죽고 우리는 옛 데이터가 든 방을 보게 된다. 그러면 테스트는 앱이 깨진 것처럼
 * 보고하는데 실제로 깨진 건 좀비 하나다. 실제로 그렇게 한 번 속았다.
 * 먼저 물어보고, 누가 있으면 이유를 말하고 멈춘다.
 */
const answered = await fetch(`${DB_URL}/ping.json`).then(() => true).catch(() => false);
if (answered) {
  console.log(`포트 ${DB_PORT} 에 이미 무언가 떠 있습니다. 앞선 실행이 남은 것일 수 있어요.`);
  console.log(`  lsof -nP -iTCP:${DB_PORT} -sTCP:LISTEN`);
  appServer.close();
  process.exit(1);
}

const db = spawn(process.execPath, [join(ROOT, 'tools/fake-rtdb.mjs'), String(DB_PORT)], { stdio: 'ignore' });
const bye = () => { try { db.kill('SIGKILL'); } catch {} try { appServer.close(); } catch {} };
process.on('exit', bye);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { bye(); process.exit(1); });
process.on('uncaughtException', (e) => { bye(); console.log('실패:', e.message); process.exit(1); });

// 떴는지 확인하고 시작한다. 고정 대기는 기계가 바쁠 때 모자란다.
for (let i = 0; i < 40; i++) {
  if (await fetch(`${DB_URL}/ping.json`).then(() => true).catch(() => false)) break;
  await sleep(150);
}
// 방을 비우고 시작한다. 남은 값이 있으면 첫 화면부터 달라진다.
await fetch(`${DB_URL}/rooms/${ROOM}.json`, { method: 'DELETE' });

const HELPERS = `
  const q = (s, n = 0) => document.querySelectorAll(s)[n];
  const byText = (s, t) => [...document.querySelectorAll(s)].find(e => e.textContent.includes(t));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const tap = (el) => { if (!el) throw new Error('없음');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    el.click(); };
  const until = async (fn, what, tries = 60) => {
    for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(150); }
    throw new Error('나타나지 않음: ' + what);
  };
`;

/** 같은 방 코드를 심고 앱을 연다 */
async function openApp(page) {
  await page.goto(`http://localhost:${APP_PORT}/index.html`, { wait: 500 });
  await page.eval((room) => {
    localStorage.clear();
    localStorage.setItem('climbing-score/room', room);
  }, ROOM);
  await page.goto(`http://localhost:${APP_PORT}/index.html`, { wait: 1500 });
}

const run = (page, code) => page.eval(new Function(`return (async()=>{ ${HELPERS} ${code} })()`));

const A = await (await launch({ width: 414, height: 896, dark: true })).connect();
const B = await (await launch({ width: 414, height: 896, dark: true })).connect();

try {
  console.log('--- 첫 기기가 방을 만든다 ---');
  await openApp(A);
  await run(A, `
    tap(await until(() => byText('.btn', '클라이밍장'), '클라이밍장 버튼'));
    const s = await until(() => q('.field[type=search]'), '검색창');
    s.value = '더클라임 강남'; s.dispatchEvent(new Event('input', { bubbles: true }));
    tap(await until(() => q('.gymrow__pick'), '검색 결과'));
    const okBtn = await until(() => byText('.btn', '맞아요') || q('.grid__add'), '대결 화면');
    if (okBtn.textContent.includes('맞아요')) { tap(okBtn); await wait(400); }
    tap(await until(() => q('.grid__add'), '+ 카드'));
    const i = await until(() => q('.modal .newperson__id'), '아이디 칸');
    i.focus(); i.value = '동균';
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => q('.grid__name'), '사람 카드');
    tap(byText('.modal .btn', '닫기'));
    await until(() => !q('.modal'), '시트 닫힘');
    tap(await until(() => q('.grid__row .cell'), '기록 칸'));
    await wait(400);
  `);
  const aScore = await A.text('.grid__score');
  ok('첫 기기에 점수가 생긴다', Number(aScore) > 0, `점수 ${aScore}`);

  console.log('--- 둘째 기기가 같은 방에 들어온다 ---');
  await openApp(B);
  await run(B, `await until(() => q('.grid__name'), '사람 카드')`);
  ok('둘째 기기가 사람을 받아 온다', (await B.text('.grid__name')) === '동균',
     await B.text('.grid__name'));
  ok('둘째 기기가 점수까지 받아 온다', (await B.text('.grid__score')) === aScore,
     `A=${aScore} B=${await B.text('.grid__score')}`);

  console.log('--- 한쪽에서 누르면 다른 쪽이 스스로 바뀐다 ---');
  const before = Number(await B.text('.grid__score'));
  await run(A, `tap(q('.grid__row .cell')); await wait(300); tap(q('.grid__row .cell'))`);
  // 새로고침 없이 기다린다
  let after = before;
  for (let i = 0; i < 40; i++) {
    after = Number(await B.text('.grid__score'));
    if (after > before) break;
    await sleep(200);
  }
  ok('A 가 누르면 B 화면이 새로고침 없이 오른다', after > before, `${before} → ${after}`);

  const beforeA = Number(await A.text('.grid__score'));
  await run(B, `tap(q('.grid__row .cell', 1))`);
  let afterA = beforeA;
  for (let i = 0; i < 40; i++) {
    afterA = Number(await A.text('.grid__score'));
    if (afterA > beforeA) break;
    await sleep(200);
  }
  ok('B 가 누르면 A 화면도 오른다', afterA > beforeA, `${beforeA} → ${afterA}`);

  console.log('--- 사람을 넣고 빼는 것도 건너간다 ---');
  await run(A, `
    tap(q('.grid__add'));
    const i = await until(() => q('.modal .newperson__id'), '아이디 칸');
    i.focus(); i.value = '지수';
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(500);
    tap(byText('.modal .btn', '닫기'));
  `);
  let cols = 0;
  for (let i = 0; i < 40; i++) {
    cols = await B.count('.grid__person');
    if (cols === 2) break;
    await sleep(200);
  }
  ok('A 가 만든 사람이 B 격자에 선다', cols === 2, `열 ${cols}개`);

  console.log('--- 짐 설정도 함께 본다 ---');
  await run(A, `
    tap(q('.tab', 3));
    const label = await until(() => q('.graderow__label'), '등급 이름 칸');
    label.value = '연두빛'; label.dispatchEvent(new Event('change', { bubbles: true }));
  `);
  let bLabel = '';
  for (let i = 0; i < 40; i++) {
    bLabel = await B.text('.grid__label');
    if (bLabel === '연두빛') break;
    await sleep(200);
  }
  ok('A 가 고친 색 이름이 B 격자에 뜬다', bLabel === '연두빛', bLabel);

  console.log('--- 초대 링크로 들어온다 ---');
  /*
   * 친구가 카톡으로 받은 링크를 누르는 상황이다. 아무것도 치지 않고 같은 방에
   * 들어와야 하고, 들어온 뒤에는 주소창에 코드가 남아 있으면 안 된다.
   */
  const D = await (await launch({ width: 414, height: 896, dark: true })).connect();
  await D.goto(`http://localhost:${APP_PORT}/index.html`, { wait: 400 });
  await D.eval(() => localStorage.clear());
  /*
   * # 만 다른 주소로 옮기면 브라우저는 페이지를 다시 읽지 않는다. 그러면 앱은
   * 실행되지 않는데 테스트는 '링크가 안 먹는다' 고 보고한다. 카톡에서 눌러
   * 들어오는 상황은 새 로드이므로, 여기서도 진짜 로드가 되게 한다.
   */
  await D.goto('about:blank', { wait: 200 });
  await D.goto(`http://localhost:${APP_PORT}/index.html#room=${ROOM}`, { wait: 1800 });
  let linkedName = null;
  for (let i = 0; i < 40; i++) {
    linkedName = await D.text('.grid__name');
    if (linkedName) break;
    await sleep(200);
  }
  ok('링크만 누르면 같은 방에 들어온다', linkedName === '동균', String(linkedName));
  const addr = await D.eval(() => ({
    hash: location.hash,
    room: localStorage.getItem('climbing-score/room'),
  }));
  ok('주소창에 코드가 남지 않는다', addr.hash === '', addr.hash);
  ok('방 코드는 이 기기에 저장된다', addr.room === ROOM, String(addr.room));

  /* 열려 있는 앱에 링크를 붙여 넣는 경우. # 만 바뀌면 페이지가 다시 안 읽힌다. */
  const OTHER = 'ZZZZ23456789WXYZ';
  await D.eval((r) => { location.hash = `#room=${r}`; }, OTHER);
  let moved = null;
  for (let i = 0; i < 40; i++) {
    moved = await D.eval(() => localStorage.getItem('climbing-score/room'));
    if (moved === OTHER) break;
    await sleep(200);
  }
  ok('열려 있는 앱에 링크를 넣어도 옮겨진다', moved === OTHER, String(moved));
  await D.close();

  console.log('--- 누가 방을 통째로 비워도 기록이 살아난다 ---');
  /*
   * 계정이 없으니 코드를 아는 사람은 방을 지울 수 있다. 그 빈 상태를 진실로
   * 받으면 모든 기기의 캐시까지 따라 지워지고, 서버 백업은 없다.
   * 기록이 남은 기기가 하나라도 있으면 되살아나야 한다.
   */
  await fetch(`${DB_URL}/rooms/${ROOM}.json`, { method: 'DELETE' });
  let revived = 0;
  for (let i = 0; i < 50; i++) {
    const back = await fetch(`${DB_URL}/rooms/${ROOM}/sessions.json`)
      .then((r) => r.json()).catch(() => null);
    revived = back ? Object.keys(back).length : 0;
    if (revived > 0) break;
    await sleep(200);
  }
  ok('지워진 방이 스스로 되살아난다', revived > 0, `세션 ${revived}개`);
  /* A 는 앞 단계에서 짐 설정 화면으로 갔다. 격자를 보고 있는 것은 B 다. */
  let aliveB = 0;
  for (let i = 0; i < 40; i++) {
    aliveB = await B.count('.grid__person');
    if (aliveB >= 2) break;
    await sleep(200);
  }
  ok('그 사이 다른 기기 화면의 사람도 그대로다', aliveB >= 2, `열 ${aliveB}개`);

  console.log('--- 초대 링크를 눌러 복사한다 ---');
  const E = await (await launch({ width: 390, height: 664, dark: true })).connect();
  await openApp(E);
  // 클립보드 권한은 헤드리스에서 막혀 있을 수 있다. 실제로 무엇을 복사하려 했는지 가로챈다.
  await E.eval(() => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } },
    });
  });
  await run(E, `
    tap(await until(() => q('.tab', 2), '프로필 탭'));
    tap(await until(() => q('.room__linkbtn'), '링크'));
    await wait(400);
  `);
  const copiedByLink = await E.eval(() => window.__copied);
  ok('링크를 누르면 복사된다', copiedByLink?.includes(`#room=${ROOM}`), String(copiedByLink));
  ok('복사한 링크에 사이트 주소가 들어 있다', copiedByLink?.startsWith('http'), String(copiedByLink));
  await E.eval(() => { window.__copied = null; });
  await run(E, `tap(byText('.btn', '초대 링크 복사')); await wait(400);`);
  const copiedByBtn = await E.eval(() => window.__copied);
  ok('버튼으로도 복사된다', copiedByBtn === copiedByLink, String(copiedByBtn));
  const said = await E.text('.room__said');
  ok('복사했다고 알려 준다', /복사/.test(said ?? ''), String(said));
  await E.close();

  console.log('--- 좁은 화면에서 초대 칸이 넘치지 않는다 ---');
  /*
   * 이 칸은 서버 주소가 있을 때만 그려진다. 저장소의 주소는 비어 있으므로
   * 평소 검사기(ui-audit, mobile-audit)는 이 화면을 영영 못 본다. 실제로
   * 360px 에서 '들어가기' 가 오른쪽으로 잘린 것을 눈으로 먼저 발견했다.
   * 서버를 켜고 도는 이 테스트가 그 자리를 맡는다.
   */
  const C = await (await launch({ width: 360, height: 640, dark: true })).connect();
  await C.send('Emulation.setDeviceMetricsOverride', {
    width: 360, height: 640, deviceScaleFactor: 2, mobile: true,
  });
  await openApp(C);
  // 코드 칸은 '링크 대신 코드로 하기' 를 펼쳐야 나온다
  await run(C, `
    tap(await until(() => q('.tab', 2), '프로필 탭'));
    const d = await until(() => q('.room__manual'), '코드 접이칸');
    d.open = true;
    await wait(300);
  `);
  const overflow = await C.eval(() => {
    const de = document.documentElement;
    const room = document.querySelector('.room__manualbody');
    const btn = [...document.querySelectorAll('.room__manualbody .btn')].pop();
    return {
      page: de.scrollWidth - innerWidth,
      panel: !!room,
      code: document.querySelector('.room__code')?.textContent ?? '',
      btnRight: btn ? Math.round(btn.getBoundingClientRect().right) : -1,
      vw: innerWidth,
    };
  });
  ok('코드 칸이 펼쳐진다', overflow.panel);
  ok('내 방 코드가 보인다', overflow.code.replace(/-/g, '') === ROOM, overflow.code);
  ok('문서가 가로로 넘치지 않는다', overflow.page <= 1, `${overflow.page}px 넘침`);
  ok('들어가기 버튼이 화면 안에 있다', overflow.btnRight > 0 && overflow.btnRight <= overflow.vw + 1,
     `오른쪽 끝 ${overflow.btnRight} / 화면 ${overflow.vw}`);
  await C.close();

  const errs = [...A.takeErrors().page, ...B.takeErrors().page];
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | ').slice(0, 160));
} catch (e) {
  fail++;
  console.log('  실패:', e.message);
}

await A.close(); await B.close();
bye();
console.log(fail ? `\n${pass}개 통과, ${fail}개 실패` : `\n전부 통과 (${pass}개)`);
process.exit(fail ? 1 : 0);
