/**
 * 시드 적재와 갱신.
 *
 * 처음에는 "최초 1회만 적재"했다. 그런데 그러면 시드를 늘려도 이미 앱을 켠
 * 사람에게는 반영되지 않는다. 실제로 목록이 46곳에서 110곳으로 늘었는데
 * 화면은 계속 46곳이었다.
 *
 * 그래서 시드에 버전을 두고, 버전이 오르면 목록을 갱신한다. 대신 사용자가
 * 남긴 흔적(즐겨찾기, 직접 확인한 난이도, 점수표, 직접 추가한 짐)은 지킨다.
 * 세션이 gymId를 참조하므로 기존 짐의 id도 그대로 유지한다.
 */
import { createGym } from '../domain/gym.js';

export const SEED_VERSION = 4;

export async function loadSeed(url = './data/gyms.seed.json') {
  // 시드를 갱신해도 브라우저가 옛 파일을 캐시하고 있으면 반영되지 않는다.
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`시드를 불러오지 못했습니다 (${res.status})`);
  const raw = await res.json();
  const rows = Array.isArray(raw) ? raw : (raw.gyms ?? []);
  const version = Array.isArray(raw) ? 1 : (raw.version ?? 1);
  return {
    version,
    gyms: rows.map((row) => createGym({
      name: row.name,
      gu: row.gu,
      grades: (row.grades ?? []).map((g) => ({ label: g.label, color: g.color, order: g.order })),
      gradesSource: row.gradesSource ?? null,
      kinds: row.kinds ?? null,
      isCustom: false,
    })),
  };
}

/** 사용자 흔적을 지키면서 시드 목록으로 갱신한다. */
export function mergeSeed(existing, seeded) {
  const byName = new Map(existing.map((g) => [g.name, g]));
  const merged = seeded.map((fresh) => {
    const old = byName.get(fresh.name);
    if (!old) return fresh;
    return {
      ...fresh,
      id: old.id,                       // 세션이 이 id를 참조한다
      favorite: old.favorite,
      archived: old.archived ?? false,
      scoreTable: old.scoreTable ?? fresh.scoreTable,
      // 직접 확인했거나 손댄 난이도는 시드가 덮지 않는다
      grades: (old.gradesVerified || old.gradesSource === null) && old.grades.length
        ? old.grades : fresh.grades,
      gradesVerified: old.gradesVerified,
      gradesSource: old.gradesVerified ? old.gradesSource : fresh.gradesSource,
    };
  });
  // 직접 추가한 짐은 시드에 없으므로 따로 붙인다
  const custom = existing.filter((g) => g.isCustom);
  return [...merged, ...custom];
}
