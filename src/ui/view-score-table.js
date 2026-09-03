/** 점수표 편집 (설계서 5.2절). 공식으로 채우고, 마음에 안 드는 칸만 고친다. */
import { h, panel, button, eyebrow } from './components.js';
import { levelLabel } from '../domain/text.js';
import { hold } from './hold.js';
import { activeGrades } from '../domain/gym.js';
import { buildMatrix, overrideKey, DEFAULT_SCORE_TABLE, LIMITS, clampTable } from '../domain/scoring.js';

export function viewScoreTable(ctx, gymId) {
  const { state, actions } = ctx;
  const gym = state.gyms.find((g) => g.id === gymId);
  if (!gym) return h('div', {}, '클라이밍장을 찾을 수 없어요.');

  const grades = activeGrades(gym);
  const table = clampTable(gym.scoreTable);

  if (grades.length === 0) {
    return h('div', { class: 'view' },
      h('div', { class: 'viewhead' },
        button('뒤로', { onClick: () => actions.openGymSettings(gymId), variant: 'ghost', small: true }),
        h('h1', { class: 'title' }, '점수표'),
      ),
      panel(h('p', { class: 'subtitle' }, '난이도 색이 없어요.')),
    );
  }

  return h('div', { class: 'view' },
    h('div', { class: 'viewhead' },
      button('뒤로', { onClick: () => actions.openGymSettings(gymId), variant: 'ghost', small: true }),
      h('h1', { class: 'title' }, '점수표'),
    ),

    panel(
      eyebrow('점수 규칙'),
      h('div', { class: 'dials' },
        dial('기준 점수', table.baseScore, 10, LIMITS.baseScore,
          (v) => actions.setScoreTable(gymId, { baseScore: v }),
          `내 레벨과 같은 난이도를 깼을 때 받는 점수 (${LIMITS.baseScore.min}~${LIMITS.baseScore.max.toLocaleString('ko-KR')})`),
        dial('어려울 때 배율', table.upFactor, 0.1, LIMITS.upFactor,
          (v) => actions.setScoreTable(gymId, { upFactor: v }),
          `한 단계 위 문제마다 곱하는 값 (${LIMITS.upFactor.min}~${LIMITS.upFactor.max})`),
        dial('쉬울 때 배율', table.downFactor, 0.05, LIMITS.downFactor,
          (v) => actions.setScoreTable(gymId, { downFactor: v }),
          `한 단계 아래 문제마다 곱하는 값 (${LIMITS.downFactor.min}~${LIMITS.downFactor.max})`),
      ),
    ),

    h('div', { class: 'section' },
      panel(
        h('div', { class: 'section-head', style: { marginBottom: '0.5rem' } },
          eyebrow('레벨 × 난이도'),
          Object.keys(table.overrides ?? {}).length > 0 && button('공식으로 초기화', {
            onClick: () => actions.setScoreTable(gymId, { overrides: {} }), small: true,
          }),
        ),
        matrixTable(buildMatrix(table, grades), grades, gymId, actions),
      ),
    ),
  );
}

function dial(label, value, step, range, onChange, hint) {
  return h('label', { class: 'dial' },
    h('span', { class: 'dial__label' }, label),
    h('input', {
      class: 'field field--sm num', type: 'number', value, step,
      min: range.min, max: range.max, 'aria-label': label,
      'data-fkey': `dial:${label}`,
      onchange: (e) => {
        const raw = Number(e.target.value);
        // 범위를 벗어난 값은 조용히 삼키지 않고 가장 가까운 유효값으로 되돌린다
        const v = Number.isFinite(raw) ? Math.min(range.max, Math.max(range.min, raw)) : value;
        e.target.value = v;
        onChange(v);
      },
    }),
    h('span', { class: 'hint' }, hint),
  );
}

function matrixTable(rows, grades, gymId, actions) {
  return h('div', {
    class: 'matrixwrap', tabindex: '0', role: 'group', 'aria-label': '레벨별 난이도 점수표',
  },
    h('table', { class: 'matrix num' },
      h('thead', {},
        h('tr', {},
          h('th', { scope: 'col', class: 'matrix__corner' },
            h('span', { 'aria-hidden': 'true' }, '레벨 ↓'),
            h('span', { 'aria-hidden': 'true' }, '난이도 →'),
            h('span', { class: 'sr-only' }, '내 레벨과 문제 난이도')),
          grades.map((g) => h('th', { scope: 'col', title: g.label },
            h('span', { class: 'matrix__head' },
              hold(g, { size: 16, bolt: false }),
              // 도트만으로는 어떤 색인지 알 수 없다. 첫 글자를 함께 보여준다.
              h('span', { 'aria-hidden': 'true' }, g.label.slice(0, 1)),
              h('span', { class: 'sr-only' }, g.label),
            ))),
        ),
      ),
      h('tbody', {},
        rows.map((row) => h('tr', {},
          h('th', { class: 'matrix__lv', scope: 'row' }, levelLabel(row.level)),
          row.cells.map((cell, i) => h('td', {
            class: [
              cell.overridden ? 'is-override' : '',
              row.level === i ? 'is-diagonal' : '',
            ].filter(Boolean).join(' '),
            onclick: () => editCell(cell, row.level, gymId, actions),
            'aria-label': `${levelLabel(row.level)} ${cell.grade.label} ${cell.score}점, 탭하면 수정`,
          }, cell.score.toLocaleString('ko-KR'))),
        )),
      ),
    ),
  );
}

function editCell(cell, level, gymId, actions) {
  const input = prompt(`${levelLabel(level)} × ${cell.grade.label} 점수`, String(cell.score));
  if (input == null) return;
  const v = Number(input);
  if (!Number.isFinite(v) || v < 0) return;
  actions.setOverride(gymId, overrideKey(level, cell.grade.id), Math.round(v));
}
