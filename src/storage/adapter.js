/**
 * 저장 계약 (설계서 6절).
 *
 * UI는 이 인터페이스만 안다. 나중에 서버를 붙일 때 api.js를 추가하고
 * app.js에서 어댑터 한 줄만 갈아끼우면 나머지 코드는 그대로다.
 *
 *   loadAll()        → { profiles, gyms, sessions, meta }
 *   saveProfile(p)   upsert
 *   saveGym(g)       upsert
 *   saveSession(s)   upsert
 *   deleteSession(id)
 *   deleteProfile(id)
 *   exportJSON()     → 문자열
 *   importJSON(text) → 검증 후 전체 교체
 */

export const SCHEMA_VERSION = 1;

export function emptyState() {
  return { profiles: [], gyms: [], sessions: [], meta: { version: SCHEMA_VERSION, seeded: false } };
}

/** 가져오기 전 검증. 남의 JSON을 그대로 믿고 덮어쓰면 기록이 통째로 날아간다. */
export function validateState(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['JSON 형식이 아닙니다.'];
  for (const key of ['profiles', 'gyms', 'sessions']) {
    if (!Array.isArray(data[key])) errors.push(`${key}가 배열이 아닙니다.`);
  }
  if (errors.length) return errors;

  const gymIds = new Set(data.gyms.map((g) => g?.id));
  const profileIds = new Set(data.profiles.map((p) => p?.id));
  for (const g of data.gyms) {
    if (!g?.id || !g?.name) errors.push('id 또는 이름이 없는 짐이 있습니다.');
    if (!Array.isArray(g?.grades)) errors.push(`짐 "${g?.name}"의 등급 목록이 배열이 아닙니다.`);
  }
  for (const p of data.profiles) {
    if (!p?.id || !p?.name) errors.push('id 또는 이름이 없는 프로필이 있습니다.');
  }
  for (const s of data.sessions) {
    if (!s?.id) { errors.push('id 없는 세션이 있습니다.'); continue; }
    if (!gymIds.has(s.gymId)) errors.push(`세션 ${s.id}가 없는 짐을 가리킵니다.`);
    if (!profileIds.has(s.profileId)) errors.push(`세션 ${s.id}가 없는 프로필을 가리킵니다.`);
    if (typeof s.levelAtTime !== 'number') errors.push(`세션 ${s.id}에 기록 시점 레벨이 없습니다.`);
  }
  return errors;
}
