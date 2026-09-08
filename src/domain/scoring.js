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
  /*
   * 쉬운 문제 한꺼번에 눕히기.
   *
   * 내 레벨보다 floorFrom 단계 아래부터는 전부 floorScore 점이다. 공식만으로는
   * 3, 2, 1 처럼 조금씩 줄어들 뿐이라, "이 정도는 이제 세지 말자" 를 만들려면
   * 칸을 수십 번 눌러야 했다. 레벨 16줄 × 난이도 11칸이다.
   *
   * 레벨을 기준으로 한 상대 규칙이라 줄마다 손댈 필요가 없다. 이 앱의 점수가
   * 처음부터 내 레벨과의 차이로 정해지는 것과 같은 축이다.
   *
   * 눕힌 점수는 0 을 기본으로 한다.
   *
   * 1점씩이라도 주면 쉬운 문제를 잔뜩 깨서 어려운 완등 하나를 따라잡을 수 있다.
   * 기준 10점이면 쉬운 것 10개가 기준 난이도 하나와 같아진다. 그러면 '쉬운 건
   * 안 센다' 는 뜻이 무너지고, 앵벌이가 이기는 판이 된다.
   * 개수는 그대로 남으니 몇 개 깼는지는 여전히 보인다.
   *
   * null 이면 끈 것이다.
   */
  floorFrom: null,
  floorScore: 0,
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
  // 0 단계 아래면 내 레벨까지 눕는다. 1 단계부터 받는다.
  floorFrom: { min: 1, max: 15 },
  // 여기서는 0 을 받는다. 공식 쪽은 여전히 최소 1점이다(tidy).
  floorScore: { min: 0, max: 10000 },
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
    // null 은 '끔' 이라 숫자로 가두면 안 된다
    floorFrom: Number.isFinite(t.floorFrom)
      ? fit(t.floorFrom, LIMITS.floorFrom, LIMITS.floorFrom.min) : null,
    floorScore: fit(t.floorScore, LIMITS.floorScore, DEFAULT_SCORE_TABLE.floorScore),
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
  /*
   * 쉬운 쪽을 한꺼번에 눕힌다. 칸을 직접 고친 것(overrides)보다는 뒤,
   * 공식보다는 앞이다 — 규칙이지만 손으로 짚은 값이 더 구체적이다.
   */
  const below = level - grade.order;
  // 눕힌 칸은 tidy 를 태우지 않는다. 0 은 0 이어야 한다.
  if (t.floorFrom != null && below >= t.floorFrom) return t.floorScore;

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
/**
 * 세션 하나의 총점.
 *
 * 점수표는 스냅샷이 아니라 **지금 짐의 표**로 센다. 점수표는 기록이 아니라
 * 규칙이기 때문이다. 규칙을 고치면 그 규칙으로 센 값이 전부 다시 나와야 한다.
 *
 * 예전에는 세션마다 표를 박아 뒀다. 그래서 기준 점수를 고치면 칸에는 새 값이
 * 적히는데 합계는 옛 값 그대로였고, 한 번 누르면 적힌 것과 다른 만큼 올랐다.
 * 오늘 것만 갱신해 봤지만 그것도 반쪽이다 — 어제 기록을 열면 또 어긋난다.
 *
 * 레벨은 다르다. 그날의 실력은 규칙이 아니라 사실이라 세션에 남긴다
 * (levelAtTime, 세션 편집에서 직접 고칠 수 있다).
 */
export function sessionScore(session, grades, table) {
  const byId = new Map(grades.map((g) => [g.id, g]));
  let total = 0;
  for (const [gradeId, count] of Object.entries(session.counts || {})) {
    const grade = byId.get(gradeId);
    if (!grade || !count) continue;
    total += count * scoreFor(table, session.levelAtTime, grade);
  }
  return total;
}

/** 세션 하나의 총 완등 수. */
export function sessionSends(session) {
  return Object.values(session.counts || {}).reduce((a, b) => a + (b || 0), 0);
}
