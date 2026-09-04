/** 통계 — 짐별로만 본다. 짐 간 합산은 하지 않는다 (설계서 5.4절). */
import { h, panel, button, eyebrow } from './components.js';
import { gymStats } from '../domain/session.js';
import { headToHead } from '../domain/match.js';
import { sortGyms } from '../domain/gym.js';
import { openSessionEditor } from './session-editor.js';
import { hold } from './hold.js';

export function viewStats(ctx) {
  const { state, actions } = ctx;
  const profile = state.profiles.find((p) => p.id === state.ui.profileId);
  const gym = state.gyms.find((g) => g.id === state.ui.gymId);

  if (!profile || !gym) {
    return h('div', { class: 'view' },
      // 탭으로 들어온 화면이라 '뒤로'는 갈 곳이 없다
      h('div', { class: 'viewhead' }, h('h1', { class: 'title' }, '기록')),
      panel(
        eyebrow('아직 기록 없음'),
        h('h2', { class: 'title', style: { margin: '0.5rem 0 0.35rem' } }, '완등 기록을 남겨 볼까요?'),
        h('p', { class: 'subtitle', style: { marginBottom: '1rem' } },
          !gym ? '클라이밍장을 고르고 완등을 기록하면 여기에 점수 추이가 쌓여요.'
               : '프로필을 만들고 완등을 기록하면 여기에 점수 추이가 쌓여요.'),
        h('div', { class: 'btnrow' },
          !gym && button('클라이밍장 고르기', {
            onClick: actions.openGymPicker, variant: 'solid', trailing: 'next',
          }),
          !profile && button('프로필 만들기', {
            onClick: actions.openNewProfile, variant: gym ? 'solid' : '', trailing: 'next',
          }),
        ),
      ),
    );
  }

  const stats = gymStats(state.sessions, gym, profile.id);
  const h2h = headToHead({ sessions: state.sessions, gym, profileId: profile.id, profiles: state.profiles });

  /*
   * 예전에는 등록된 짐 112곳을 전부 칩으로 깔았다. 기록이 있는 곳은 하나뿐인데
   * 나머지 109개를 누르면 빈 화면이 나오고, 정작 지금 보고 있는 짐의 칩은
   * 가로 스크롤 저 너머에 있어 화면에 없었다. 기록이 있는 곳만 남긴다.
   */
  const recorded = new Set(state.sessions.filter((x) => x.profileId === profile.id).map((x) => x.gymId));
  const gyms = sortGyms(state.gyms.filter((g) => !g.archived && (recorded.has(g.id) || g.id === gym.id)));

  return h('div', { class: 'view' },
    h('div', { class: 'viewhead' },
      // 탭으로 들어오는 화면이라 '뒤로'는 갈 곳이 없다. 탭바가 늘 아래에 있다.
      h('h1', { class: 'title' }, '기록'),
    ),

    /*
     * 누구의 기록인지 여기서 고른다.
     *
     * 예전에는 프로필 화면의 행마다 '기록 보기' 버튼을 뒀는데, 다른 탭으로
     * 건너뛰는 버튼이라 무엇을 하는지 읽히지 않았고 그 줄에 컨트롤만 하나
     * 더 늘었다. 고르는 일은 보는 자리에서 하는 게 맞다.
     */
    state.profiles.length > 1 && personChips(state.profiles, profile, actions),

    // 고를 곳이 하나뿐이면 고르는 줄 자체가 필요 없다
    gyms.length > 1 && gymChips(gyms, gym, actions),

    h('div', { class: 'bento' },
      stat('누적 점수', stats.totalScore.toLocaleString('ko-KR'), '점', 'is-wide'),
      stat('세션', stats.sessionCount, '회'),
      stat('완등', stats.totalSends, '개'),
      stat('최고 단계', stats.topGrade?.label ?? '없음', '', 'is-tall', stats.topGrade),
    ),

    h('div', { class: 'section' },
      panel(
        eyebrow('세션별 점수'),
        // 그냥 숨기면 기능이 없는 앱으로 보인다. 왜 아직 없는지 알린다.
        stats.trend.length > 1
          ? sparkline(stats.trend)
          : h('p', { class: 'placeholder-note' },
              '세션이 두 번 이상 쌓이면 점수 추이를 보여드려요.'),
      ),
    ),

    h('div', { class: 'section' },
      panel(
        eyebrow('단계별 완등'),
        h('ul', { class: 'gradebars' },
          stats.gradeTotals.map(({ grade, count }) => {
            const max = Math.max(1, ...stats.gradeTotals.map((t) => t.count));
            return h('li', { class: `gradebar${count === 0 ? ' is-zero' : ''}` },
              hold(grade, { size: 20, bolt: false }),
              h('span', { class: 'gradebar__label' }, grade.label),
              h('span', { class: 'gradebar__track' },
                h('span', {
                  class: 'gradebar__fill',
                  style: { transform: `scaleX(${count / max})`, background: grade.color },
                }),
              ),
              h('span', { class: 'num gradebar__n' }, count),
            );
          }),
        ),
      ),
    ),

    h2h.length > 0 && h('div', { class: 'section' },
      panel(
        eyebrow(`${profile.name}의 대결 전적`),
        h('ul', { class: 'h2hlist' },
          h2h.map((r) => h('li', { class: 'h2hrow' },
            h('span', {}, `vs ${r.profile.name}`),
            h('span', { class: 'num' }, `${r.win}승 ${r.lose}패${r.draw ? ` ${r.draw}무` : ''}`),
          )),
        ),
      ),
    ),

    stats.sessions.length > 0 && h('div', { class: 'section' },
      panel(
        eyebrow('최근 세션'),
        h('p', { class: 'hint', style: { margin: '0.35rem 0 0.5rem' } }, '탭하면 수정할 수 있어요.'),
        h('ul', { class: 'sessionlist' },
          [...stats.sessions].reverse().slice(0, 12).map((session) => {
            const score = stats.trend.find((t) => t.date === session.date)?.score ?? 0;
            return h('li', {
              class: 'sessionrow is-tappable',
              onclick: () => openSessionEditor(session, gym, ctx),
            },
              h('span', { class: 'num hint' }, `${Number(session.date.split('-')[1])}월 ${Number(session.date.split('-')[2])}일`),
              h('span', { class: 'num' }, `${score.toLocaleString('ko-KR')}점`),
            );
          }),
        ),
      ),
    ),
  );
}

/** 지금 보는 짐의 칩이 화면 밖에 있으면 어디를 보고 있는지 알 수 없다 */
function personChips(profiles, current, actions) {
  const row = h('div', { class: 'chips' },
    profiles.map((p) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(p.id === current.id),
      onclick: () => actions.setProfile(p.id),
    }, p.name)),
  );
  return row;
}

function gymChips(gyms, gym, actions) {
  const row = h('div', { class: 'chips' },
    gyms.map((g) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(g.id === gym.id),
      onclick: () => actions.setGym(g.id),
    }, g.name)),
  );
  requestAnimationFrame(() => {
    const on = row.querySelector('[aria-pressed="true"]');
    if (!on || !row.isConnected) return;
    // scrollIntoView 는 페이지까지 움직인다. 이 줄만 옆으로 민다.
    row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
  });
  return row;
}

function stat(label, value, unit, extra = '', grade) {
  return h('div', { class: `bento__cell shell ${extra}` },
    h('div', { class: 'core' },
      h('span', { class: 'hint' }, label),
      h('span', { class: 'bento__value num' },
        grade && hold(grade, { size: 24 }),
        value,
        unit && h('span', { class: 'bento__unit' }, unit),
      ),
    ),
  );
}

/** 인라인 SVG 스파크라인. 차트 라이브러리 없음. */
function sparkline(trend) {
  const W = 320, H = 72, P = 6;
  const scores = trend.map((t) => t.score);
  // 0에 고정하면 세션 간 차이가 눌려 평평해 보인다. 데이터 범위로 스케일하고
  // 실제 최소·최대값을 아래에 함께 적어 과장을 상쇄한다.
  const max = Math.max(...scores, 1);
  const min = Math.min(...scores);
  const span = Math.max(1, max - min);
  const pts = trend.map((t, i) => {
    const x = P + (i / Math.max(1, trend.length - 1)) * (W - P * 2);
    const y = H - P - ((t.score - min) / span) * (H - P * 2);
    return [x, y];
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'spark');
  svg.setAttribute('preserveAspectRatio', 'none');

  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.6');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(line);

  // 마지막 점만 찍으면 앞 세션들이 어디서 꺾이는지 눈으로 찾아야 한다
  pts.forEach(([x, y], i) => {
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    dot.setAttribute('r', i === pts.length - 1 ? '3' : '2');
    dot.setAttribute('fill', 'currentColor');
    if (i !== pts.length - 1) dot.setAttribute('opacity', '0.55');
    svg.append(dot);
  });

  // 값 라벨을 x축 양끝에 두면 "첫 세션 -> 마지막 세션"으로 읽힌다.
  // 실제로는 최저·최고값이므로 그렇게 밝혀 적는다.
  return h('div', { class: 'sparkwrap' }, svg,
    h('div', { class: 'sparkfoot hint num' },
      h('span', {}, trend[0]?.date?.slice(5).replace('-', '.') ?? ''),
      h('span', { class: 'sparkfoot__range' },
        `최저 ${min.toLocaleString('ko-KR')} · 최고 ${max.toLocaleString('ko-KR')}`),
      h('span', {}, trend[trend.length - 1]?.date?.slice(5).replace('-', '.') ?? ''),
    ),
  );
}
