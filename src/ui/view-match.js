/** 당일 대결 화면 (설계서 7.1절). 앱을 열면 여기가 뜬다. */
import {
  h, panel, button, icon, onPressAndHold, eyebrow, modal, confirmModal, newPersonFields,
} from './components.js';
import { hold } from './hold.js';
import { activeGrades } from '../domain/gym.js';
import { handleTaken } from '../domain/profile.js';
import { scoreFor } from '../domain/scoring.js';
import { josa, levelLabel } from '../domain/text.js';
import { prettyDate } from './date-picker.js';
import { findSession, createSession, scoreOf, sendsOf } from '../domain/session.js';

export function viewMatch(ctx) {
  const { state } = ctx;
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

/* ---------- 참가자 넣고 빼기 ---------- */

/**
 * 점선 + 카드. 격자 머리글의 모서리 칸(난이도 열 위)에 앉는다.
 *
 * 사람을 넣는 버튼은 사람 카드가 늘어선 줄에 있어야 '여기에 하나 더' 로
 * 읽힌다. 모서리는 원래 '난이도' 라는 글자 하나만 있던 자리라 폭을 새로 먹지
 * 않고, 사람이 많아 좁아져도 홀드 열 폭(44px)만큼은 늘 남는다. 오른쪽 끝에
 * 열을 하나 더 내는 방법도 있었지만, 그러면 다섯 명일 때 기록 칸이 그만큼
 * 줄어 '+110점' 이 안 들어간다.
 *
 * 점선은 이 앱에서 '아직 비어 있는 자리' 다(확인 배너·자리 표시와 같은 문법).
 */
function addCard(ctx, { wide = false } = {}) {
  return h('button', {
    class: `grid__add${wide ? ' grid__add--wide' : ''}`, type: 'button',
    'aria-label': '참가자 추가',
    onclick: () => openRosterSheet(ctx),
  },
    icon('plus', { size: 18 }),
    h('span', { class: 'grid__add__label' }, wide ? '참가자 추가' : '참가자'),
  );
}

/**
 * 참가자 시트.
 *
 * 위에는 명단 전원이 칩으로 선다. 채워진 칩이 오늘 격자에 있는 사람이고,
 * 누르면 넣고 뺀다. 아래는 새 사람을 만드는 칸이다 — 만들면 바로 오늘
 * 대결에 서고 칩도 채워진 채 늘어난다. 시트는 닫지 않는다. 암장에서 친구
 * 셋을 한 번에 넣는 일이 잦고, 매번 다시 열게 하면 그만큼 눌러야 한다.
 *
 * 뒤의 격자는 시트를 열어 둔 채로도 그때그때 다시 그려진다. 모달은 #app
 * 바깥에 붙어 있어 render() 가 격자를 부수어도 살아남는다.
 */
function openRosterSheet(ctx) {
  const { state, actions } = ctx;
  const chipOf = new Map();   // profileId -> 칩
  const chips = h('div', { class: 'chips chips--wrap', role: 'group', 'aria-label': '오늘 참가자' });
  const note = h('p', { class: 'hint roster__note' }, '');

  /* 칩을 다시 만들지 않고 상태만 고쳐 쓴다. 통째로 갈아 끼우면 누른 칩에서
     포커스가 떨어진다. */
  const refresh = () => {
    const playing = new Set(ctx.playingIds());
    for (const p of state.profiles) {
      let chip = chipOf.get(p.id);
      if (!chip) {
        chip = h('button', {
          class: 'chip', type: 'button',
          onclick: () => { actions.togglePlaying(p.id); refresh(); },
        }, p.name);
        chipOf.set(p.id, chip);
        chips.append(chip);
      }
      const on = playing.has(p.id);
      chip.setAttribute('aria-pressed', String(on));
      // 마지막 한 명을 빼면 격자가 사라진다. 그 칩은 잠근다.
      chip.disabled = on && playing.size === 1;
    }
    for (const [id, chip] of chipOf) {
      if (!state.profiles.some((p) => p.id === id)) { chip.remove(); chipOf.delete(id); }
    }
    const n = state.profiles.length;
    if (!n) note.textContent = '아직 아무도 없어요. 아래에서 첫 사람을 만들어 주세요.';
    else if (n === 1) note.textContent = '한 명일 때는 뺄 수 없어요. 아래에서 친구를 더 만들어 보세요.';
    else note.textContent = '누르면 오늘 대결에 넣고 빼요. 뺀 사람의 기록은 남아요.';
  };
  refresh();

  const fields = newPersonFields({
    onAdd: (p) => { actions.addProfile(p); refresh(); },
    // 비운 채 다른 데를 눌러도 시트는 그대로 둔다. 칩을 누르러 가는 길일 수 있다.
    onCancel: () => {},
    isTaken: (v) => handleTaken(state.profiles, v),
  });

  modal('참가자',
    h('div', { class: 'roster' },
      h('div', { class: 'roster__now' },
        eyebrow('오늘 같이 하는 사람'),
        chips,
        note,
      ),
      h('div', { class: 'roster__new' },
        eyebrow('새로 만들기'),
        h('p', { class: 'hint', style: { margin: '0.15rem 0 0' } },
          '아이디는 나중에 바꿀 수 없어요. 닉네임을 비우면 아이디를 그대로 써요.'),
        fields,
      ),
    ),
  );
}

/**
 * 사람 카드를 누르면 뜨는 시트. 그 사람에 대한 일만 한다 — 오늘 빼기, 명단에서 지우기.
 * 이름·레벨 고치기는 프로필 화면 몫이다.
 */
function openPersonSheet(ctx, r, n) {
  const { actions } = ctx;
  const p = r.profile;
  const canDrop = n > 1;
  const sheet = modal(p.name,
    h('div', {},
      h('p', { class: 'subtitle', style: { marginBottom: 'var(--sp-4)' } },
        `오늘 ${r.score.toLocaleString('ko-KR')}점 · 완등 ${r.sends}개 · ${levelLabel(r.level)}`),
      h('div', { class: 'btnrow' },
        button('오늘 대결에서 빼기', {
          onClick: () => { sheet.close(); actions.togglePlaying(p.id); },
          variant: 'solid', trailing: 'minus', disabled: !canDrop,
        }),
        button('명단에서 지우기', {
          onClick: () => {
            sheet.close();
            confirmModal({
              title: '참가자 지우기',
              message: `${p.name}${josa(p.name, '과/와')} 그 기록이 모두 지워져요. 되돌릴 수 없어요.`,
              onConfirm: () => actions.deleteProfile(p.id),
            });
          },
          trailing: 'close',
        }),
      ),
      h('p', { class: 'hint', style: { marginTop: 'var(--sp-3)' } },
        canDrop
          ? '빼도 기록은 남아요. 점선 + 를 눌러 다시 넣을 수 있어요.'
          : '혼자일 때는 뺄 수 없어요. 점선 + 를 눌러 친구를 넣어 보세요.'),
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
/** 난이도 칸의 폭. 머리글 모서리의 + 카드도 이 폭을 쓴다. */
function firstCol(n) {
  // 넷부터는 홀드 하나 폭까지 줄인다. 다만 모서리에 + 카드가 앉으므로 손가락 기준(44px) 아래로는 안 내려간다.
  return n >= 4 ? 44 : n === 3 ? 72 : 84;
}

function tpl(n) {
  /*
   * 사람이 늘면 난이도 칸부터 줄인다.
   *
   * 360px 에 다섯 명이면 기록 칸이 58px 까지 눌린다. 그 폭에 개수와 '+34점'
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
    // 아무도 없을 때도 같은 점선 카드다. 첫 사람도 같은 시트에서 만든다.
    return h('section', { class: 'section' },
      panel(
        eyebrow('참가자 없음'),
        h('h2', { class: 'title', style: { margin: '0.4rem 0 0.35rem' } }, '누가 오늘 같이 하나요'),
        h('p', { class: 'subtitle', style: { marginBottom: '1rem' } },
          '사람을 넣으면 여기에서 바로 완등을 기록할 수 있어요.'),
        addCard(ctx, { wide: true }),
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
  const cols = tpl(n);
  const isTop = (r) => n > 1 && m.rankOf.get(r.profile.id) === 1 && r.score > 0;
  // 0점인 사람만 배지를 빼면 그 칸만 모양이 달라진다.
  // 아무도 기록이 없을 때만 순위를 감춘다.
  const showRank = () => n > 1 && m.lead > 0;
  /*
   * 꼴등.
   *
   * 점수가 가장 낮은 사람. 다만 아무도 기록이 없거나 전원 동점이면 꼴등이
   * 아니라 그냥 시작 전이므로 붙이지 않는다. 내기 앱에서 1등만 표시하면
   * 재미가 반이다.
   */
  const isLast = (r) => n > 1 && m.lead > 0
    && r.score === m.ordered[m.ordered.length - 1].score
    && r.score < m.lead;
  const rankText = (r) => (isLast(r) ? '꼴등' : `${m.rankOf.get(r.profile.id)}위`);

  // 고쳐 쓸 노드를 들고 있는다. 다시 찾느라 DOM 을 훑지 않는다.
  const heads = new Map();   // profileId -> { btn, top, rankEl, scoreEl }
  const cells = new Map();   // `${profileId}:${gradeId}` -> { el, body, countEl, unitEl }

  const head = h('div', { class: 'grid__head', style: { gridTemplateColumns: cols } },
    addCard(ctx),
    m.rows.map((r) => {
      const rankEl = h('span', {
        class: `grid__rank num${isTop(r) ? ' is-first' : ''}${isLast(r) ? ' is-last' : ''}`,
      }, rankText(r));
      const scoreEl = h('span', { class: 'grid__score num' }, r.score.toLocaleString('ko-KR'));
      const top = h('span', { class: 'grid__top' },
        showRank() ? rankEl : null,
        h('span', { class: 'grid__name' }, r.profile.name),
      );
      /*
       * 사람 카드는 버튼이다. 누르면 그 사람의 시트가 뜬다 — 오늘 빼기, 지우기.
       * 기록 칸과 같은 문법(선 두른 상자 = 누를 수 있다)이라 따로 알릴 것이 없다.
       */
      const btn = h('button', {
        class: `grid__person${isTop(r) ? ' is-lead' : ''}`, type: 'button',
        title: `${r.profile.name} — 눌러서 빼기·지우기`,
        onclick: () => openPersonSheet(ctx, heads.get(r.profile.id).row, n),
      }, top, scoreEl, h('span', { class: 'hint num' }, levelLabel(r.level)));
      heads.set(r.profile.id, { btn, top, rankEl, scoreEl, row: r });
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
      hd.row = r;   // 사람 시트가 최신 점수를 읽도록
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
