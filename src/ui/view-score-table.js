/**
 * 점수표 편집 (설계서 5.2절). 공식으로 채우고, 마음에 안 드는 칸만 고친다.
 *
 * 고치는 즉시 반영하지 않는다. 여기서 만지는 값은 그 짐의 모든 점수를 다시
 * 세게 하므로, 슬라이더를 스치기만 해도 지난 기록의 점수가 통째로 달라진다.
 * 되돌릴 길이 없으면 만지기가 무섭다. 초안으로 고치고 저장할 때 반영한다.
 */
import { h, clear, panel, button, eyebrow, promptModal } from './components.js';
import { levelLabel } from '../domain/text.js';
import { hold } from './hold.js';
import { activeGrades } from '../domain/gym.js';
import { buildMatrix, overrideKey, LIMITS, clampTable } from '../domain/scoring.js';

export function viewScoreTable(ctx, gymId) {
  const { state, actions } = ctx;
  const gym = state.gyms.find((g) => g.id === gymId);
  if (!gym) return h('div', {}, '클라이밍장을 찾을 수 없어요.');

  const grades = activeGrades(gym);
  const saved = clampTable(gym.scoreTable);
  /* 초안. 저장을 누르기 전까지 짐은 손대지 않는다. */
  let draft = { ...saved, overrides: { ...(saved.overrides ?? {}) } };

  const back = () => actions.openGymSettings(gymId);

  if (grades.length === 0) {
    return h('div', { class: 'view' },
      h('div', { class: 'viewhead' },
        button('뒤로', { onClick: back, variant: 'ghost', small: true }),
        h('h1', { class: 'title' }, '점수표'),
      ),
      panel(h('p', { class: 'subtitle' }, '난이도 색이 없어요.')),
    );
  }

  /* ---- 머리: 취소와 저장. 표가 길어 스크롤하므로 위에 붙여 둔다 ---- */
  const saveBtn = button('저장', {
    variant: 'solid', small: true, trailing: 'check',
    onClick: () => { actions.saveScoreTable(gymId, draft); },
  });
  const mark = h('span', { class: 'scorehead__mark hint' }, '');

  const isDirty = () => JSON.stringify(draft) !== JSON.stringify(saved);
  const refreshHead = () => {
    const dirty = isDirty();
    saveBtn.disabled = !dirty;
    mark.textContent = dirty ? '아직 저장 안 됨' : '';
  };

  const head = h('div', { class: 'viewhead scorehead' },
    button('취소', { onClick: back, variant: 'ghost', small: true }),
    h('h1', { class: 'title' }, '점수표'),
    h('div', { class: 'scorehead__right' }, mark, saveBtn),
  );

  /* ---- 표. 값이 바뀔 때마다 여기만 다시 그린다 ---- */
  const matrixHost = h('div', {});
  const resetBtn = button('공식으로 초기화', {
    small: true,
    onClick: () => { draft = { ...draft, overrides: {} }; repaint(); },
  });

  function repaint() {
    clear(matrixHost);
    matrixHost.append(matrixTable(buildMatrix(draft, grades), grades, (cell, level) => {
      promptModal({
        title: '점수 고치기',
        label: `${levelLabel(level)} × ${cell.grade.label}`,
        value: cell.score,
        onCommit: (v) => {
          draft = {
            ...draft,
            overrides: { ...draft.overrides, [overrideKey(level, cell.grade.id)]: v },
          };
          repaint();
        },
      });
    }));
    resetBtn.hidden = Object.keys(draft.overrides ?? {}).length === 0;
    refreshHead();
  }

  const set = (patch) => { draft = { ...draft, ...patch }; paintFloor(); repaint(); };

  /* ---- 쉬운 문제 한꺼번에 눕히기 ---- */
  const floorOn = () => draft.floorFrom != null;
  const floorBox = h('div', {});
  /*
   * 눕힌 점수가 몇 개 모이면 기준 하나가 되는지 적어 준다.
   *
   * 1점씩 주면 쉬운 것 열 개가 기준 난이도 하나와 같아진다. 그러면 '쉬운 건
   * 안 센다' 는 뜻이 무너지는데, 숫자만 봐서는 그게 안 보인다. 여기서 말해 준다.
   */
  const floorNote = () => {
    if (draft.floorScore <= 0) {
      return '눕힌 문제는 점수에 들어가지 않아요. 깬 개수는 그대로 남아요.';
    }
    const many = Math.ceil(draft.baseScore / draft.floorScore);
    return `지금 설정이면 눕힌 문제 ${many.toLocaleString('ko-KR')}개가 기준 난이도 1개와 같아요.`
      + (many <= 20 ? ' 쉬운 것만 잔뜩 깨서 따라잡을 수 있어요.' : '');
  };
  const paintFloor = () => {
    clear(floorBox);
    if (!floorOn()) return;
    floorBox.append(
      h('div', { class: 'dials' },
        dial('몇 단계 아래부터', draft.floorFrom, 1, LIMITS.floorFrom,
          (v) => set({ floorFrom: v }),
          '내 레벨보다 이만큼 아래인 난이도부터 눕혀요'),
        dial('눕힌 뒤 점수', draft.floorScore, 1, LIMITS.floorScore,
          (v) => set({ floorScore: v }),
          '눕힌 난이도를 몇 점으로 칠지'),
      ),
      h('p', { class: 'hint floornote' }, floorNote()),
    );
  };

  const floorToggle = h('label', { class: 'toggle' },
    h('input', {
      type: 'checkbox', checked: floorOn(),
      onchange: (e) => {
        draft = e.target.checked
          ? { ...draft, floorFrom: draft.floorFrom ?? 2, floorScore: draft.floorScore ?? 0 }
          : { ...draft, floorFrom: null };
        paintFloor();
        repaint();
      },
    }),
    h('span', {}, '켜기'),
  );

  paintFloor();
  repaint();

  return h('div', { class: 'view' },
    head,

    panel(
      eyebrow('점수 규칙'),
      h('div', { class: 'dials' },
        dial('기준 점수', draft.baseScore, 10, LIMITS.baseScore,
          (v) => set({ baseScore: v }),
          `내 레벨과 같은 난이도를 깼을 때 받는 점수 (${LIMITS.baseScore.min}~${LIMITS.baseScore.max.toLocaleString('ko-KR')})`),
        dial('어려울 때 배율', draft.upFactor, 0.1, LIMITS.upFactor,
          (v) => set({ upFactor: v }),
          `한 단계 위 문제마다 곱하는 값 (${LIMITS.upFactor.min}~${LIMITS.upFactor.max})`),
        dial('쉬울 때 배율', draft.downFactor, 0.05, LIMITS.downFactor,
          (v) => set({ downFactor: v }),
          `한 단계 아래 문제마다 곱하는 값 (${LIMITS.downFactor.min}~${LIMITS.downFactor.max})`),
      ),
    ),

    h('div', { class: 'section' },
      panel(
        h('div', { class: 'section-head', style: { marginBottom: '0.5rem' } },
          eyebrow('쉬운 문제 한꺼번에'),
          floorToggle,
        ),
        h('p', { class: 'hint', style: { margin: '0 0 0.5rem' } },
          '이제 쉬운 단계를 세지 않으려면 칸을 하나씩 고칠 필요 없이 여기서 한 번에 정해요. 레벨이 올라가면 눕는 범위도 같이 따라와요.'),
        floorBox,
      ),
    ),

    h('div', { class: 'section' },
      panel(
        h('div', { class: 'section-head', style: { marginBottom: '0.5rem' } },
          eyebrow('레벨 × 난이도'),
          resetBtn,
        ),
        matrixHost,
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

function matrixTable(rows, grades, onEdit) {
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
            onclick: () => onEdit(cell, row.level),
            'aria-label': `${levelLabel(row.level)} ${cell.grade.label} ${cell.score}점, 탭하면 수정`,
          }, cell.score.toLocaleString('ko-KR'))),
        )),
      ),
    ),
  );
}
