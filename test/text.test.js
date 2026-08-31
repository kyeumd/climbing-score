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
