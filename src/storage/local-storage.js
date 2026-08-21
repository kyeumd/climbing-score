/** localStorage 구현체. 브라우저 안에서만 산다. */
import { emptyState, validateState, SCHEMA_VERSION } from './adapter.js';
import { migrateProfile } from '../domain/profile.js';

const KEY = 'climbing-score/v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    const state = { ...emptyState(), ...parsed };
    // 짐별 레벨을 쓰던 예전 데이터를 단일 레벨로 옮긴다
    state.profiles = state.profiles.map(migrateProfile);
    return state;
  } catch (err) {
    console.error('저장된 데이터를 읽지 못했습니다.', err);
    return emptyState();
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    // 용량 초과가 대표적. 조용히 삼키면 사용자는 저장된 줄 안다.
    console.error('저장 실패', err);
    return { ok: false, error: err };
  }
}

function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = [...list];
  next[i] = item;
  return next;
}

export function createLocalStorageAdapter() {
  return {
    loadAll() {
      return read();
    },

    saveProfile(profile) {
      const s = read();
      return write({ ...s, profiles: upsert(s.profiles, profile) });
    },

    saveGym(gym) {
      const s = read();
      return write({ ...s, gyms: upsert(s.gyms, gym) });
    },

    saveSession(session) {
      const s = read();
      return write({ ...s, sessions: upsert(s.sessions, session) });
    },

    deleteSession(id) {
      const s = read();
      return write({ ...s, sessions: s.sessions.filter((x) => x.id !== id) });
    },

    /** 프로필을 지우면 그 프로필의 세션도 함께 사라진다. 고아 세션을 남기지 않는다. */
    deleteProfile(id) {
      const s = read();
      return write({
        ...s,
        profiles: s.profiles.filter((p) => p.id !== id),
        sessions: s.sessions.filter((x) => x.profileId !== id),
      });
    },

    replaceAll(state) {
      return write({ ...state, meta: { ...state.meta, version: SCHEMA_VERSION } });
    },

    exportJSON() {
      return JSON.stringify(read(), null, 2);
    },

    importJSON(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return { ok: false, errors: ['JSON을 해석할 수 없습니다.'] };
      }
      const errors = validateState(data);
      if (errors.length) return { ok: false, errors };
      write({ ...emptyState(), ...data, meta: { ...data.meta, version: SCHEMA_VERSION } });
      return { ok: true };
    },
  };
}
