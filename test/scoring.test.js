import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCORE_TABLE, scoreFor, buildMatrix, sessionScore, sessionSends, overrideKey,
} from '../src/domain/scoring.js';

const grades = ['1단계', '2단계', '3단계', '4단계', '5단계']
  .map((label, i) => ({ id: `g${i}`, label, order: i }));

test('대각선은 언제나 baseScore', () => {
  for (let lv = 0; lv < grades.length; lv++) {
    assert.equal(scoreFor(DEFAULT_SCORE_TABLE, lv, grades[lv]), 100);
  }
});

test('설계서 5.1절 표와 일치한다', () => {
  const expected = [
    [100, 150, 225, 338, 506],
    [50, 100, 150, 225, 338],
    [25, 50, 100, 150, 225],
    [13, 25, 50, 100, 150],
    [6, 13, 25, 50, 100],
  ];
  const actual = buildMatrix(DEFAULT_SCORE_TABLE, grades).map((r) => r.cells.map((c) => c.score));
  assert.deepEqual(actual, expected);
});

test('한 단계 어려우면 1.5배, 쉬우면 절반', () => {
  const base = scoreFor(DEFAULT_SCORE_TABLE, 2, grades[2]);
  assert.equal(scoreFor(DEFAULT_SCORE_TABLE, 2, grades[3]), Math.round(base * 1.5));
  assert.equal(scoreFor(DEFAULT_SCORE_TABLE, 2, grades[1]), Math.round(base * 0.5));
});

test('배율을 바꾸면 표 전체가 다시 계산된다', () => {
  const table = { ...DEFAULT_SCORE_TABLE, upFactor: 2 };
  assert.equal(scoreFor(table, 0, grades[3]), 800);
});

test('수동 수정한 칸이 공식보다 우선한다', () => {
  const table = { ...DEFAULT_SCORE_TABLE, overrides: { [overrideKey(0, 'g4')]: 999 } };
  assert.equal(scoreFor(table, 0, grades[4]), 999);
  assert.equal(scoreFor(table, 1, grades[4]), 338, '다른 칸은 영향받지 않는다');
  const cell = buildMatrix(table, grades)[0].cells[4];
  assert.equal(cell.overridden, true, '수정된 칸은 표시된다');
});

test('세션 점수는 기록 시점 레벨로 계산된다', () => {
  const session = { levelAtTime: 1, counts: { g1: 2, g3: 1 } };
  // LV1 기준: 2단계=100 ×2, 4단계=225 ×1
  assert.equal(sessionScore(session, grades), 425);
  assert.equal(sessionSends(session), 3);
});

test('레벨을 올려도 과거 세션 점수는 변하지 않는다', () => {
  const past = { levelAtTime: 0, counts: { g0: 3 } };
  const before = sessionScore(past, grades);
  // 프로필 레벨을 2로 올려도 세션의 levelAtTime은 그대로다
  assert.equal(sessionScore(past, grades), before);
  assert.equal(before, 300);
});

test('사라진 등급을 참조하는 카운트는 무시한다', () => {
  const session = { levelAtTime: 0, counts: { g0: 1, 'deleted-grade': 5 } };
  assert.equal(sessionScore(session, grades), 100);
});

test('빈 세션은 0점', () => {
  assert.equal(sessionScore({ levelAtTime: 0, counts: {} }, grades), 0);
  assert.equal(sessionScore({ levelAtTime: 0 }, grades), 0);
});

test('레벨 차가 커도 0점이 되지 않는다', () => {
  const wide = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, label: `${i + 1}단계`, order: i }));
  // LV9가 1단계를 깨면 100 × 0.5^9 = 0.195 → 반올림 0. 완등을 0점으로 치면 안 된다.
  assert.equal(scoreFor(DEFAULT_SCORE_TABLE, 9, wide[0]), 1);
  assert.ok(buildMatrix(DEFAULT_SCORE_TABLE, wide).every((r) => r.cells.every((c) => c.score >= 1)));
});

test('배율이 범위를 벗어나면 유효 범위로 가둔다', async () => {
  const { clampTable, LIMITS } = await import('../src/domain/scoring.js');
  // 0을 넣으면 모든 칸이 최소값으로 뭉개져 점수 체계가 무의미해진다
  assert.equal(clampTable({ upFactor: 0 }).upFactor, LIMITS.upFactor.min);
  assert.equal(clampTable({ downFactor: 0 }).downFactor, LIMITS.downFactor.min);
  assert.equal(clampTable({ upFactor: 999 }).upFactor, LIMITS.upFactor.max);
  // 쉬운 문제가 어려운 문제보다 높은 점수가 되는 일은 없어야 한다
  assert.ok(clampTable({ downFactor: 3 }).downFactor <= 1);
  assert.equal(clampTable({ baseScore: NaN }).baseScore, 100);
});

test('배율 0을 넣어도 표가 뭉개지지 않는다', async () => {
  const g = ['a','b','c','d'].map((x,i)=>({id:x,label:`${i+1}단계`,order:i}));
  const row = buildMatrix({ ...DEFAULT_SCORE_TABLE, upFactor: 0 }, g)[0].cells.map(c=>c.score);
  assert.deepEqual(row, [100, 100, 100, 100], '1로 가둬져 최소한 평평하게라도 유지된다');
});
