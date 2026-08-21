/** 사용자 상황 재현: 옛 46곳 데이터가 남은 상태에서 새로고침하면 갱신되는가 */
import { launch, sleep } from './cdp.mjs';
const p = await (await launch({ width: 414, height: 896, dark: true })).connect();
await p.goto('http://localhost:8099/index.html', { wait: 800 });

// 옛 상태를 만든다: 짐 46곳 + 즐겨찾기 + 직접 추가한 짐 + 확인한 난이도
await p.eval(() => {
  const old = Array.from({ length: 46 }, (_, i) => ({
    id: `gym_old${i}`, name: i === 0 ? '더클라임 강남점' : `옛짐${i}`, gu: '강남구',
    grades: i === 0 ? [{ id: 'g1', label: '내가고친색', color: '#FF0000', order: 0 }] : [],
    scoreTable: { mode: 'formula', baseScore: 250, upFactor: 1.5, downFactor: 0.5, overrides: {} },
    favorite: i === 0, archived: false, gradesVerified: i === 0, gradesSource: null, isCustom: false,
  }));
  old.push({ id: 'gym_mine', name: '내가만든짐', gu: '마포구', grades: [], scoreTable: {},
             favorite: false, archived: false, gradesVerified: true, gradesSource: null, isCustom: true });
  localStorage.setItem('climbing-score/v1', JSON.stringify({
    profiles: [{ id: 'p1', name: '나', level: 3, primaryGymId: 'gym_old0', createdAt: '2026-01-01' }],
    gyms: old,
    sessions: [{ id: 's1', profileId: 'p1', gymId: 'gym_old0', date: '2026-08-20',
                 levelAtTime: 3, counts: { g1: 5 }, memo: '' }],
    meta: { version: 1, seeded: true },
  }));
});
console.log('옛 상태 심음: 짐 47곳(직접추가 1), 즐겨찾기 1, 확인한 난이도 1, 세션 1');

await p.goto('http://localhost:8099/index.html', { wait: 3000 });
const after = await p.eval(() => {
  const s = JSON.parse(localStorage.getItem('climbing-score/v1'));
  const gn = s.gyms.find((g) => g.name === '더클라임 강남점');
  return {
    '짐 수': s.gyms.length,
    '시드 버전': s.meta.seedVersion,
    '내가 만든 짐 살아있나': s.gyms.some((g) => g.name === '내가만든짐'),
    '즐겨찾기 유지': gn?.favorite,
    '내가 고친 난이도 유지': gn?.grades?.[0]?.label,
    '짐 id 유지 (세션 안 깨짐)': gn?.id,
    '내 점수표 유지': gn?.scoreTable?.baseScore,
    '세션 유지': s.sessions.length,
  };
});
console.log(JSON.stringify(after, null, 1));
await p.close();
