/**
 * 이름 붙여 가져오는 것이 실제로 있는지 본다.
 *
 * 빌드 단계가 없다. 번들러가 없으니 "그런 이름은 없다" 를 아무도 말해 주지
 * 않고, 브라우저가 모듈을 받는 순간에야 터진다. 그때는 화면이 통째로 빈다.
 *
 * 실제로 그랬다. domain/room.js 의 export 이름을 바꾸고 view-profile.js 의
 * import 줄을 안 고쳤더니 앱이 아무것도 못 그렸다. 문법 검사(node --check)는
 * 파일 하나만 보므로 이걸 잡지 못한다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : []);
  });
}

/**
 * `export function a`, `export const b`, `export { c, d }` 를 모은다.
 *
 * 줄 첫머리로 못 박으면 안 된다. 압축된 vendor 파일은 긴 한 줄 끝에
 * `export{Calendar}` 로 붙어 있어서, 앵커를 걸었더니 멀쩡한 것을 없다고 했다.
 */
function exportsOf(file) {
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/(?:^|[;\s])export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/(?:^|[;\s])export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const alias = part.trim().split(/\s+as\s+/).pop().trim();
      if (alias) names.add(alias);
    }
  }
  return names;
}

test('가져오는 이름이 모두 실제로 있다', () => {
  const problems = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
      const target = resolve(dirname(file), m[2]);
      if (!existsSync(target)) { problems.push(`${file} → 없는 파일 ${m[2]}`); continue; }
      const have = exportsOf(target);
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        if (!have.has(name)) {
          problems.push(`${file.replace(SRC, 'src')} 가 ${m[2]} 의 '${name}' 를 가져오는데 그런 export 가 없습니다`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});
