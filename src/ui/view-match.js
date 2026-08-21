/** 당일 대결 화면 (설계서 7.1절). 앱을 열면 여기가 뜬다. */
import { h, panel, button, icon, onPressAndHold, eyebrow } from './components.js';
import { hold } from './hold.js';
import { activeGrades } from '../domain/gym.js';
import { scoreFor } from '../domain/scoring.js';
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
        gym.gradesSource ? '아직 확인되지 않았어요. 클라이밍 기록 앱 자료를 참고했습니다.'
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
        ? `${gym.name}은 ${kinds} 중심으로 알려진 곳이라 색 등급 자료가 없습니다. 색으로 난이도를 나눈다면 벽에 붙은 안내판 순서대로 넣어 주세요.`
        : `${gym.name}의 색 체계는 공개 자료가 없습니다. 벽에 붙은 안내판 순서대로 넣어 주세요.`),
    button('난이도 설정하기', {
      onClick: () => actions.openGymSettings(gym.id), variant: 'solid', trailing: 'arrow',
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
      `서울 실내 클라이밍장 ${state.gyms.filter((g) => !g.archived).length}곳이 들어 있습니다. 목록에 없으면 직접 추가할 수 있어요.`),
    button('클라이밍장 고르기', { onClick: actions.openGymPicker, variant: 'solid', trailing: 'arrow' }),
    ),
  );
}

/* ---------- 입력 격자: 난이도 x 참가자 ---------- */

/** 첫 칸은 난이도 이름, 나머지는 참가자 수만큼 균등 분할 */
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
          '참가자를 추가하면 여기에서 바로 완등을 기록할 수 있습니다.'),
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
  }).sort((a, b) => b.score - a.score);

  const lead = rows[0]?.score ?? 0;

  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('div', {},
        eyebrow('오늘의 기록'),
        h('p', { class: 'hint', style: { marginTop: '0.3rem' } }, '탭하면 +1, 길게 누르면 −1'),
      ),
      button('참가자', { onClick: actions.openProfilePicker, small: true, trailing: 'plus' }),
    ),
    h('div', { class: 'grid' },
      // 머리글: 사람 이름과 현재 점수
      h('div', { class: 'grid__head', style: { gridTemplateColumns: tpl(rows.length) } },
        h('span', { class: 'grid__corner hint' }, '난이도'),
        rows.map((r, i) => h('button', {
          class: `grid__person${i === 0 && rows.length > 1 ? ' is-lead' : ''}`,
          type: 'button', onclick: () => actions.openLevelPicker(r.profile.id),
          title: `${r.profile.name} 숙련도 바꾸기`,
        },
          h('span', { class: 'grid__name' }, r.profile.name),
          h('span', { class: 'grid__score num' }, r.score.toLocaleString('ko-KR')),
          h('span', { class: 'hint num' }, `LV${r.level}`),
        )),
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
      lead > (rows[1]?.score ?? 0)
        ? `${rows[0].profile.name}이 ${(lead - rows[1].score).toLocaleString('ko-KR')}점 앞서고 있어요.`
        : '동점입니다.'),
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
    h('span', { class: 'cell__count num' }, count || ''),
    h('span', { class: 'cell__unit hint num' }, count ? '' : `${unit.toLocaleString('ko-KR')}`),
  );
  onPressAndHold(el, {
    onTap: () => actions.bump(session, grade.id, +1),
    onHold: () => actions.bump(session, grade.id, -1),
  });
  return el;
}

