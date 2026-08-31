/**
 * 페이지 E2E 두 개를 헤드리스로 돌리고 결과를 표준출력으로 낸다.
 *
 * 예전에는 브라우저로 직접 열어 보는 수밖에 없었다. 그래서 아무도 안 열었고,
 * .gcard / .board__row 처럼 몇 번의 UI 개편 전에 사라진 클래스를 붙들고
 * 조용히 실패한 채로 남아 있었다. 자동으로 돌려야 썩지 않는다.
 *
 *   node tools/e2e.mjs
 */
import { launch, sleep } from './cdp.mjs';
import { ensureServer } from './seed.mjs';

const PAGES = ['e2e-record.html', 'e2e-editor.html'];
let failed = 0;

await ensureServer();

for (const page of PAGES) {
  const p = await (await launch({ width: 414, height: 896, dark: true })).connect();
  try {
    await p.goto(`http://localhost:8099/tools/${page}`, { wait: 1200 });
    // 마지막 단정까지 끝나기를 기다린다. 고정 대기는 길게 누르기(600ms)에서 아슬아슬하다.
    let out = '';
    for (let i = 0; i < 60; i++) {
      const done = await p.eval(() => ({
        done: document.body?.dataset?.done === '1',
        log: document.getElementById('log')?.textContent ?? '',
      }));
      out = done.log;
      if (done.done || (out && i > 10)) break;
      await sleep(200);
    }
    const lines = out.split('\n').filter(Boolean);
    const bad = lines.filter((l) => l.startsWith('FAIL'));
    failed += bad.length;
    console.log(`--- ${page} — ${lines.length - bad.length}/${lines.length} 통과 ---`);
    for (const l of bad) console.log('  ', l);
    if (!lines.length) { failed++; console.log('   결과가 없습니다 (페이지가 죽었을 수 있음)'); }
  } catch (e) {
    failed++;
    console.log(`--- ${page} 실행 실패: ${String(e.message).slice(0, 80)}`);
  }
  await p.close();
}

console.log(failed ? `\n실패 ${failed}건` : '\n전부 통과');
process.exit(failed ? 1 : 0);
