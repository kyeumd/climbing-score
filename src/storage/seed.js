/**
 * 시드 적재 — 최초 1회만.
 * 사용자가 수정한 짐을 시드가 덮어쓰면 안 된다 (설계서 6절).
 */
import { createGym } from '../domain/gym.js';

export async function loadSeedGyms(url = './data/gyms.seed.json') {
  // 시드를 갱신해도 브라우저가 옛 파일을 캐시하고 있으면 반영되지 않는다.
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`시드를 불러오지 못했습니다 (${res.status})`);
  const rows = await res.json();
  return rows.map((row) => createGym({
    name: row.name,
    gu: row.gu,
    grades: (row.grades ?? []).map((g) => ({ label: g.label, color: g.color, order: g.order })),
    gradesSource: row.gradesSource ?? null,
    kinds: row.kinds ?? null,
    isCustom: false,
  }));
}
