/**
 * 점수 산정 — 순수 함수. DOM도 저장소도 모른다.
 *
 * 점수는 "내 숙련도 레벨(L)"과 "문제 난이도 단계(d)"의 차이로 결정된다.
 *   diff >= 0  →  baseScore × upFactor^diff        (내 레벨보다 어려운 문제)
 *   diff <  0  →  baseScore × downFactor^(-diff)   (내 레벨보다 쉬운 문제)
 *
 * 대각선(d === L)은 항상 baseScore가 되므로, 색 체계가 다른 짐끼리도
 * 점수 스케일이 맞는다.
 */

export const DEFAULT_SCORE_TABLE = Object.freeze({
  mode: 'formula',
  // 기준을 100으로 두면 1.5배를 곱한 값이 338, 506, 1139 처럼 읽기 어려워진다.
  // 10으로 낮추고 유효숫자 두 자리로 다듬으면 10, 15, 23, 34, 51 로 읽힌다.
  baseScore: 10,
  upFactor: 1.5,
  downFactor: 0.5,
  overrides: {},
});

/**
 * 배율에는 의미 있는 범위가 있다.
 *   upFactor < 1 이면 어려운 문제가 오히려 낮은 점수가 된다
 *   downFactor > 1 이면 쉬운 문제가 더 높은 점수가 된다
 *   둘 중 하나가 0이면 모든 칸이 최소값 1점으로 뭉개진다
 * 입력 단계에서 막고, 계산 단계에서도 한 번 더 가둔다.
 */
export const LIMITS = Object.freeze({
  baseScore: { min: 1, max: 10000 },
  upFactor: { min: 1, max: 5 },
  downFactor: { min: 0.05, max: 1 },
});

export function clampTable(table) {
  const t = { ...DEFAULT_SCORE_TABLE, ...table };
  const fit = (v, { min, max }, fallback) =>
    (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  return {
    ...t,
    baseScore: fit(t.baseScore, LIMITS.baseScore, DEFAULT_SCORE_TABLE.baseScore),
    upFactor: fit(t.upFactor, LIMITS.upFactor, DEFAULT_SCORE_TABLE.upFactor),
    downFactor: fit(t.downFactor, LIMITS.downFactor, DEFAULT_SCORE_TABLE.downFactor),
  };
}

/** overrides 맵의 키. 레벨과 등급 조합 하나를 가리킨다. */
export function overrideKey(level, gradeId) {
  return `L${level}:${gradeId}`;
}

/**
 * 등급 하나의 단가 점수.
 * 수동 수정된 칸(overrides)이 있으면 공식보다 우선한다.
 */
export function scoreFor(table, level, grade) {
  const t = clampTable(table);
  const key = overrideKey(level, grade.id);
  if (t.overrides && Object.prototype.hasOwnProperty.call(t.overrides, key)) {
    return t.overrides[key];
  }
  const diff = grade.order - level;
  const factor = diff >= 0
    ? Math.pow(t.upFactor, diff)
    : Math.pow(t.downFactor, -diff);
  // 완등을 0점으로 치면 기록한 보람이 사라지므로 최소 1점을 보장한다.
  return tidy(t.baseScore * factor);
}

/**
 * 사람이 읽기 쉬운 숫자로 다듬는다.
 * 337.5 -> 340, 1139.06 -> 1100 처럼 유효숫자 두 자리만 남긴다.
 * 두 자리 이하는 그대로 두어 낮은 난이도의 차이가 사라지지 않게 한다.
 */
export function tidy(v) {
  if (!Number.isFinite(v)) return 1;
  const n = Math.abs(v);
  if (n < 100) return Math.max(1, Math.round(v));
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.max(1, Math.round(v / mag) * mag);
}

/** 공식으로 계산한 값 — overrides를 무시한다. 표에서 "수정됨" 표시에 쓴다. */
export function formulaScore(table, level, grade) {
  return scoreFor({ ...table, overrides: {} }, level, grade);
}

/** 레벨 수. 그 짐의 난이도 단계 수와 같다(색이 8개면 LV0~LV7). */
export function levelCount(grades) {
  return Math.max(1, grades.length);
}

/** 레벨 × 등급 격자. 점수표 편집 화면이 그대로 렌더링한다. */
export function buildMatrix(table, grades) {
  const sorted = [...grades].sort((a, b) => a.order - b.order);
  const rows = [];
  for (let level = 0; level < levelCount(sorted); level++) {
    rows.push({
      level,
      cells: sorted.map((grade) => ({
        grade,
        score: scoreFor(table, level, grade),
        overridden: scoreFor(table, level, grade) !== formulaScore(table, level, grade),
      })),
    });
  }
  return rows;
}

/** 세션 하나의 총점. 기록 시점 레벨(levelAtTime)로 계산해 과거 점수를 보존한다. */
export function sessionScore(session, grades) {
  const byId = new Map(grades.map((g) => [g.id, g]));
  let total = 0;
  for (const [gradeId, count] of Object.entries(session.counts || {})) {
    const grade = byId.get(gradeId);
    if (!grade || !count) continue;
    total += count * scoreFor(session.scoreTable, session.levelAtTime, grade);
  }
  return total;
}

/** 세션 하나의 총 완등 수. */
export function sessionSends(session) {
  return Object.values(session.counts || {}).reduce((a, b) => a + (b || 0), 0);
}
