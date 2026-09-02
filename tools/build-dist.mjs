/**
 * 배포용 폴더를 만든다.
 *
 * 이 앱은 빌드가 필요 없다. 번들러도, 트랜스파일도 없다. 그런데 저장소를
 * 통째로 올리면 브라우저가 쓰지도 않는 것들이 같이 공개 주소로 서빙된다 —
 * 검사 도구 20여 개, 테스트, 설계 문서, 그리고 남의 API 를 긁는 스크래퍼까지.
 * 열리는 페이지도 있다(tools/e2e-record.html, tools/demo.html).
 *
 * 그래서 하는 일은 복사뿐이다. 브라우저가 실제로 받아 가는 것만 옮긴다.
 *
 *   node tools/build-dist.mjs
 */
import { cp, rm, mkdir, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');

/* index.html 이 참조하는 것 + 앱이 런타임에 fetch 하는 것. 그게 전부다.
   sw.js 는 예전에 등록된 서비스워커를 해제하려고 남긴 파일이라 함께 올린다. */
const SHIP = ['index.html', 'sw.js', 'src', 'vendor', 'data'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const name of SHIP) {
  await cp(join(ROOT, name), join(OUT, name), { recursive: true });
}

/* 무엇을 얼마나 담았는지 적는다. 조용히 복사만 하면 빠진 걸 알 수 없다. */
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push({ p, size: (await stat(p)).size });
  }
  return out;
}
const files = await walk(OUT);
const total = files.reduce((a, f) => a + f.size, 0);
console.log(`dist/ — 파일 ${files.length}개, ${(total / 1024).toFixed(0)}KB`);
for (const name of SHIP) {
  const n = files.filter((f) => f.p.startsWith(join(OUT, name))).length;
  console.log(`  ${name.padEnd(12)} ${n}개`);
}

/* index.html 이 부르는 경로가 실제로 담겼는지 확인한다. 복사 목록에서 하나만
   빠져도 배포된 사이트는 흰 화면이 되는데, 그건 올린 뒤에나 안다. */
const { readFile } = await import('node:fs/promises');
const html = await readFile(join(OUT, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
const missing = [];
for (const r of [...refs, './data/gyms.seed.json']) {
  try { await stat(join(OUT, r)); } catch { missing.push(r); }
}
if (missing.length) {
  console.error(`\n빠진 파일: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`\nindex.html 이 부르는 ${refs.length + 1}개 경로 모두 확인`);
