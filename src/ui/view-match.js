/** 당일 대결 화면 (설계서 7.1절). 앱을 열면 여기가 뜬다. */
import { h, panel, button, icon, onPressAndHold, eyebrow } from './components.js';
import { hold } from './hold.js';
import { activeGrades } from '../domain/gym.js';
import { scoreFor } from '../domain/scoring.js';
import { josa, levelLabel } from '../domain/text.js';
import { findSession, createSession, bumpCount, scoreOf, sendsOf } from '../domain/session.js';

export function viewMatch(ctx) {
  const { state, actions } = ctx;
  const gym = state.gyms.find((g) => g.id === state.ui.gymId);
  const date = state.ui.date;

  if (!gym) return emptyGym(ctx);

  const grades = activeGrades(gym);

  return h('div', { class: 'view' },
    h('h1', { class: 'sr-only' }, `${gym.name} ${date} 대결`),
    headerBar(ctx, gym),
    !gym.gradesVerified && gym.grades.length > 0 && verifyBanner(ctx, gym),
    grades.length === 0
      ? noGrades(ctx, gym)
      : inputGrid(ctx, gym, grades),
  );
}

/* ---------- 상단: 짐과 날짜 ---------- */

function headerBar({ actions, state }, gym) {
  return h('div', { class: 'matchbar' },
    h('button', { class: 'matchbar__gym', type: 'button', onclick: actions.openGymPicker },
      gym.favorite && h('span', { class: 'star' }, icon('star', { size: 13, fill: true })),
      h('span', { class: 'matchbar__name' }, gym.name),
      icon('back', { size: 15 }),
    ),
    // date 입력에 aria-label을 걸면 연/월/일 세그먼트마다 겹쳐 읽힌다.
    // 보이지 않는 <label>로 감싸면 한 번만 읽힌다.
    h('label', { class: 'matchbar__datewrap' },
      h('span', { class: 'sr-only' }, '기록할 날짜'),
      h('input', {
        class: 'matchbar__date', type: 'date', value: state.ui.date,
        onchange: (e) => actions.setDate(e.target.value),
      }),
    ),
  );
}

/* ---------- 미검증 색 체계 확인 배너 (설계서 3.4절) ---------- */

function verifyBanner({ actions }, gym) {
  return h('div', { class: 'banner' },
    h('div', {},
      h('strong', {}, '이 색 순서가 맞나요?'),
      h('p', { class: 'hint' },
        // 가운뎃점을 8개씩 늘어놓으면 읽히지 않는다. 홀드를 순서대로 보여준다.
        h('span', { class: 'holdstrip' },
          gym.grades.slice().sort((a, b) => a.order - b.order).map((g) => hold(g, { size: 20, bolt: false }))),
      ),
      h('p', { class: 'hint' },
        gym.gradesSource ? '아직 확인되지 않았어요. 클라이밍 기록 앱 자료를 참고했어요.'
                         : '아직 확인되지 않았어요.'),
    ),
    h('div', { class: 'banner__actions' },
      button('맞아요', { onClick: () => actions.verifyGym(gym.id), variant: 'solid', small: true }),
      button('고칠래요', { onClick: () => actions.openGymSettings(gym.id), small: true }),
    ),
  );
}

function noGrades({ actions }, gym) {
  const kinds = gym.kinds?.length ? gym.kinds.join('·') : null;
  return panel(
    eyebrow('설정 필요'),
    h('h2', { class: 'title', style: { marginTop: '0.5rem' } }, '난이도 색을 먼저 등록해 주세요'),
    h('p', { class: 'subtitle', style: { margin: '0.5rem 0 1.25rem' } },
      kinds
        ? `${gym.name}${josa(gym.name, '은/는')} ${kinds} 중심으로 알려진 곳이라 색 등급 자료가 없어요. 색으로 난이도를 나눈다면 벽에 붙은 안내판 순서대로 넣어 주세요.`
        : `${gym.name}의 색 체계는 공개 자료가 없어요. 벽에 붙은 안내판 순서대로 넣어 주세요.`),
    button('난이도 설정하기', {
      onClick: () => actions.openGymSettings(gym.id), variant: 'solid', trailing: 'next',
    }),
  );
}

function emptyGym({ state, actions }) {
  return h('div', { class: 'view view--centered' },
    h('h1', { class: 'sr-only' }, '클라이밍 점수'),
    panel(
    eyebrow('시작'),
    h('h2', { class: 'title', style: { marginTop: '0.5rem' } }, '오늘 어디서 하나요?'),
    h('p', { class: 'subtitle', style: { margin: '0.5rem 0 1.25rem' } },
      `서울 실내 클라이밍장 ${state.gyms.filter((g) => !g.archived).length}곳이 들어 있어요. 목록에 없으면 직접 추가할 수 있어요.`),
    button('클라이밍장 고르기', { onClick: actions.openGymPicker, variant: 'solid', trailing: 'next' }),
    ),
  );
}

/* ---------- 입력 격자: 난이도 x 참가자 ---------- */

/**
 * 첫 칸은 난이도 이름, 나머지는 참가자 수만큼 균등 분할.
 *
 * 참가자 칸에 상한을 걸어 봤지만 1명일 때 오히려 나빴다. 칸이 좁아진 만큼
 * 난이도 이름과 칸 사이의 빈 띠가 넓어져, 이름과 칸을 잇는 눈길이 더 멀어진다.
 * 칸을 늘려 두고 안을 채우는 편이 낫다(cell 참고).
 */
function tpl(n) {
  const first = n >= 4 ? 60 : n === 3 ? 72 : 84;
  return `minmax(${first}px, ${n >= 4 ? 0.8 : 1}fr) repeat(${n}, minmax(0, 1fr))`;
}

/**
 * 참가자를 전환하며 기록하면 사람 수만큼 탭이 늘어난다. 3명이 각자 5개를
 * 깼으면 전환 6번 + 탭 15번이다. 격자로 두면 전환 없이 15번으로 끝난다.
 *
 * 세로는 난이도, 가로는 참가자. 각 칸을 탭하면 그 사람의 그 난이도가 +1.
 */
function inputGrid({ state, actions }, gym, grades) {
  const people = state.profiles;
  if (!people.length) {
    return h('section', { class: 'section' },
      panel(
        eyebrow('참가자 없음'),
        h('h2', { class: 'title', style: { margin: '0.4rem 0 0.35rem' } }, '누가 오늘 같이 하나요'),
        h('p', { class: 'subtitle', style: { marginBottom: '1rem' } },
          '참가자를 추가하면 여기에서 바로 완등을 기록할 수 있어요.'),
        button('참가자 추가', { onClick: actions.openProfilePicker, variant: 'solid', trailing: 'plus' }),
      ),
    );
  }

  const rows = people.map((profile) => {
    const level = profile.level ?? 0;
    const session = findSession(state.sessions, {
      profileId: profile.id, gymId: gym.id, date: state.ui.date,
    }) ?? createSession({
      profileId: profile.id, gymId: gym.id, date: state.ui.date,
      level, scoreTable: gym.scoreTable,
    });
    return { profile, level, session, score: scoreOf(session, gym), sends: sendsOf(session) };
  });   // 열 순서는 참가자 추가 순서로 고정한다

  // 순위는 점수로 매기되 자리는 바꾸지 않는다. 동점은 같은 순위.
  const ordered = [...rows].sort((a, b) => b.score - a.score);
  const rankOf = new Map();
  ordered.forEach((r, i) => {
    const prev = ordered[i - 1];
    rankOf.set(r.profile.id, prev && prev.score === r.score ? rankOf.get(prev.profile.id) : i + 1);
  });
  const lead = ordered[0]?.score ?? 0;

  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('div', {},
        eyebrow('오늘의 기록'),
        // 칸에 '+34점' 이 함께 뜨므로, 탭이 올리는 게 개수라는 걸 못 박아 준다
        h('p', { class: 'hint', style: { marginTop: '0.3rem' } }, '탭하면 완등 +1, 길게 누르면 −1'),
      ),
      button('참가자 추가', { onClick: actions.openProfilePicker, small: true, trailing: 'plus' }),
    ),
    h('div', { class: 'grid' },
      // 머리글: 사람 이름과 현재 점수
      h('div', { class: 'grid__head', style: { gridTemplateColumns: tpl(rows.length) } },
        h('span', { class: 'grid__corner hint' }, '난이도'),
        rows.map((r) => {
          const rank = rankOf.get(r.profile.id);
          const top = rows.length > 1 && rank === 1 && r.score > 0;
          return h('button', {
            class: `grid__person${top ? ' is-lead' : ''}`,
            type: 'button', onclick: () => actions.openLevelPicker(r.profile.id),
            title: `${r.profile.name} 숙련도 바꾸기`,
          },
            h('span', { class: 'grid__top' },
              // 0점인 사람만 배지를 빼면 그 칸만 모양이 달라진다.
              // 아무도 기록이 없을 때만 순위를 감춘다.
              rows.length > 1 && lead > 0
                ? h('span', { class: `grid__rank num${top ? ' is-first' : ''}` }, `${rank}위`)
                : null,
              h('span', { class: 'grid__name' }, r.profile.name),
            ),
            h('span', { class: 'grid__score num' }, r.score.toLocaleString('ko-KR')),
            h('span', { class: 'hint num' }, levelLabel(r.level)),
          );
        }),
      ),
      // 본문: 난이도마다 사람별 칸
      grades.map((grade) => h('div', {
        class: 'grid__row', style: { gridTemplateColumns: tpl(rows.length) },
      },
        h('span', { class: 'grid__grade' },
          hold(grade, { size: 20 }),
          h('span', { class: 'grid__label' }, grade.label),
        ),
        rows.map((r) => cell({ grade, ...r, gym, actions })),
      )),
    ),
    rows.length > 1 && h('p', { class: 'hint', style: { marginTop: 'var(--sp-3)' } },
      lead > 0 && lead > (ordered[1]?.score ?? 0)
        ? `${ordered[0].profile.name}${josa(ordered[0].profile.name, '이/가')} ${(lead - ordered[1].score).toLocaleString('ko-KR')}점 앞서고 있어요.`
        : lead > 0 ? '동점예요.' : '아직 기록이 없어요.'),
  );
}

function cell({ grade, profile, level, session, gym, actions }) {
  const count = session.counts?.[grade.id] ?? 0;
  const unit = scoreFor(gym.scoreTable, level, grade);
  const el = h('button', {
    class: `cell${count ? ' has-count' : ''}${grade.order === level ? ' is-mylevel' : ''}`,
    type: 'button',
    'aria-label': `${profile.name} ${grade.label} ${count}개, 한 개당 ${unit}점`,
  },
    // 개당 점수는 늘 '+34점' 으로 적는다. 예전에는 기록이 없을 때만 '110점' 을
    // 띄웠는데, 완등 110개로 읽는 사람이 있었다. + 를 붙이면 누르면 오르는 값이라는
    // 뜻이 분명해지고, 굵은 개수와도 헷갈리지 않는다.
    // 칸이 넓으면 한 줄로, 좁으면 위아래로 접힌다(flex-wrap).
    h('span', { class: 'cell__body' },
      count ? h('span', { class: 'cell__count num' }, String(count)) : null,
      h('span', { class: 'cell__unit num' }, `+${unit.toLocaleString('ko-KR')}점`),
    ),
  );
  onPressAndHold(el, {
    onTap: () => actions.bump(session, grade.id, +1),
    onHold: () => actions.bump(session, grade.id, -1),
  });
  return el;
}

