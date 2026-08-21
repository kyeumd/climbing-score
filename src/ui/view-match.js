/** 당일 대결 화면 (설계서 7.1절). 앱을 열면 여기가 뜬다. */
import { h, panel, button, icon, animateNumber, onPressAndHold, eyebrow } from './components.js';
import { hold } from './hold.js';
import { ranking } from '../domain/match.js';
import { activeGrades } from '../domain/gym.js';
import { scoreFor } from '../domain/scoring.js';
import { findSession, createSession, bumpCount, scoreOf, sendsOf } from '../domain/session.js';

export function viewMatch(ctx) {
  const { state, actions } = ctx;
  const gym = state.gyms.find((g) => g.id === state.ui.gymId);
  const date = state.ui.date;

  if (!gym) return emptyGym(ctx);

  const rows = ranking({ sessions: state.sessions, gym, date, profiles: state.profiles });
  const grades = activeGrades(gym);

  return h('div', { class: 'view' },
    h('h1', { class: 'sr-only' }, `${gym.name} ${date} 대결`),
    headerBar(ctx, gym),
    !gym.gradesVerified && gym.grades.length > 0 && verifyBanner(ctx, gym),
    grades.length === 0
      ? noGrades(ctx, gym)
      : h('div', {},
          scoreboard(ctx, rows, gym),
          inputDeck(ctx, gym, grades),
        ),
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

/* ---------- 중단: 스코어보드 ---------- */

function scoreboard({ state, actions }, rows, gym) {
  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('div', {},
        eyebrow('오늘의 대결'),
        h('p', { class: 'hint', style: { marginTop: '0.35rem' } },
          rows.length ? `${rows.length}명 참가 중` : '아직 아무도 기록하지 않았어요'),
      ),
      button('참가자 추가', { onClick: actions.openProfilePicker, small: true, trailing: 'plus' }),
    ),
    rows.length === 0
      ? panel(h('p', { class: 'subtitle' }, '첫 완등을 기록하면 여기에 순위가 나타납니다.'))
      : h('ul', { class: 'board' }, rows.map((r) => boardRow(r, state, actions))),
  );
}

function boardRow(row, state, actions) {
  const active = row.profile.id === state.ui.profileId;
  const scoreEl = h('span', { class: 'num board__score', 'data-value': row.score },
    row.score.toLocaleString('ko-KR'));

  return h('li', {
    class: `board__row${active ? ' is-active' : ''}${row.rank === 1 ? ' is-lead' : ''}`,
    onclick: () => actions.setProfile(row.profile.id),
  },
    h('span', { class: 'board__rank num' }, row.rank === 1 ? icon('trophy', { size: 16 }) : row.rank),
    h('div', { class: 'board__who' },
      h('span', { class: 'board__name' }, row.profile.name),
      h('span', { class: 'hint num' },
        `LV${row.level} · ${row.sends}완등`,
        row.gapFromLead > 0
          ? h('span', { class: 'board__gap' }, `${row.gapFromLead.toLocaleString('ko-KR')}점 차`)
          : ''),
    ),
    scoreEl,
  );
}

/* ---------- 하단: 내 입력부 ---------- */

function inputDeck({ state, actions }, gym, grades) {
  const profile = state.profiles.find((p) => p.id === state.ui.profileId);
  if (!profile) {
    return h('section', { class: 'section' },
      panel(
        h('p', { class: 'subtitle', style: { marginBottom: '1rem' } },
          '기록하려면 먼저 내 프로필을 골라 주세요.'),
        button('프로필 고르기', { onClick: actions.openProfilePicker, variant: 'solid', trailing: 'arrow' }),
      ),
    );
  }

  const level = profile.level ?? 0;
  const session = findSession(state.sessions, {
    profileId: profile.id, gymId: gym.id, date: state.ui.date,
  }) ?? createSession({
    profileId: profile.id, gymId: gym.id, date: state.ui.date,
    level, scoreTable: gym.scoreTable,
  });

  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('div', {},
        eyebrow(`${profile.name} 입력`),
        h('p', { class: 'hint', style: { marginTop: '0.35rem' } },
          '탭하면 +1, 길게 누르면 −1'),
      ),
      button(`LV${level}`, { onClick: () => actions.openLevelPicker(profile.id), small: true }),
    ),
    h('div', { class: 'grades' },
      grades.map((grade) => gradeCard({ grade, session, gym, level, actions })),
    ),
    stickyTotal(session, gym, profile, state),
  );
}

function gradeCard({ grade, session, gym, level, actions }) {
  const count = session.counts?.[grade.id] ?? 0;
  const unit = scoreFor(gym.scoreTable, level, grade);
  const isMyLevel = grade.order === level;

  const card = h('button', {
    class: `gcard${count ? ' has-count' : ''}${isMyLevel ? ' is-mylevel' : ''}`,
    type: 'button',
    'aria-label': `${grade.label} ${count}개`,
  },
    h('span', { class: 'holdcell' }, hold(grade, { size: 22 })),
    h('span', { class: 'gcard__body' },
      h('span', { class: 'gcard__label' }, grade.label),
      h('span', { class: 'hint num' }, `${unit.toLocaleString('ko-KR')}점`),
    ),
    h('span', { class: 'gcard__count num' }, count || ''),
  );

  onPressAndHold(card, {
    onTap: () => actions.bump(session, grade.id, +1),
    onHold: () => actions.bump(session, grade.id, -1),
  });
  return card;
}

/**
 * 하단 고정 요약.
 * 스코어보드와 같은 숫자를 반복하는 대신, 스크롤로 스코어보드가 사라진 뒤에도
 * 내 순위와 선두와의 차이를 계속 보여준다. 배경은 불투명하게 두어
 * 뒤 카드 글자가 비쳐 읽기 나빠지는 일이 없게 한다.
 */
function stickyTotal(session, gym, profile, state) {
  const score = scoreOf(session, gym);
  const rows = ranking({ sessions: state.sessions, gym, date: state.ui.date, profiles: state.profiles });
  const me = rows.find((r) => r.profile.id === profile.id);
  const el = h('span', { class: 'num total__score', 'data-value': score },
    score.toLocaleString('ko-KR'));
  requestAnimationFrame(() => animateNumber(el, score));

  return h('div', { class: 'total' },
    h('div', { class: 'total__inner' },
      h('span', { class: 'total__left' },
        me && rows.length > 1
          ? h('span', { class: 'total__rank num' }, `${me.rank}위`)
          : null,
        h('span', { class: 'hint num' }, `${sendsOf(session)}완등`),
      ),
      h('span', { class: 'total__right' },
        me && me.gapFromLead > 0
          ? h('span', { class: 'board__gap num' }, `${me.gapFromLead.toLocaleString('ko-KR')}점 차`)
          : null,
        el, h('span', { class: 'total__unit' }, '점'),
      ),
    ),
  );
}
