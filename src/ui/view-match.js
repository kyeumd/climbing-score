/** 당일 대결 화면 (설계서 7.1절). 앱을 열면 여기가 뜬다. */
import { h, panel, button, icon, onPressAndHold, eyebrow } from './components.js';
import { hold } from './hold.js';
import { activeGrades } from '../domain/gym.js';
import { scoreFor } from '../domain/scoring.js';
import { josa, levelLabel } from '../domain/text.js';
import { prettyDate } from './date-picker.js';
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
    /*
     * <input type="date"> 를 버튼으로 바꿨다. 네이티브 달력은 iOS·안드로이드·
     * 데스크톱이 저마다 다르게 뜨고 그중 어느 것도 이 앱처럼 생기지 않았다.
     * 게다가 '2026. 08. 31.' 은 오늘인지 아닌지 한눈에 안 보인다.
     */
    h('button', {
      class: 'matchbar__date', type: 'button',
      'aria-label': `기록할 날짜: ${state.ui.date}. 눌러서 바꾸기`,
      onclick: () => actions.openDatePicker(),
    },
      icon('calendar', { size: 15 }),
      h('span', {}, prettyDate(state.ui.date)),
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
/** 난이도 칸의 폭. 칩 줄을 열에 맞춰 들여쓰는 데도 쓴다. */
function firstCol(n) {
  return n >= 4 ? 34 : n === 3 ? 72 : 84;
}

function tpl(n) {
  /*
   * 사람이 늘면 난이도 칸부터 줄인다.
   *
   * 360px 에 다섯 명이면 기록 칸이 50px 까지 눌린다. 그 폭에 개수와 '+34점'
   * 이 함께 들어가야 한다. 반면 난이도 칸은 색 이름(25px)을 안 그리면
   * 홀드 하나면 충분하다 — 그래서 네 명부터는 이름을 접고(아래 is-tight)
   * 칸을 홀드 크기까지 줄인다.
   */
  return `minmax(${firstCol(n)}px, ${n >= 4 ? 0 : 1}fr) repeat(${n}, minmax(0, 1fr))`;
}

/**
 * 참가자를 전환하며 기록하면 사람 수만큼 탭이 늘어난다. 3명이 각자 5개를
 * 깼으면 전환 6번 + 탭 15번이다. 격자로 두면 전환 없이 15번으로 끝난다.
 *
 * 세로는 난이도, 가로는 참가자. 각 칸을 탭하면 그 사람의 그 난이도가 +1.
 */
function inputGrid(ctx, gym, grades) {
  const { state, actions } = ctx;
  const people = state.profiles;
  if (!people.length) {
    // 아무도 없을 때도 같은 칸을 쓴다. 여기서만 팝업을 띄우면 첫 사람만
    // 다른 방식으로 넣게 되고, 무엇보다 첫 사람을 넣을 길이 아예 막힌다.
    return h('section', { class: 'section' },
      panel(
        eyebrow('참가자 없음'),
        h('h2', { class: 'title', style: { margin: '0.4rem 0 0.35rem' } }, '누가 오늘 같이 하나요'),
        // 사람을 만드는 일은 프로필에서만 한다. 여기서는 데려다 세우기만 한다.
        button('프로필에서 만들기', {
          onClick: actions.openNewProfile, variant: 'solid', trailing: 'next',
        }),
      ),
    );
  }

  /*
   * 줄별 점수와 순위를 지금 상태에서 다시 센다.
   * 처음 그릴 때와 나중에 고쳐 쓸 때가 같은 값을 봐야 하므로 한 곳에 둔다.
   */
  const compute = () => {
    // 열 순서는 참가자 추가 순서로 고정한다
    const playing = new Set(ctx.playingIds());
    const rows = state.profiles.filter((p) => playing.has(p.id)).map((profile) => {
      const level = profile.level ?? 0;
      const session = findSession(state.sessions, {
        profileId: profile.id, gymId: gym.id, date: state.ui.date,
      }) ?? createSession({
        profileId: profile.id, gymId: gym.id, date: state.ui.date,
        level, scoreTable: gym.scoreTable,
      });
      return { profile, level, session, score: scoreOf(session, gym), sends: sendsOf(session) };
    });
    // 순위는 점수로 매기되 자리는 바꾸지 않는다. 동점은 같은 순위.
    const ordered = [...rows].sort((a, b) => b.score - a.score);
    const rankOf = new Map();
    ordered.forEach((r, i) => {
      const prev = ordered[i - 1];
      rankOf.set(r.profile.id, prev && prev.score === r.score ? rankOf.get(prev.profile.id) : i + 1);
    });
    return { rows, ordered, rankOf, lead: ordered[0]?.score ?? 0 };
  };

  let m = compute();
  const n = m.rows.length;
  const adding = !!state.ui.adding;
  const cols = tpl(n);
  const isTop = (r) => n > 1 && m.rankOf.get(r.profile.id) === 1 && r.score > 0;
  // 0점인 사람만 배지를 빼면 그 칸만 모양이 달라진다.
  // 아무도 기록이 없을 때만 순위를 감춘다.
  const showRank = () => n > 1 && m.lead > 0;
  /*
   * 꼴찌.
   *
   * 점수가 가장 낮은 사람. 다만 아무도 기록이 없거나 전원 동점이면 꼴찌가
   * 아니라 그냥 시작 전이므로 붙이지 않는다. 내기 앱에서 1등만 표시하면
   * 재미가 반이다.
   */
  const isLast = (r) => n > 1 && m.lead > 0
    && r.score === m.ordered[m.ordered.length - 1].score
    && r.score < m.lead;
  const rankText = (r) => (isLast(r) ? '꼴찌' : `${m.rankOf.get(r.profile.id)}위`);

  // 고쳐 쓸 노드를 들고 있는다. 다시 찾느라 DOM 을 훑지 않는다.
  const heads = new Map();   // profileId -> { btn, top, rankEl, scoreEl }
  const cells = new Map();   // `${profileId}:${gradeId}` -> { el, body, countEl, unitEl }

  /*
   * 오늘 참가자.
   *
   * 모드를 없앴다. 예전에는 '참가자' 를 눌러 상자를 열고, 칩을 만지고,
   * '완료' 를 눌러 닫아야 했다. 세 번 누를 일을 한 번으로 줄인다 —
   * 칩 줄 자체가 컨트롤이면서 현황이다. 채워진 칩이 오늘 격자에 선 사람이다.
   *
   * 사람을 만드는 일은 여기 없다. 그건 프로필이 맡는다.
   */
  const playingSet = new Set(ctx.playingIds());
  const roster = state.profiles.length > 1
    /* 칩과 열은 같은 사람의 같은 순서다. 왼쪽 끝에서 시작하면 난이도 칸
       폭만큼 어긋나 보이므로, 열이 시작하는 자리에 맞춰 들여쓴다. */
    ? h('div', {
        class: 'chips roster__chips', role: 'group', 'aria-label': '오늘 참가자',
        style: { paddingLeft: `${firstCol(n) + 4}px` },
      },
        state.profiles.map((p) => h('button', {
          class: 'chip', type: 'button',
          'aria-pressed': String(playingSet.has(p.id)),
          onclick: () => actions.togglePlaying(p.id),
        }, p.name)),
      )
    : null;

  const head = h('div', { class: 'grid__head', style: { gridTemplateColumns: cols } },
    h('span', { class: 'grid__corner hint' }, '난이도'),
    m.rows.map((r) => {
      const rankEl = h('span', {
        class: `grid__rank num${isTop(r) ? ' is-first' : ''}${isLast(r) ? ' is-last' : ''}`,
      }, rankText(r));
      const scoreEl = h('span', { class: 'grid__score num' }, r.score.toLocaleString('ko-KR'));
      const top = h('span', { class: 'grid__top' },
        showRank() ? rankEl : null,
        h('span', { class: 'grid__name' }, r.profile.name),
      );
      /* 이름·점수·레벨을 읽는 자리다. 누를 것이 없으므로 버튼이 아니다.
         예전에는 눌러서 레벨 시트를 열었는데 레벨은 프로필로 옮겼다. */
      const btn = h('div', {
        class: `grid__person${isTop(r) ? ' is-lead' : ''}`,
      }, top, scoreEl, h('span', { class: 'hint num' }, levelLabel(r.level)));
      heads.set(r.profile.id, { btn, top, rankEl, scoreEl });
      return btn;
    }),
  );

  const body = grades.map((grade) => h('div', {
    class: 'grid__row', style: { gridTemplateColumns: cols },
  },
    h('span', { class: 'grid__grade' },
      hold(grade, { size: 20 }),
      h('span', { class: 'grid__label' }, grade.label),
    ),
    m.rows.map((r) => {
      const el = cell({ grade, ...r, gym, actions });
      cells.set(`${r.profile.id}:${grade.id}`, {
        el,
        body: el.querySelector('.cell__body'),
        countEl: el.querySelector('.cell__count') ?? h('span', { class: 'cell__count num' }, ''),
        unitEl: el.querySelector('.cell__unit'),
      });
      return el;
    }),
  ));


  /*
   * 개수가 바뀌었을 때 부수지 않고 고쳐 쓴다.
   *
   * 구조(참가자 목록·난이도)가 그대로일 때만 맡는다. 달라졌으면 false 를
   * 돌려주고, 그때는 app.js 가 평소대로 전부 다시 그린다.
   */
  const sync = () => {
    const now = ctx.playingIds();
    if (now.length !== n) return false;
    if (!now.every((id, i) => id === m.rows[i].profile.id)) return false;
    m = compute();

    for (const r of m.rows) {
      const hd = heads.get(r.profile.id);
      if (!hd) return false;
      hd.scoreEl.textContent = r.score.toLocaleString('ko-KR');
      hd.rankEl.textContent = rankText(r);
      hd.rankEl.classList.toggle('is-first', isTop(r));
      hd.rankEl.classList.toggle('is-last', isLast(r));
      hd.btn.classList.toggle('is-lead', isTop(r));
      // 첫 기록이 들어오면 순위 배지가 그제서야 생긴다
      if (showRank() && !hd.rankEl.isConnected) hd.top.prepend(hd.rankEl);
      else if (!showRank() && hd.rankEl.isConnected) hd.rankEl.remove();

      for (const grade of grades) {
        const c = cells.get(`${r.profile.id}:${grade.id}`);
        if (!c) return false;
        const count = r.session.counts?.[grade.id] ?? 0;
        const unit = scoreFor(gym.scoreTable, r.level, grade);
        // className 을 통째로 덮으면 지금 누르고 있는 is-pressing/is-held 가 날아간다
        c.el.classList.toggle('has-count', count > 0);
        c.el.classList.toggle('is-mylevel', grade.order === r.level);
        c.el.setAttribute('aria-label',
          `${r.profile.name} ${grade.label} ${count}개, 한 개당 ${unit}점`);
        c.unitEl.textContent = `+${unit.toLocaleString('ko-KR')}점`;
        if (count) {
          c.countEl.textContent = String(count);
          if (!c.countEl.isConnected) c.body.prepend(c.countEl);
        } else if (c.countEl.isConnected) {
          c.countEl.remove();
        }
      }
    }
    return true;
  };
  ctx.setLiveSync(sync);

  return h('section', { class: 'section' },
    eyebrow('오늘의 기록'),
    roster,
    // 사람 수를 CSS 에 알린다. 좁을 때 무엇을 접을지는 CSS 가 정한다.
    h('div', { class: `grid${n >= 4 ? ' is-tight' : ''}`, 'data-people': String(n) },
      head, body),
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

