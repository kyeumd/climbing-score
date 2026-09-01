/**
 * 달력 옵션 이름이 실제로 존재하는지 지킨다.
 *
 * disableDatesAfter 라고 적었더니 vanilla-calendar 가 모르는 키를 조용히
 * 버렸다. 예외도, 경고도 없었다. 그래서 미래 날짜가 그대로 눌렸고, 화면을
 * 눈으로 보기 전까지 아무도 몰랐다. 이름 오타는 여기서 잡는다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/ui/date-picker.js', import.meta.url), 'utf8');
const LIB = readFileSync(new URL('../vendor/vanilla-calendar/index.mjs', import.meta.url), 'utf8');

/** new Calendar(mount, { ... }) 의 최상위 키만 뽑는다. */
function optionKeys(src) {
  const start = src.indexOf('new Calendar(');
  assert.notEqual(start, -1, 'new Calendar( 호출을 찾지 못했습니다');
  const open = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i; break; }
  }
  assert.notEqual(end, -1, '옵션 객체가 닫히지 않았습니다');
  const body = src.slice(open + 1, end);

  // 중첩 객체/함수 본문을 걷어내고 1단계 키만 남긴다
  const keys = [];
  let d = 0;
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (d === 0) {
      const m = t.match(/^([A-Za-z_$][\w$]*)\s*[:(]/);
      if (m) keys.push(m[1]);
    }
    d += (line.match(/[{[(]/g) ?? []).length - (line.match(/[}\])]/g) ?? []).length;
  }
  return keys;
}

test('달력에 넘기는 옵션 이름이 라이브러리에 모두 있다', () => {
  const keys = optionKeys(SRC);
  assert.ok(keys.length >= 5, `옵션을 못 뽑았습니다: ${JSON.stringify(keys)}`);
  const missing = keys.filter((k) => !LIB.includes(k));
  assert.deepEqual(missing, [], `라이브러리에 없는 옵션: ${missing.join(', ')}`);
});

test('오늘 이후는 고를 수 없도록 상한을 건다', () => {
  assert.match(SRC, /dateMax:\s*localDate\(\)/,
    '미래 날짜를 막는 dateMax 가 없습니다. 옵션 이름이 바뀌지 않았는지 확인하세요.');
});
