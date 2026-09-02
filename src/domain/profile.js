/**
 * 프로필.
 *
 * 숙련도는 사람에게 붙는 값이지 짐에 붙는 값이 아니다. 짐을 옮긴다고
 * 실력이 달라지지 않으므로 레벨은 프로필당 하나만 둔다.
 * (짐마다 난이도 단계 수가 달라도, 사용자는 그걸 감안해 자기 수준을 하나로 말한다.)
 */
import { uid } from './ids.js';

export const MAX_LEVEL = 15;

export function createProfile({ name, level = 0, primaryGymId = null }) {
  return {
    id: uid('pf'),
    name,
    level: clampLevel(level),
    primaryGymId,
    createdAt: new Date().toISOString(),
  };
}

export function clampLevel(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_LEVEL, Math.max(0, n));
}

/** 이름만 바꾼다. 빈 이름은 받지 않는다 — 목록에서 누구인지 알 수 없게 된다. */
export function rename(profile, name) {
  const next = String(name ?? '').trim();
  return next ? { ...profile, name: next } : profile;
}

export function setLevel(profile, level) {
  return { ...profile, level: clampLevel(level) };
}

/**
 * 예전 데이터는 레벨을 짐별 맵(levels)으로 갖고 있었다.
 * 가장 높은 값을 그 사람의 레벨로 삼아 옮긴다.
 */
export function migrateProfile(profile) {
  if (typeof profile.level === 'number') return profile;
  const values = Object.values(profile.levels ?? {}).filter((v) => typeof v === 'number');
  const { levels, ...rest } = profile;
  return { ...rest, level: clampLevel(values.length ? Math.max(...values) : 0) };
}
