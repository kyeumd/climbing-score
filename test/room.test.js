/** 방 코드. 이 값이 곧 비밀번호라 길이와 무작위성이 곧 보안이다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoomCode, normalizeRoomCode, isValidRoomCode, formatRoomCode, ROOM_LENGTH,
} from '../src/domain/room.js';

test('코드는 정해진 길이로 나온다', () => {
  /*
   * 짧게 만들지 않는다. 데이터베이스 주소는 배포된 파일에 들어 있어 누구나
   * 읽을 수 있고 서버에는 출처 검사가 없다. 이 코드가 유일한 자물쇠다.
   * 부르기 어려운 것은 문제가 되지 않는다 — 친구에게는 링크로 넘긴다.
   */
  for (let i = 0; i < 50; i++) {
    assert.equal(createRoomCode().length, ROOM_LENGTH);
  }
});

test('헷갈리는 글자는 코드에 없다', () => {
  // 0/O, 1/I/L 은 받아 적을 때 반드시 틀린다
  const many = Array.from({ length: 300 }, () => createRoomCode()).join('');
  assert.doesNotMatch(many, /[01ILOU]/);
});

test('코드가 겹치지 않는다', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(createRoomCode());
  assert.equal(seen.size, 5000);
});

test('보여 준 꼴을 그대로 받아 적어도 같은 코드다', () => {
  const code = createRoomCode();
  assert.equal(normalizeRoomCode(formatRoomCode(code)), code);
});

test('소문자와 공백을 흘려도 읽는다', () => {
  const code = createRoomCode();
  const messy = ` ${formatRoomCode(code).toLowerCase()} `;
  assert.equal(normalizeRoomCode(messy), code);
});

test('짧은 코드는 받지 않는다', () => {
  assert.equal(isValidRoomCode(''), false);
  assert.equal(isValidRoomCode('SNACK'), false, '짧으면 자물쇠가 없는 것과 같다');
  assert.equal(isValidRoomCode('A'.repeat(ROOM_LENGTH - 1)), false);
  assert.equal(isValidRoomCode('A'.repeat(ROOM_LENGTH)), true);
  assert.equal(isValidRoomCode(null), false);
  assert.equal(isValidRoomCode(createRoomCode()), true);
});

test('알파벳에 없는 글자는 비슷한 글자로 고쳐 주지 않고 버린다', () => {
  // 고쳐 주는 척하면 엉뚱한 방으로 보내게 된다
  assert.equal(normalizeRoomCode('OOOO-IIII-LLLL-0000'), '');
});

test('방 코드는 앱 데이터와 다른 열쇠에 산다', async () => {
  // 같은 열쇠에 넣으면 내보내기 JSON 에 비밀번호가 섞여 나간다
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const storage = readFileSync(new URL('../src/storage/local-storage.js', import.meta.url), 'utf8');
  const appKey = app.match(/ROOM_KEY\s*=\s*'([^']+)'/)?.[1];
  const dataKey = storage.match(/KEY\s*=\s*'([^']+)'/)?.[1];
  assert.ok(appKey, '방 코드 열쇠를 찾지 못했습니다');
  assert.ok(dataKey, '데이터 열쇠를 찾지 못했습니다');
  assert.notEqual(appKey, dataKey);
});
