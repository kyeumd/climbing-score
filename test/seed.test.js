import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEED_VERSION } from '../src/storage/seed.js';

const seed = JSON.parse(readFileSync('data/gyms.seed.json', 'utf8'));
const gyms = seed.gyms;

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

/**
 * 문서에 적힌 짐 개수가 시드와 어긋나지 않게 한다.
 *
 * README 는 113곳/14곳/98곳이라고 적고 있었지만 시드는 112곳/12곳/100곳이었다.
 * 셋 다 틀렸고, 아무도 몰랐다. 숫자는 세는 쪽에서 확인한다.
 */
test('README·STATUS 의 짐 개수가 시드와 같다', () => {
  const total = gyms.length;
  const graded = gyms.filter((g) => g.grades?.length).length;
  const plain = total - graded;

  const docs = {
    'README.md': readFileSync(new URL('../README.md', import.meta.url), 'utf8'),
    'STATUS.md': readFileSync(new URL('../STATUS.md', import.meta.url), 'utf8'),
  };
  for (const [name, text] of Object.entries(docs)) {
    // "서울 ... N곳" 꼴로 적힌 총계는 전부 시드와 같아야 한다
    for (const m of text.matchAll(/서울[^\n]*?(\d{2,4})곳/g)) {
      assert.equal(Number(m[1]), total,
        `${name}: "${m[0]}" — 시드는 ${total}곳입니다`);
    }
  }
  assert.match(docs['README.md'], new RegExp(`${plain}곳은 지구력·리드 중심`),
    `README 의 색 등급 미사용 개수가 ${plain}곳과 다릅니다`);
  assert.match(docs['README.md'], new RegExp(`${graded}곳은 색 체계가`),
    `README 의 색 체계 보유 개수가 ${graded}곳과 다릅니다`);
  assert.match(docs['STATUS.md'], new RegExp(`난이도 색 체계 ${graded}곳`),
    `STATUS 의 색 체계 보유 개수가 ${graded}곳과 다릅니다`);
});
