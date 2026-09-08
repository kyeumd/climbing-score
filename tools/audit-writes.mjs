/**
 * 전수조사 — 화면에서 무언가를 바꿨을 때 서버에도 실제로 들어가는가.
 *
 * "UI 만 바뀌고 데이터는 그대로" 를 잡는 것이 목적이다. 화면은 자기가 방금
 * 만든 상태를 그리므로, 저장이 실패해도 그 순간에는 멀쩡해 보인다. 다음에
 * 열었을 때나 다른 기기에서야 드러난다.
 *
 * 그래서 매 동작마다 브라우저를 조작한 뒤 서버를 직접 읽어 대조한다.
 * 화면이 아니라 서버가 판정한다.
 *
 *   node tools/audit-writes.mjs
 */
import { launch, sleep } from './cdp.mjs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PORT = 8110;
const APP_PORT = 8111;
const DB = `http://localhost:${DB_PORT}`;
/* 코드 알파벳(domain/room.js)에 있는 글자만 쓴다. 0·1·I·L·O·U 는 없다 —
   전에 'AUDIT...' 를 썼다가 U 가 걸러져 앱은 다른 방을 보고 있었고,
   검사기는 "아무것도 저장되지 않는다" 고 12건을 보고했다. */
const ROOM = 'AVDT23456789WXYZ';

let pass = 0; const fails = [];
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fails.push(label); console.log(`  FAIL ${label}${extra ? ' — ' + extra : ''}`); }
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json' };
const appServer = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const head = { 'Cache-Control': 'no-store' };
  if (path === '/src/config.js') {
    res.writeHead(200, { ...head, 'Content-Type': 'text/javascript' });
    res.end(`export const DATABASE_URL = ${JSON.stringify(DB)};\n`); return;
  }
  try {
    const file = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { ...head, 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(file);
  } catch { res.writeHead(404, head); res.end(); }
});
await new Promise((r) => appServer.listen(APP_PORT, r));

if (await fetch(`${DB}/x.json`).then(() => true).catch(() => false)) {
  console.log(`포트 ${DB_PORT} 에 이미 무언가 떠 있습니다.`); appServer.close(); process.exit(1);
}
const db = spawn(process.execPath, [join(ROOT, 'tools/fake-rtdb.mjs'), String(DB_PORT)], { stdio: 'ignore' });
const bye = () => { try { db.kill('SIGKILL'); } catch {} try { appServer.close(); } catch {} };
process.on('exit', bye);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { bye(); process.exit(1); });
process.on('uncaughtException', (e) => { bye(); console.log('실패:', e.message); process.exit(1); });
for (let i = 0; i < 40; i++) {
  if (await fetch(`${DB}/x.json`).then(() => true).catch(() => false)) break;
  await sleep(150);
}
await fetch(`${DB}/rooms/${ROOM}.json`, { method: 'DELETE' });

const HELPERS = `
  const q=(s,n=0)=>document.querySelectorAll(s)[n];
  const byText=(s,t)=>[...document.querySelectorAll(s)].find(e=>e.textContent.includes(t));
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  const tap=(el)=>{if(!el)throw new Error('없음: 요소');
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));
    el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));el.click();};
  const hold=(el)=>new Promise(r=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));
    setTimeout(()=>{el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));r();},700);});
  const until=async(fn,what,tries=60)=>{for(let i=0;i<tries;i++){const v=fn();if(v)return v;await wait(150);}throw new Error('나타나지 않음: '+what);};
`;

const page = await (await launch({ width: 414, height: 896, dark: true })).connect();
const run = (code) => page.eval(new Function(`return (async()=>{ ${HELPERS} ${code} })()`));
/** 서버를 직접 읽는다. 화면 말고 여기가 판정 기준이다. */
const server = (path = '') => fetch(`${DB}/rooms/${ROOM}${path}.json`).then((r) => r.json()).catch(() => null);
/** 서버 값이 조건을 만족할 때까지 잠깐 기다린다. 쓰기는 비동기다. */
async function settle(path, test, tries = 30) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await server(path);
    if (test(last)) return last;
    await sleep(200);
  }
  return last;
}

try {
  await page.goto(`http://localhost:${APP_PORT}/index.html`, { wait: 500 });
  await page.eval((r) => { localStorage.clear(); localStorage.setItem('climbing-score/room', r); }, ROOM);
  await page.goto(`http://localhost:${APP_PORT}/index.html`, { wait: 1500 });

  /* 앱이 실제로 쓰는 방과 우리가 읽는 방이 같은지 먼저 못 박는다.
     다르면 이후 모든 항목이 "저장 안 됨" 으로 나와 원인을 엉뚱한 데서 찾게 된다. */
  const appRoom = await page.eval(() => localStorage.getItem('climbing-score/room'));
  if (appRoom !== ROOM) {
    console.log(`  방이 어긋납니다 — 검사기 ${ROOM} / 앱 ${appRoom}`);
    throw new Error('방 코드 불일치');
  }
  ok('검사기와 앱이 같은 방을 본다', true);

  console.log('--- 짐 고르기 · 사람 만들기 ---');
  await run(`
    tap(await until(()=>byText('.btn','클라이밍장'),'클라이밍장 버튼'));
    const s=await until(()=>q('.field[type=search]'),'검색창');
    s.value='더클라임 강남'; s.dispatchEvent(new Event('input',{bubbles:true}));
    tap(await until(()=>q('.gymrow__pick'),'검색 결과'));
    const o=await until(()=>byText('.btn','맞아요')||q('.grid__add'),'대결 화면');
    if(o.textContent.includes('맞아요')){tap(o);await wait(400);}
    tap(await until(()=>q('.grid__add'),'+ 카드'));
    for (const nm of ['동균','지수']) {
      const i=await until(()=>q('.modal .newperson__id'),'아이디 칸');
      i.focus(); i.value=nm;
      i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      await wait(400);
    }
    tap(byText('.modal .btn','닫기'));
    await until(()=>!q('.modal'),'시트 닫힘');
  `);
  let profiles = await settle('/profiles', (v) => v && Object.keys(v).length === 2);
  ok('사람 추가가 서버에 들어간다', profiles && Object.keys(profiles).length === 2,
     `서버 ${profiles ? Object.keys(profiles).length : 0}명`);

  console.log('--- 완등 기록 ---');
  await run(`tap(await until(()=>q('.grid__row .cell'),'기록 칸')); await wait(300);`);
  let sessions = await settle('/sessions', (v) => v && Object.values(v).some((s) => Object.keys(s.counts ?? {}).length));
  const countOf = (v) => Object.values(v ?? {}).reduce((a, s) =>
    a + Object.values(s.counts ?? {}).reduce((x, y) => x + y, 0), 0);
  ok('완등 +1 이 서버에 들어간다', countOf(sessions) === 1, `서버 합계 ${countOf(sessions)}`);

  await run(`tap(q('.grid__row .cell')); await wait(250); tap(q('.grid__row .cell')); await wait(350);`);
  sessions = await settle('/sessions', (v) => countOf(v) === 3);
  ok('연속 탭이 하나도 안 빠진다', countOf(sessions) === 3, `서버 합계 ${countOf(sessions)}`);

  await run(`await hold(q('.grid__row .cell')); await wait(400);`);
  sessions = await settle('/sessions', (v) => countOf(v) === 2);
  ok('길게 눌러 -1 도 서버에 간다', countOf(sessions) === 2, `서버 합계 ${countOf(sessions)}`);

  console.log('--- 한 사람 한 세션인가 ---');
  const perPerson = {};
  for (const s of Object.values(sessions ?? {})) {
    const k = `${s.profileId}|${s.gymId}|${s.date}`;
    perPerson[k] = (perPerson[k] ?? 0) + 1;
  }
  const dup = Object.entries(perPerson).filter(([, n]) => n > 1);
  ok('같은 사람·짐·날짜에 세션이 하나뿐이다', dup.length === 0, JSON.stringify(dup));

  /*
   * 점수표 검사는 색을 은퇴시키기 전에 한다.
   *
   * 은퇴한 색은 화면에서 줄이 빠지지만 그 색으로 센 완등은 점수에 남는다.
   * 그게 맞는 동작인데, 그 뒤에 '칸 값 × 개수 = 합계' 를 보면 보이지 않는
   * 줄 때문에 안 맞는다. 앱이 아니라 검사가 틀린 것이라 순서를 앞으로 뒀다.
   */
  console.log('--- 점수표를 고치면 대결 점수가 따라오는가 ---');
  /*
   * 사용자가 실제로 밟는 길: 클라이밍장 → 점수표 열기 → 값 고치기 → 대결.
   *
   * 서버에 값이 들어가는 것과 그 값이 실제로 쓰이는 것은 다르다. 점수표는
   * 저장은 됐는데 대결 점수가 옛 표로 세어지고 있었다. 칸에는 새 값이 적히니
   * 화면만 보면 멀쩡하다 — 적어 놓은 값과 주는 값이 달랐다.
   *
   * 판정은 배수로 하지 않는다. 점수는 100 이상에서 유효숫자 두 자리로
   * 다듬어져 정확한 배수가 아니다. 대신 더 강한 것을 본다 —
   * 칸에 적힌 값 × 개수를 다 더하면 합계가 나와야 한다.
   */
  /*
   * 첫 사람의 열만 읽는다. 개수와 개당 점수를 같은 칸에서 꺼내야 한다 —
   * 줄에서 아무 .cell__count 나 집으면 옆 사람 것을 읽고, 합계가 안 맞는다고
   * 엉뚱하게 보고한다. 실제로 한 번 그랬다.
   */
  const readGrid = () => page.eval(() => {
    const num = (t) => Number(String(t ?? '0').replace(/[^\d]/g, ''));
    const rows = [...document.querySelectorAll('.grid__row')].map((r) => {
      const cell = r.querySelector('.cell');
      return {
        unit: num(cell?.querySelector('.cell__unit')?.textContent),
        count: num(cell?.querySelector('.cell__count')?.textContent ?? '0'),
      };
    });
    return {
      total: num(document.querySelector('.grid__score')?.textContent),
      level: num(document.querySelector('.grid__person .hint')?.textContent),
      rows,
    };
  });
  const consistent = (g) => g.rows.reduce((a, r) => a + r.unit * r.count, 0) === g.total;

  await run(`tap(q('.tab',0)); await wait(800);`);
  const beforeTable = await readGrid();
  ok('고치기 전: 칸 값 × 개수 = 합계', consistent(beforeTable),
     `합계 ${beforeTable.total}, 줄 ${JSON.stringify(beforeTable.rows.filter((r) => r.count))}`);

  await run(`
    tap(q('.tab',3)); await wait(700);
    tap(await until(()=>byText('.btn','점수표'),'점수표 열기')); await wait(800);
    const d = await until(()=>q('.dial .field'),'기준 점수');
    d.value='40'; d.dispatchEvent(new Event('change',{bubbles:true})); await wait(700);
    tap(q('.tab',0)); await wait(900);
  `);
  const afterTable = await readGrid();
  ok('칸에 적힌 값이 새 표를 따른다', afterTable.rows[0].unit > beforeTable.rows[0].unit,
     `${beforeTable.rows[0].unit} → ${afterTable.rows[0].unit}`);
  ok('대결 합계도 바로 따라온다', afterTable.total > beforeTable.total,
     `${beforeTable.total} → ${afterTable.total}`);
  ok('고친 뒤: 칸 값 × 개수 = 합계', consistent(afterTable),
     `합계 ${afterTable.total}, 줄 ${JSON.stringify(afterTable.rows.filter((r) => r.count))}`);

  const tapped = await run(`
    const num=(t)=>Number(String(t??'0').replace(/[^\d]/g,''));
    const before = num(q('.grid__score').textContent);
    const unit = num(q('.cell__unit').textContent);
    tap(q('.grid__row .cell')); await wait(700);
    return { before, after: num(q('.grid__score').textContent), unit };
  `);
  ok('한 번 누르면 칸에 적힌 만큼 오른다', tapped.after - tapped.before === tapped.unit,
     `${tapped.before} → ${tapped.after} (칸에는 +${tapped.unit})`);

  /*
   * 개별 칸 수정도 같은 길을 타야 한다.
   *
   * 표에서 고칠 칸은 그 사람의 레벨 줄이어야 한다. Lv.0 칸을 고쳐 놓고
   * Lv.1 인 사람 화면을 보면 당연히 안 바뀌는데, 그걸 버그로 읽기 쉽다.
   */
  await run(`
    tap(q('.tab',3)); await wait(700);
    tap(await until(()=>byText('.btn','점수표'),'점수표 열기')); await wait(800);
    const lv = ${afterTable.level};
    const row = document.querySelectorAll('.matrix tbody tr')[lv];
    if (!row) throw new Error('레벨 ' + lv + ' 줄이 없습니다');
    tap(row.querySelectorAll('td')[0]); await wait(600);
    const f = await until(()=>q('.modal input'),'값 칸');
    f.value='7777'; f.dispatchEvent(new Event('input',{bubbles:true}));
    tap(byText('.modal .btn','저장')); await wait(700);
    tap(q('.tab',0)); await wait(900);
  `);
  const afterOverride = await readGrid();
  ok('개별 칸 수정도 대결에 반영된다', afterOverride.rows.some((r) => r.unit === 7777),
     JSON.stringify(afterOverride.rows.map((r) => r.unit)));
  ok('개별 칸 수정 뒤에도 칸 값 × 개수 = 합계', consistent(afterOverride),
     `합계 ${afterOverride.total}`);

  const savedGym = await settle('/gyms', (v) => Object.values(v ?? {})[0]?.scoreTable?.baseScore === 40);
  ok('바뀐 표가 서버에 저장된다',
     Object.values(savedGym ?? {})[0]?.scoreTable?.baseScore === 40,
     `baseScore ${Object.values(savedGym ?? {})[0]?.scoreTable?.baseScore}`);
  const anySnapshot = await server('/sessions');
  ok('세션에는 점수표를 박지 않는다',
     Object.values(anySnapshot ?? {}).every((x) => x.scoreTable === undefined),
     '스냅샷이 남아 있으면 규칙을 고쳐도 옛 값으로 셀 수 있다');

  console.log('--- 오늘 대결 참가자 ---');
  await run(`
    tap(q('.grid__person', 1)); await wait(400);
    tap(byText('.modal .btn','빼기')); await wait(500);
  `);
  const cols = await page.count('.grid__person');
  ok('오늘 대결에서 빼면 화면이 줄어든다', cols === 1, `열 ${cols}개`);
  const benched = await settle('/sessions',
    (v) => Object.values(v ?? {}).some((x) => x.playing === false));
  ok('뺀 사실이 서버에 저장된다',
     Object.values(benched ?? {}).some((x) => x.playing === false),
     '서버 어디에도 안 남는다 — 친구 화면에는 그대로 서 있게 된다');

  await run(`
    tap(q('.grid__add')); await wait(500);
    const off = [...document.querySelectorAll('.modal .chip')].find(c => c.getAttribute('aria-pressed') === 'false');
    tap(off); await wait(600);
    tap(byText('.modal .btn','닫기')); await wait(400);
  `);
  const backCols = await page.count('.grid__person');
  ok('다시 넣으면 화면에 돌아온다', backCols === 2, `열 ${backCols}개`);
  const rejoined = await settle('/sessions',
    (v) => !Object.values(v ?? {}).some((x) => x.playing === false));
  ok('다시 넣은 것도 서버에 반영된다',
     !Object.values(rejoined ?? {}).some((x) => x.playing === false));

  console.log('--- 레벨 ---');
  await run(`
    tap(q('.tab',2)); await wait(500);
    tap(await until(()=>q('.stepper__btn',1),'레벨 올리기')); await wait(400);
  `);
  profiles = await settle('/profiles', (v) => Object.values(v ?? {}).some((p) => (p.level ?? 0) > 0));
  ok('레벨 변경이 서버에 들어간다',
     Object.values(profiles ?? {}).some((p) => (p.level ?? 0) > 0),
     JSON.stringify(Object.values(profiles ?? {}).map((p) => p.level)));

  console.log('--- 이름 고치기 ---');
  await run(`
    const inp = await until(()=>q('.ename__input'),'이름 칸');
    inp.focus(); inp.value='동균2';
    inp.dispatchEvent(new Event('change',{bubbles:true})); await wait(400);
  `);
  profiles = await settle('/profiles', (v) => Object.values(v ?? {}).some((p) => p.name === '동균2'));
  ok('닉네임 변경이 서버에 들어간다',
     Object.values(profiles ?? {}).some((p) => p.name === '동균2'),
     JSON.stringify(Object.values(profiles ?? {}).map((p) => p.name)));

  console.log('--- 짐 설정 ---');
  await run(`
    tap(q('.tab',3)); await wait(600);
    const lb = await until(()=>q('.graderow__label'),'등급 이름');
    lb.value='흰색2'; lb.dispatchEvent(new Event('change',{bubbles:true})); await wait(400);
  `);
  let gyms = await settle('/gyms', (v) => JSON.stringify(v ?? {}).includes('흰색2'));
  ok('난이도 이름 변경이 서버에 들어간다', JSON.stringify(gyms ?? {}).includes('흰색2'));

  await run(`tap(await until(()=>q('.swatch'),'색 팔레트')); await wait(500);`);
  gyms = await settle('/gyms', (v) => {
    const g = Object.values(v ?? {})[0];
    return g && g.grades.length > 11;
  });
  ok('색 추가가 서버에 들어간다',
     (Object.values(gyms ?? {})[0]?.grades?.length ?? 0) > 11,
     `등급 ${Object.values(gyms ?? {})[0]?.grades?.length}개`);

  /*
   * 기록이 있는 색은 지워지지 않고 은퇴한다. 그 색으로 센 완등이 있어서,
   * 지우면 지난 점수를 다시 셀 수 없기 때문이다. 목록에서만 빠지고 남는다.
   * 그러니 '사라졌는가' 가 아니라 '은퇴 표시가 서버에 갔는가' 로 판정한다.
   */
  await run(`
    const ops = q('.graderow').querySelectorAll('.iconbtn');
    tap(ops[ops.length-1]); await wait(500);
    const yes = byText('.modal .btn','빼기'); if (yes) { tap(yes); await wait(500); }
  `);
  const retiredOf = (v) => (Object.values(v ?? {})[0]?.grades ?? []).filter((g) => g.retired);
  gyms = await settle('/gyms', (v) => retiredOf(v).length > 0);
  ok('색 빼기(은퇴)가 서버에 들어간다', retiredOf(gyms).length === 1,
     `은퇴 ${retiredOf(gyms).length}개`);
  const shownAfter = await page.count('.graderow');
  ok('은퇴한 색은 설정 목록에서 빠진다', shownAfter > 0, `줄 ${shownAfter}개`);

  console.log('--- 점수표 ---');
  await run(`
    tap(await until(()=>byText('.btn','점수표'),'점수표 버튼')); await wait(700);
    const d = await until(()=>q('.dial .field'),'기준 점수 칸');
    d.value='20'; d.dispatchEvent(new Event('change',{bubbles:true})); await wait(500);
  `);
  gyms = await settle('/gyms', (v) => Object.values(v ?? {})[0]?.scoreTable?.baseScore === 20);
  ok('점수표 배율 변경이 서버에 들어간다',
     Object.values(gyms ?? {})[0]?.scoreTable?.baseScore === 20,
     `baseScore ${Object.values(gyms ?? {})[0]?.scoreTable?.baseScore}`);

  console.log('--- 세션 편집 ---');
  await run(`
    tap(q('.tab',1)); await wait(700);
    const row = await until(()=>q('.sessionrow'),'세션 줄'); row.click(); await wait(700);
    const f = await until(()=>q('.editrow .field'),'개수 칸');
    f.value='9'; f.dispatchEvent(new Event('change',{bubbles:true})); await wait(200);
    tap(byText('.modal .btn','저장')); await wait(600);
  `);
  sessions = await settle('/sessions', (v) => JSON.stringify(v ?? {}).includes('9'));
  ok('세션 편집 저장이 서버에 들어간다', countOf(sessions) >= 9, `서버 합계 ${countOf(sessions)}`);

  console.log('--- 사람 지우기 ---');
  await run(`
    tap(q('.tab',2)); await wait(600);
    const ops=[...document.querySelectorAll('.prow__ops .iconbtn')];
    tap(ops[ops.length-1]); await wait(500);
    tap(byText('.modal .btn','지우기')); await wait(700);
  `);
  profiles = await settle('/profiles', (v) => Object.keys(v ?? {}).length === 1);
  ok('사람 삭제가 서버에 반영된다', Object.keys(profiles ?? {}).length === 1,
     `서버 ${Object.keys(profiles ?? {}).length}명`);
  sessions = await server('/sessions');
  const ghost = Object.values(sessions ?? {}).filter((s) => !(profiles ?? {})[s.profileId]);
  ok('지운 사람의 세션도 서버에서 사라진다', ghost.length === 0, `고아 세션 ${ghost.length}개`);

  const errs = page.takeErrors();
  ok('페이지 오류 없음', errs.page.length === 0, errs.page.join(' | ').slice(0, 200));
} catch (e) {
  fails.push(e.message);
  console.log('  실패:', e.message);
}

await page.close();
bye();
console.log(fails.length ? `\n${pass}개 통과, ${fails.length}개 실패\n  - ${fails.join('\n  - ')}`
                         : `\n전부 통과 (${pass}개)`);
process.exit(fails.length ? 1 : 0);
