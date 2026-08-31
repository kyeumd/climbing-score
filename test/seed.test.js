import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEED_VERSION } from '../src/storage/seed.js';

const seed = JSON.parse(readFileSync('data/gyms.seed.json', 'utf8'));

/*
 * 수집기가 배열만 쓰고 있었다. 로더는 배열을 version 1 로 읽으므로, 저장된
 * seedVersion 보다 낮아 목록을 늘려도 사용자 화면은 그대로였다. 조용히 어긋난다.
 */
test('시드 파일은 버전을 달고 나온다', () => {
  assert.ok(!Array.isArray(seed), '배열이 아니라 { version, gyms } 여야 한다');
  assert.equal(seed.version, SEED_VERSION);
});

test('모든 짐에 이름과 자치구가 있다', () => {
  assert.ok(seed.gyms.length > 100, `${seed.gyms.length}곳`);
  for (const g of seed.gyms) {
    assert.ok(g.name?.trim(), JSON.stringify(g));
    assert.match(g.gu ?? '', /구$/, g.name);
  }
});

test('같은 이름이 두 번 들어가지 않는다', () => {
  const seen = new Set();
  for (const g of seed.gyms) {
    assert.ok(!seen.has(g.name), `중복: ${g.name}`);
    seen.add(g.name);
  }
});
