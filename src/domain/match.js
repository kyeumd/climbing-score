/** 당일 대결 — 앱의 심장 (설계서 7.1절). */
import { sessionScore, sessionSends } from './scoring.js';
import { allGrades } from './gym.js';

/**
 * 같은 날·같은 짐의 참가자 순위.
 * 짐이 다르면 비교 대상이 아니다 — 대결은 언제나 한 짐 안에서 성립한다.
 */
export function ranking({ sessions, gym, date, profiles }) {
  if (!gym) return [];
  const grades = allGrades(gym);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const rows = sessions
    .filter((s) => s.gymId === gym.id && s.date === date && byId.has(s.profileId))
    .map((s) => ({
      session: s,
      profile: byId.get(s.profileId),
      score: sessionScore(s, grades),
      sends: sessionSends(s),
      level: s.levelAtTime,
    }))
    .sort((a, b) => b.score - a.score || b.sends - a.sends
      || a.profile.name.localeCompare(b.profile.name, 'ko'));

  // 동점은 같은 순위. 선두와의 점수 차를 함께 싣는다.
  const lead = rows[0]?.score ?? 0;
  let rank = 0;
  let prevScore = null;
  return rows.map((r, i) => {
    if (r.score !== prevScore) { rank = i + 1; prevScore = r.score; }
    return { ...r, rank, gapFromLead: lead - r.score };
  });
}

/** 과거 당일 대결의 승패 누적. 혼자 기록한 날은 대결로 치지 않는다. */
export function headToHead({ sessions, gym, profileId, profiles }) {
  if (!gym) return [];
  const dates = [...new Set(
    sessions.filter((s) => s.gymId === gym.id).map((s) => s.date),
  )];

  const tally = new Map();
  for (const date of dates) {
    const rows = ranking({ sessions, gym, date, profiles });
    if (rows.length < 2) continue;
    const me = rows.find((r) => r.profile.id === profileId);
    if (!me) continue;
    for (const other of rows) {
      if (other.profile.id === profileId) continue;
      const rec = tally.get(other.profile.id)
        ?? { profile: other.profile, win: 0, lose: 0, draw: 0 };
      if (me.score > other.score) rec.win++;
      else if (me.score < other.score) rec.lose++;
      else rec.draw++;
      tally.set(other.profile.id, rec);
    }
  }
  return [...tally.values()].sort((a, b) => (b.win + b.lose + b.draw) - (a.win + a.lose + a.draw));
}
