/** 당일 대결 화면 (설계서 7.1절). 앱을 열면 여기가 뜬다. */
import { h, panel, button, icon, onPressAndHold, eyebrow, dangerButton, editableText } from './components.js';
import { hold } from './hold.js';
import { activeGrades } from '../domain/gym.js';
import { MAX_LEVEL } from '../domain/profile.js';
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
function tpl(n) {
  /*
   * 사람이 늘면 난이도 칸부터 줄인다.
   *
   * 360px 에 다섯 명이면 기록 칸이 50px 까지 눌린다. 그 폭에 개수와 '+34점'
   * 이 함께 들어가야 한다. 반면 난이도 칸은 색 이름(25px)을 안 그리면
   * 홀드 하나면 충분하다 — 그래서 네 명부터는 이름을 접고(아래 is-tight)
   * 칸을 홀드 크기까지 줄인다.
   */
  const first = n >= 4 ? 34 : n === 3 ? 72 : 84;
  return `minmax(${first}px, ${n >= 4 ? 0 : 1}fr) repeat(${n}, minmax(0, 1fr))`;
}

/**
 * 참가자를 전환하며 기록하면 사람 수만큼 탭이 늘어난다. 3명이 각자 5개를
 * 깼으면 전환 6번 + 탭 15번이다. 격자로 두면 전환 없이 15번으로 끝난다.
 *
 * 세로는 난이도, 가로는 참가자. 각 칸을 탭하면 그 사람의 그 난이도가 +1.
 */
/*
 * 이름 받는 칸.
 *
 * 엔터를 치면 그 사람이 붙고 칸은 비워진 채 남는다. 이름·엔터·이름·엔터로
 * 몇 명이든 이어 붙일 수 있다. 비운 채 엔터나 Esc, 또는 다른 데를 누르면 닫힌다.
 *
 * data-fkey 를 달아 두면 render() 가 다시 그린 뒤 포커스를 되돌려 준다.
 * 한 명 붙일 때마다 화면 전체가 다시 그려지므로, 없으면 매번 키보드가 내려간다.
 */
function nameField(actions, extraClass = '') {
  return h('input', {
    class: `field grid__new${extraClass ? ' ' + extraClass : ''}`, type: 'text',
    placeholder: '이름', 'aria-label': '참가자 이름',
    autocomplete: 'off', enterkeyhint: 'done', 'data-fkey': 'new-profile',
    onkeydown: (e) => {
      if (e.key === 'Escape') { actions.stopAddProfile(); return; }
      if (e.key !== 'Enter') return;
      /*
       * 한글 IME 는 마지막 글자를 조합하는 중이다. 그 상태에서 누른 엔터는
       * '조합 확정' 이지 '입력 완료' 가 아니고, keydown 은 isComposing: true 로
       * 온다(옛 브라우저는 keyCode 229). 이걸 그냥 처리하면 아직 덜 만들어진
       * 값으로 사람을 붙이고, 브라우저가 뒤이어 확정한 마지막 글자는 새로
       * 비워진 칸에 떨어져 또 한 명이 된다 — "이름 마지막 글자가 쪼개져서
       * 추가로 만들어지는" 게 이것이다. 확정 뒤에 오는 엔터만 받는다.
       */
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      const v = e.target.value.trim();
      if (v) actions.addProfile(v);
      else actions.stopAddProfile();
    },
    onblur: (e) => { if (!e.target.value.trim()) actions.stopAddProfile(); },
  });
}

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
        h('p', { class: 'subtitle', style: { marginBottom: '1rem' } },
          '참가자를 추가하면 여기에서 바로 완등을 기록할 수 있어요.'),
        state.ui.adding
          ? h('div', {},
              nameField(actions, 'grid__new--wide'),
              h('p', { class: 'hint', style: { marginTop: '0.5rem' } },
                '이름을 적고 엔터. 계속 이어서 넣을 수 있어요.'))
          : button('참가자 추가', { onClick: actions.startAddProfile, variant: 'solid', trailing: 'plus' }),
      ),
    );
  }

  /*
   * 줄별 점수와 순위를 지금 상태에서 다시 센다.
   * 처음 그릴 때와 나중에 고쳐 쓸 때가 같은 값을 봐야 하므로 한 곳에 둔다.
   */
  const compute = () => {
    // 열 순서는 참가자 추가 순서로 고정한다
    const rows = state.profiles.map((profile) => {
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
  const footText = () => {
    const [a, b] = m.ordered;
    if (m.lead > 0 && m.lead > (b?.score ?? 0)) {
      return `${a.profile.name}${josa(a.profile.name, '이/가')} `
        + `${(m.lead - b.score).toLocaleString('ko-KR')}점 앞서고 있어요.`;
    }
    return m.lead > 0 ? '동점예요.' : '아직 기록이 없어요.';
  };

  // 고쳐 쓸 노드를 들고 있는다. 다시 찾느라 DOM 을 훑지 않는다.
  const heads = new Map();   // profileId -> { btn, top, rankEl, scoreEl }
  const cells = new Map();   // `${profileId}:${gradeId}` -> { el, body, countEl, unitEl }

  /*
   * 명단 편집.
   *
   * 이름·레벨·빼기를 한 줄에 두려면 44px 짜리 −/+ 두 개가 들어갈 폭이 있어야
   * 하는데, 격자 머리글은 3명만 되어도 한 칸이 78px 이라 어림없다.
   * 그래서 편집하는 동안만 격자 위에 전체 폭 명단을 편다. 여기서 사람을
   * 붙이고, 이름을 고치고, 레벨을 올리고, 뺀다. 시트는 하나도 뜨지 않는다.
   */
  const roster = adding ? h('section', { class: 'roster' },
    h('p', { class: 'hint' }, '이름을 적고 엔터. 레벨은 −/+ 로 맞춰요.'),
    h('ul', { class: 'roster__list' }, m.rows.map((r) => {
      const step = (d) => () => {
        const next = Math.min(MAX_LEVEL, Math.max(0, r.level + d));
        if (next !== r.level) actions.setLevel(r.profile.id, next);
      };
      return h('li', { class: 'roster__row' },
        editableText({
          value: r.profile.name,
          label: `이름 (${r.profile.name})`,
          fkey: `roster-name:${r.profile.id}`,
          onCommit: (v) => actions.renameProfile(r.profile.id, v),
        }),
        h('span', { class: 'stepper' },
          h('button', {
            class: 'stepper__btn', type: 'button',
            'aria-label': `${r.profile.name} 레벨 낮추기`, onclick: step(-1),
          }, icon('minus', { size: 16 })),
          h('span', { class: 'roster__lv num' }, levelLabel(r.level)),
          h('button', {
            class: 'stepper__btn', type: 'button',
            'aria-label': `${r.profile.name} 레벨 올리기`, onclick: step(+1),
          }, icon('plus', { size: 16 })),
        ),
        dangerButton({
          className: 'iconbtn',
          label: `${r.profile.name} 빼기`,
          armedLabel: `한 번 더 누르면 ${r.profile.name}${josa(r.profile.name, '이/가')} 빠져요`
            + (r.sends ? ` (오늘 기록 ${r.sends}개도 함께)` : ''),
          onConfirm: () => actions.dropProfile(r.profile.id),
        }),
      );
    })),
    nameField(actions, 'roster__new'),
    h('div', { class: 'roster__foot' },
      button('완료', { onClick: () => actions.stopAddProfile(), variant: 'solid', small: true, trailing: 'check' }),
    ),
  ) : null;

  const head = h('div', { class: 'grid__head', style: { gridTemplateColumns: cols } },
    h('span', { class: 'grid__corner hint' }, '난이도'),
    m.rows.map((r) => {
      const rankEl = h('span', { class: `grid__rank num${isTop(r) ? ' is-first' : ''}` },
        `${m.rankOf.get(r.profile.id)}위`);
      const scoreEl = h('span', { class: 'grid__score num' }, r.score.toLocaleString('ko-KR'));
      const top = h('span', { class: 'grid__top' },
        showRank() ? rankEl : null,
        h('span', { class: 'grid__name' }, r.profile.name),
      );
      const btn = h('button', {
        class: `grid__person${isTop(r) ? ' is-lead' : ''}`,
        // 값 하나(레벨) 때문에 시트를 열지 않는다. 명단 편집을 그 자리에 편다.
        type: 'button', onclick: () => actions.startAddProfile(),
        title: `${r.profile.name} — 눌러서 이름·레벨 고치기`,
      }, top, scoreEl, h('span', { class: 'hint num' }, levelLabel(r.level)));
      heads.set(r.profile.id, { btn, top, rankEl, scoreEl });
      // 빼기는 명단 편집에서 한다. 여기 얹어 두면 기록하다가 잘못 눌러
      // 사람이 사라지고, 작게 두면 손가락이 닿지 않는다.
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

  const foot = n > 1
    ? h('p', { class: 'hint', style: { marginTop: 'var(--sp-3)' } }, footText())
    : null;

  /*
   * 개수가 바뀌었을 때 부수지 않고 고쳐 쓴다.
   *
   * 구조(참가자 목록·난이도)가 그대로일 때만 맡는다. 달라졌으면 false 를
   * 돌려주고, 그때는 app.js 가 평소대로 전부 다시 그린다.
   */
  const sync = () => {
    if (state.profiles.length !== n) return false;
    if (!state.profiles.every((p, i) => p.id === m.rows[i].profile.id)) return false;
    m = compute();

    for (const r of m.rows) {
      const hd = heads.get(r.profile.id);
      if (!hd) return false;
      hd.scoreEl.textContent = r.score.toLocaleString('ko-KR');
      hd.rankEl.textContent = `${m.rankOf.get(r.profile.id)}위`;
      hd.rankEl.classList.toggle('is-first', isTop(r));
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
    if (foot) foot.textContent = footText();
    return true;
  };
  ctx.setLiveSync(sync);

  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('div', {},
        eyebrow('오늘의 기록'),
        // 칸에 '+34점' 이 함께 뜨므로, 탭이 올리는 게 개수라는 걸 못 박아 준다
        h('p', { class: 'hint', style: { marginTop: '0.3rem' } }, '탭하면 완등 +1, 길게 누르면 −1'),
      ),
      button('참가자 추가', { onClick: actions.startAddProfile, small: true, trailing: 'plus' }),
    ),
    roster,
    // 사람 수를 CSS 에 알린다. 좁을 때 무엇을 접을지는 CSS 가 정한다.
    h('div', { class: `grid${n >= 4 ? ' is-tight' : ''}`, 'data-people': String(n) },
      head, body),
    foot,
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

