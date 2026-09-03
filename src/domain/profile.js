/**
 * 프로필.
 *
 * 숙련도는 사람에게 붙는 값이지 짐에 붙는 값이 아니다. 짐을 옮긴다고
 * 실력이 달라지지 않으므로 레벨은 프로필당 하나만 둔다.
 * (짐마다 난이도 단계 수가 달라도, 사용자는 그걸 감안해 자기 수준을 하나로 말한다.)
 */
import { uid } from './ids.js';

export const MAX_LEVEL = 15;

export function createProfile({ name, handle = '', level = 0, primaryGymId = null }) {
  return {
    id: uid('pf'),
    handle: normalizeHandle(handle),
    name,
    level: clampLevel(level),
    primaryGymId,
    createdAt: new Date().toISOString(),
  };
}

/** 아이디로 쓸 수 있는 꼴로 다듬는다. 공백은 못 쓴다 — 눈으로 구분이 안 된다. */
export function normalizeHandle(v) {
  return String(v ?? '').trim().replace(/\s+/g, '').slice(0, 16);
}

/**
 * 사람에게 보여 줄 ID.
 *
 * 만들 때 직접 적고, 그 뒤로는 못 바꾼다. 닉네임은 바뀌어도 이 값은 그대로라
 * 같은 이름이 둘일 때 이걸로 가른다.
 *
 * 예전 프로필에는 이 값이 없다. 그때는 uid 에서 뽑아 쓴다 — 없다고 빈칸으로
 * 두면 이미 만들어 둔 사람들만 식별자가 사라진다.
 */
export function shortId(profile) {
  if (profile?.handle) return `@${profile.handle}`;
  const raw = String(profile?.id ?? '').replace(/^pf[_-]?/, '');
  return `#${raw.slice(-4).toUpperCase().padStart(4, '0')}`;
}

/** 이미 쓰고 있는 아이디인가. 대소문자는 구분하지 않는다. */
export function handleTaken(profiles, handle) {
  const v = normalizeHandle(handle).toLowerCase();
  if (!v) return false;
  return profiles.some((p) => (p.handle ?? '').toLowerCase() === v);
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
