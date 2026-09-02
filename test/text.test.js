import { test } from 'node:test';
import assert from 'node:assert/strict';
import { josa, levelLabel } from '../src/domain/text.js';

test('받침이 있으면 앞쪽 조사를 쓴다', () => {
  assert.equal(josa('동균', '이/가'), '이');
  assert.equal(josa('민서', '이/가'), '가');
  assert.equal(josa('더클라임 강남점', '은/는'), '은');
  assert.equal(josa('강서클라이밍센터', '은/는'), '는');
  assert.equal(josa('동균', '과/와'), '과');
  assert.equal(josa('지수', '과/와'), '와');
});

test('한글이 아니면 받침 없는 쪽을 쓴다', () => {
  assert.equal(josa('Kim', '이/가'), '가');
  assert.equal(josa('', '은/는'), '는');
  assert.equal(josa(undefined, '을/를'), '를');
});

test('숙련도 표기는 한 곳에서 정한다', () => {
  assert.equal(levelLabel(0), 'Lv.0');
  assert.equal(levelLabel(15), 'Lv.15');
});

/*
 * 한글 조합 중 엔터를 걸러 내는지 지킨다.
 *
 * IME 는 마지막 글자를 조합하는 동안 keydown 을 isComposing: true 로 보낸다.
 * 그 엔터를 그냥 처리하면 덜 만들어진 값으로 저장되고, 브라우저가 뒤이어
 * 확정한 마지막 글자는 새 입력으로 떨어져 항목이 하나 더 생긴다.
 * 브라우저 검사로 잡기 번거로우니 규칙을 여기서 지킨다.
 */
test('엔터를 받는 곳은 모두 조합 중을 걸러 낸다', async () => {
  const { readFileSync } = await import('node:fs');
  /* 주석을 먼저 걷어낸다. 설명 문장에 isComposing 이라는 낱말이 들어 있어서,
     정작 코드를 지워도 통과하는 헛된 테스트가 됐던 적이 있다. */
  const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  for (const f of ['../src/app.js', '../src/ui/view-match.js']) {
    const lines = strip(readFileSync(new URL(f, import.meta.url), 'utf8')).split('\n');
    let checked = 0;
    lines.forEach((line, i) => {
      if (!/\bkey\s*[!=]==\s*'Enter'/.test(line)) return;
      checked += 1;
      // 같은 핸들러 안(뒤 8줄)에 조합 검사가 있어야 한다
      assert.match(lines.slice(i, i + 8).join('\n'), /isComposing/,
        `${f}:${i + 1} 엔터를 받는데 isComposing 검사가 없습니다`);
    });
    assert.ok(checked > 0, `${f} 에서 엔터 처리 구문을 못 찾았습니다`);
  }
});
