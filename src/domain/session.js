/** 세션 생성·집계. */
import { uid, localDate } from './ids.js';
import { sessionScore, sessionSends } from './scoring.js';
import { allGrades } from './gym.js';

/**
 * 프로필 + 짐 + 날짜 조합당 세션 1개 (설계서 7.1절).
 * levelAtTime과 scoreTable을 스냅샷으로 박아 과거 점수를 보존한다.
 */
export function createSession({ profileId, gymId, date = localDate(), level = 0, scoreTable }) {
  return {
    id: uid('ses'),
    profileId,
    gymId,
    date,
    levelAtTime: level,
    scoreTable: scoreTable ? { ...scoreTable } : undefined,
    counts: {},
    memo: '',
  };
}

export function findSession(sessions, { profileId, gymId, date }) {
  return sessions.find(
    (s) => s.profileId === profileId && s.gymId === gymId && s.date === date,
  );
}

/** 카운트 증감. 0 미만으로 내려가지 않고, 0이 되면 키를 지운다. */
export function bumpCount(session, gradeId, delta) {
  const next = Math.max(0, (session.counts?.[gradeId] ?? 0) + delta);
  const counts = { ...session.counts };
  if (next === 0) delete counts[gradeId];
  else counts[gradeId] = next;
  return { ...session, counts };
}

export function scoreOf(session, gym) {
  return sessionScore(session, allGrades(gym));
}

export function sendsOf(session) {
  return sessionSends(session);
}

/** 짐 하나에서의 누적 통계. 짐 간 합산은 하지 않는다 (설계서 5.4절). */
export function gymStats(sessions, gym, profileId) {
  const mine = sessions
    .filter((s) => s.gymId === gym.id && s.profileId === profileId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const grades = allGrades(gym);
  const byGrade = new Map(grades.map((g) => [g.id, 0]));
  let totalScore = 0;
  let totalSends = 0;
  let topOrder = -1;

  for (const s of mine) {
    totalScore += sessionScore(s, grades);
    totalSends += sessionSends(s);
    for (const [gradeId, count] of Object.entries(s.counts ?? {})) {
      if (!count) continue;
      byGrade.set(gradeId, (byGrade.get(gradeId) ?? 0) + count);
      const g = grades.find((x) => x.id === gradeId);
      if (g && g.order > topOrder) topOrder = g.order;
    }
  }

  return {
    sessions: mine,
    sessionCount: mine.length,
    totalScore,
    totalSends,
    topGrade: topOrder >= 0 ? grades.find((g) => g.order === topOrder) : null,
    gradeTotals: grades.map((g) => ({ grade: g, count: byGrade.get(g.id) ?? 0 })),
    trend: mine.map((s) => ({ date: s.date, score: sessionScore(s, grades) })),
  };
}
