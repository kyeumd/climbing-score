/** 과거 세션 편집 (설계서 7.3절). 잘못 기록한 날을 고치는 유일한 경로. */
import { h, button, modal } from './components.js';
import { hold } from './hold.js';
import { allGrades } from '../domain/gym.js';
import { scoreFor } from '../domain/scoring.js';
import { scoreOf } from '../domain/session.js';

export function openSessionEditor(session, gym, ctx) {
  const { actions } = ctx;
  let draft = { ...session, counts: { ...session.counts } };

  const totalEl = h('strong', { class: 'num' }, '');
  const rows = h('ul', { class: 'editlist' });

  const redraw = () => {
    totalEl.textContent = `${scoreOf(draft, gym).toLocaleString('ko-KR')}점`;
    rows.replaceChildren(...allGrades(gym).map((grade) => {
      const count = draft.counts[grade.id] ?? 0;
      if (grade.retired && count === 0) return h('li', { style: { display: 'none' } });
      const unit = scoreFor(gym.scoreTable, draft.levelAtTime, grade);
      return h('li', { class: 'editrow' },
        hold(grade, { size: 20, bolt: false }),
        h('span', { class: 'editrow__label' },
          grade.label,
          grade.retired && h('span', { class: 'hint' }, ' (더 이상 안 씀)'),
        ),
        h('span', { class: 'hint num' }, `${unit.toLocaleString('ko-KR')}점`),
        h('input', {
          class: 'field field--xs num', type: 'number', min: 0, value: count,
          'aria-label': `${grade.label} 완등 수`,
          onchange: (e) => {
            const v = Math.max(0, Number(e.target.value) || 0);
            if (v === 0) delete draft.counts[grade.id];
            else draft.counts[grade.id] = v;
            e.target.value = v;
            redraw();
          },
        }),
      );
    }));
  };

  const body = h('div', {},
    h('div', { class: 'fieldrow', style: { marginBottom: '0.75rem' } },
      h('label', { class: 'dial' },
        h('span', { class: 'dial__label' }, '날짜'),
        h('input', {
          class: 'field field--sm num', type: 'date', value: draft.date,
          onchange: (e) => { draft.date = e.target.value || draft.date; },
        }),
      ),
      h('label', { class: 'dial' },
        h('span', { class: 'dial__label' }, '그날의 레벨'),
        h('input', {
          class: 'field field--sm num', type: 'number', min: 0, value: draft.levelAtTime,
          onchange: (e) => {
            draft.levelAtTime = Math.max(0, Number(e.target.value) || 0);
            e.target.value = draft.levelAtTime;
            redraw();
          },
        }),
      ),
    ),
    h('p', { class: 'hint', style: { marginBottom: '0.75rem' } },
      '이 세션 점수만 다시 계산돼요.'),
    rows,
    h('div', { class: 'editfoot' },
      h('span', {}, '합계 ', totalEl),
      h('div', { class: 'btnrow' },
        button('삭제', {
          onClick: () => {
            if (confirm('이 세션을 지웁니다. 계속할까요?')) {
              actions.deleteSession(draft.id);
              sheet.close();
            }
          }, small: true,
        }),
        button('저장', {
          onClick: () => { actions.saveSession(draft); sheet.close(); },
          variant: 'solid', small: true, trailing: 'check',
        }),
      ),
    ),
  );

  const sheet = modal('기록 수정', body);
  redraw();
}
