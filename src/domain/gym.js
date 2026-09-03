/** 짐과 난이도 등급의 생성·수정 규칙. */
import { uid, slugId } from './ids.js';
import { DEFAULT_SCORE_TABLE } from './scoring.js';

export function createGym({ name, gu = '', grades = [], gradesSource = null, isCustom = true, kinds = null }) {
  return {
    id: isCustom ? uid('gym') : slugId('gym', name),
    name,
    gu,
    grades: grades.map((g, i) => createGrade({ ...g, order: g.order ?? i })),
    scoreTable: { ...DEFAULT_SCORE_TABLE, overrides: {} },
    favorite: false,
    archived: false,
    // 수집한 색 체계는 전부 미검증 초기값이다 (설계서 3.4절).
    gradesVerified: false,
    gradesSource,
    isCustom,
    // 색 등급을 안 쓰는 암장의 실제 종목 (지구력·리드 등). 없으면 null
    kinds: kinds?.length ? kinds : null,
  };
}

export function createGrade({ label, color = '#8A8F98', order = 0 }) {
  return { id: uid('gr'), label, color, order, retired: false };
}

/** 신규 기록에 쓸 수 있는 등급만. 순서대로. */
export function activeGrades(gym) {
  return (gym?.grades ?? [])
    .filter((g) => !g.retired)
    .sort((a, b) => a.order - b.order);
}

/** 과거 기록 조회용 — retired 포함 전부. */
export function allGrades(gym) {
  return [...(gym?.grades ?? [])].sort((a, b) => a.order - b.order);
}

/**
 * 등급은 삭제하지 않고 retire한다.
 * 암장이 세팅을 바꿔 색이 없어져도 과거 세션이 깨지지 않게 하는 핵심 규칙.
 */
/**
 * 목록에서 아주 뺀다.
 *
 * 과거 기록이 이 색의 id 를 참조하고 있으면 쓰면 안 된다 — 점수를 다시 셀 수
 * 없게 된다. 부르는 쪽(app.js)이 기록 여부를 보고 이것과 retireGrade 중
 * 하나를 고른다.
 */
export function removeGrade(gym, gradeId) {
  return {
    ...gym,
    grades: gym.grades.filter((g) => g.id !== gradeId)
      .map((g, i) => ({ ...g, order: i })),
  };
}

export function retireGrade(gym, gradeId) {
  return {
    ...gym,
    grades: gym.grades.map((g) => (g.id === gradeId ? { ...g, retired: true } : g)),
  };
}

export function restoreGrade(gym, gradeId) {
  return {
    ...gym,
    grades: gym.grades.map((g) => (g.id === gradeId ? { ...g, retired: false } : g)),
  };
}

/**
 * 같은 색을 또 넣으면 "빨강, 빨강"이 되어 벽에서 구분할 수 없다.
 * 막지는 않되(연빨강/진빨강처럼 실제로 두 개인 짐이 있다) 이름에 번호를 붙여 구분한다.
 */
export function addGrade(gym, { label, color }) {
  const maxOrder = gym.grades.reduce((m, g) => Math.max(m, g.order), -1);
  const same = gym.grades.filter((g) => g.label === label || g.label.startsWith(`${label} `));
  const finalLabel = same.length ? `${label} ${same.length + 1}` : label;
  return {
    ...gym,
    grades: [...gym.grades, createGrade({ label: finalLabel, color, order: maxOrder + 1 })],
  };
}

export function updateGrade(gym, gradeId, patch) {
  return {
    ...gym,
    grades: gym.grades.map((g) => (g.id === gradeId ? { ...g, ...patch } : g)),
  };
}

/** 등급 순서 교환. order 값을 서로 바꿔 안정적으로 유지한다. */
export function moveGrade(gym, gradeId, direction) {
  const sorted = allGrades(gym);
  const i = sorted.findIndex((g) => g.id === gradeId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= sorted.length) return gym;
  const a = sorted[i], b = sorted[j];
  return {
    ...gym,
    grades: gym.grades.map((g) => {
      if (g.id === a.id) return { ...g, order: b.order };
      if (g.id === b.id) return { ...g, order: a.order };
      return g;
    }),
  };
}

export function toggleFavorite(gym) {
  return { ...gym, favorite: !gym.favorite };
}

/** 사용자가 색 체계를 확인했다는 표시. 확인 배너가 사라진다. */
export function markVerified(gym) {
  return { ...gym, gradesVerified: true };
}

/** 즐겨찾기 우선, 그다음 이름순. 짐 선택기의 기본 정렬. */
export function sortGyms(gyms) {
  return [...gyms].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

/** 구 칩 목록. 짐이 많은 구부터 (설계서 7.2절). */
export function guChips(gyms) {
  const counts = new Map();
  for (const g of gyms) {
    if (g.archived || !g.gu) continue;
    counts.set(g.gu, (counts.get(g.gu) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([gu, count]) => ({ gu, count }));
}
