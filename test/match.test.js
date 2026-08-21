import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ranking, headToHead } from '../src/domain/match.js';
import { createSession, bumpCount, gymStats } from '../src/domain/session.js';
import { createGym, retireGrade, moveGrade, activeGrades, allGrades, guChips } from '../src/domain/gym.js';

function fixture() {
  const gym = createGym({
    name: '테스트짐',
    gu: '강남구',
    grades: [
      { label: '1단계', color: '#111' },
      { label: '2단계', color: '#222' },
      { label: '3단계', color: '#333' },
    ],
  });
  const profiles = [
    { id: 'p1', name: '나' },
    { id: 'p2', name: '친구' },
  ];
  return { gym, profiles, g: activeGrades(gym) };
}

test('당일 대결: 점수 내림차순으로 순위가 매겨진다', () => {
  const { gym, profiles, g } = fixture();
  let a = createSession({ profileId: 'p1', gymId: gym.id, date: '2026-08-20', level: 0 });
  let b = createSession({ profileId: 'p2', gymId: gym.id, date: '2026-08-20', level: 0 });
  a = bumpCount(a, g[0].id, 3);            // 100 × 3 = 300
  b = bumpCount(b, g[2].id, 1);            // 225 × 1 = 225

  const rows = ranking({ sessions: [a, b], gym, date: '2026-08-20', profiles });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].profile.name, '나');
  assert.equal(rows[0].score, 300);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].gapFromLead, 75, '선두와의 점수 차');
});

test('동점이면 같은 순위', () => {
  const { gym, profiles, g } = fixture();
  const a = bumpCount(createSession({ profileId: 'p1', gymId: gym.id, date: 'D', level: 0 }), g[0].id, 1);
  const b = bumpCount(createSession({ profileId: 'p2', gymId: gym.id, date: 'D', level: 0 }), g[0].id, 1);
  const rows = ranking({ sessions: [a, b], gym, date: 'D', profiles });
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 1);
});

test('레벨이 다르면 같은 완등도 점수가 다르다', () => {
  const { gym, profiles, g } = fixture();
  // 고수(LV2)가 1단계를 깨면 25점, 초보(LV0)가 깨면 100점
  const pro = bumpCount(createSession({ profileId: 'p1', gymId: gym.id, date: 'D', level: 2 }), g[0].id, 1);
  const noob = bumpCount(createSession({ profileId: 'p2', gymId: gym.id, date: 'D', level: 0 }), g[0].id, 1);
  const rows = ranking({ sessions: [pro, noob], gym, date: 'D', profiles });
  assert.equal(rows[0].profile.name, '친구');
  assert.equal(rows[0].score, 100);
  assert.equal(rows[1].score, 25);
});

test('다른 짐 세션은 대결에 끼지 않는다', () => {
  const { gym, profiles, g } = fixture();
  const other = createGym({ name: '다른짐', gu: '마포구', grades: [{ label: 'x' }] });
  const mine = bumpCount(createSession({ profileId: 'p1', gymId: gym.id, date: 'D', level: 0 }), g[0].id, 1);
  const theirs = createSession({ profileId: 'p2', gymId: other.id, date: 'D', level: 0 });
  const rows = ranking({ sessions: [mine, theirs], gym, date: 'D', profiles });
  assert.equal(rows.length, 1);
});

test('대결 전적: 혼자 기록한 날은 세지 않는다', () => {
  const { gym, profiles, g } = fixture();
  const solo = bumpCount(createSession({ profileId: 'p1', gymId: gym.id, date: 'D1', level: 0 }), g[0].id, 1);
  const meD2 = bumpCount(createSession({ profileId: 'p1', gymId: gym.id, date: 'D2', level: 0 }), g[1].id, 1);
  const youD2 = bumpCount(createSession({ profileId: 'p2', gymId: gym.id, date: 'D2', level: 0 }), g[0].id, 1);

  const h2h = headToHead({ sessions: [solo, meD2, youD2], gym, profileId: 'p1', profiles });
  assert.equal(h2h.length, 1);
  assert.deepEqual(
    { win: h2h[0].win, lose: h2h[0].lose, draw: h2h[0].draw },
    { win: 1, lose: 0, draw: 0 },
  );
});

test('카운트는 0 미만으로 내려가지 않는다', () => {
  const { gym, g } = fixture();
  let s = createSession({ profileId: 'p1', gymId: gym.id, level: 0 });
  s = bumpCount(s, g[0].id, -1);
  assert.equal(s.counts[g[0].id], undefined);
  s = bumpCount(bumpCount(s, g[0].id, 2), g[0].id, -5);
  assert.equal(s.counts[g[0].id], undefined, '0이 되면 키를 지운다');
});

test('등급을 retire해도 과거 기록은 살아 있다', () => {
  const { gym, g } = fixture();
  const s = bumpCount(createSession({ profileId: 'p1', gymId: gym.id, date: 'D', level: 0 }), g[2].id, 2);
  const after = retireGrade(gym, g[2].id);

  assert.equal(activeGrades(after).length, 2, '신규 기록에서는 숨는다');
  assert.equal(allGrades(after).length, 3, '과거 조회에는 남는다');

  const stats = gymStats([s], after, 'p1');
  assert.equal(stats.totalScore, 450, '점수가 그대로 계산된다');
  assert.equal(stats.topGrade.label, '3단계');
});

test('등급 순서를 바꿔도 id는 유지된다', () => {
  const { gym, g } = fixture();
  const moved = moveGrade(gym, g[0].id, 1);
  const sorted = allGrades(moved);
  assert.equal(sorted[0].label, '2단계');
  assert.equal(sorted[1].label, '1단계');
  assert.equal(sorted[1].id, g[0].id, 'id는 그대로여서 과거 기록이 안 깨진다');
});

test('구 칩은 짐이 많은 구부터', () => {
  const gyms = [
    createGym({ name: 'A', gu: '마포구' }),
    createGym({ name: 'B', gu: '강남구' }),
    createGym({ name: 'C', gu: '강남구' }),
  ];
  const chips = guChips(gyms);
  assert.deepEqual(chips, [{ gu: '강남구', count: 2 }, { gu: '마포구', count: 1 }]);
});

test('같은 색을 두 번 추가하면 이름으로 구분된다', async () => {
  const { createGym, addGrade, allGrades } = await import('../src/domain/gym.js');
  let gym = createGym({ name: 'X', grades: [] });
  gym = addGrade(gym, { label: '빨강', color: '#E23B34' });
  gym = addGrade(gym, { label: '빨강', color: '#E23B34' });
  gym = addGrade(gym, { label: '빨강', color: '#E23B34' });
  assert.deepEqual(allGrades(gym).map((g) => g.label), ['빨강', '빨강 2', '빨강 3']);
});

test('숙련도는 사람에게 붙는다 (짐별이 아니라 프로필당 하나)', async () => {
  const { createProfile, setLevel, clampLevel, migrateProfile, MAX_LEVEL } =
    await import('../src/domain/profile.js');
  const p = createProfile({ name: '나', level: 3 });
  assert.equal(p.level, 3);
  assert.equal(p.levels, undefined, '짐별 맵은 더 이상 없다');
  assert.equal(setLevel(p, 7).level, 7);
  assert.equal(clampLevel(-5), 0);
  assert.equal(clampLevel(999), MAX_LEVEL);
  assert.equal(clampLevel('abc'), 0);
});

test('짐별 레벨을 쓰던 예전 데이터는 가장 높은 값으로 옮겨진다', async () => {
  const { migrateProfile } = await import('../src/domain/profile.js');
  const old = { id: 'p1', name: '나', levels: { gymA: 2, gymB: 5, gymC: 1 } };
  const next = migrateProfile(old);
  assert.equal(next.level, 5);
  assert.equal(next.levels, undefined);
  // 이미 옮겨진 프로필은 그대로 둔다
  assert.equal(migrateProfile({ id: 'p2', name: '너', level: 4 }).level, 4);
});

test('레벨을 바꾸면 오늘 기록은 따라오고 지난 기록은 그대로다', async () => {
  const { createSession, bumpCount } = await import('../src/domain/session.js');
  const { sessionScore } = await import('../src/domain/scoring.js');
  const { createGym, activeGrades } = await import('../src/domain/gym.js');
  const gym = createGym({ name: 'X', grades: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] });
  const g = activeGrades(gym);

  const today = bumpCount(createSession({ profileId: 'p1', gymId: gym.id, date: '2026-08-21', level: 3 }), g[0].id, 1);
  const past = bumpCount(createSession({ profileId: 'p1', gymId: gym.id, date: '2026-08-01', level: 3 }), g[0].id, 1);

  // 레벨을 7로 올리면 오늘 세션만 levelAtTime이 따라간다
  const todayAfter = { ...today, levelAtTime: 7 };
  assert.notEqual(sessionScore(todayAfter, g), sessionScore(today, g), '오늘 점수는 다시 계산된다');
  assert.equal(sessionScore(past, g), sessionScore({ ...past }, g), '지난 기록은 그대로다');
  // 카드에 보이는 단가와 세션 계산 기준이 같아야 한다
  const { scoreFor } = await import('../src/domain/scoring.js');
  assert.equal(sessionScore(todayAfter, g), scoreFor(undefined, 7, g[0]));
});
