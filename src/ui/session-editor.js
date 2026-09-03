/** 과거 세션 편집 (설계서 7.3절). 잘못 기록한 날을 고치는 유일한 경로. */
import { h, button, icon, modal } from './components.js';
import { hold } from './hold.js';
import { allGrades } from '../domain/gym.js';
import { scoreFor } from '../domain/scoring.js';
import { scoreOf } from '../domain/session.js';
import { openDatePicker, prettyDate } from './date-picker.js';

export function openSessionEditor(session, gym, ctx) {
  const { actions } = ctx;
  let draft = { ...session, counts: { ...session.counts } };

  const totalEl = h('strong', { class: 'num' }, '');
  const dateEl = h('span', { class: 'num' }, prettyDate(session.date));
  const rows = h('ul', { class: 'editlist' });

  const setCount = (gradeId, next) => {
    const v = Math.max(0, Math.round(next) || 0);
    if (v === 0) delete draft.counts[gradeId];
    else draft.counts[gradeId] = v;
    sync();
  };

  /*
   * 행을 한 번만 만들고, 그 뒤로는 값만 고쳐 쓴다.
   *
   * 예전에는 +/- 를 누를 때마다 replaceChildren 으로 11줄을 통째로 새로
   * 만들었다. 방금 누른 버튼이 그 자리에서 사라지니 포커스가 <body> 로
   * 떨어졌고, 키보드로 개수를 올리던 사람은 한 번 누를 때마다 문서 맨 위로
   * 튕겼다. 기록 격자와 같은 이유, 같은 해법이다.
   */
  const grades = allGrades(gym);
  const refs = new Map();

  rows.replaceChildren(...grades.map((grade) => {
    const unitEl = h('span', { class: 'hint num' }, '');
    const input = h('input', {
      class: 'field field--xs num', type: 'number', min: 0, value: 0,
      'aria-label': `${grade.label} 완등 수`,
      onchange: (e) => { setCount(grade.id, Number(e.target.value) || 0); },
    });
    const li = h('li', { class: 'editrow' },
      hold(grade, { size: 20, bolt: false }),
      h('span', { class: 'editrow__label' },
        grade.label,
        grade.retired && h('span', { class: 'hint' }, ' (더 이상 안 씀)'),
      ),
      unitEl,
      // 11개 행을 전부 키보드로 치게 하면 번거롭다. 옆에 증감을 둔다.
      h('span', { class: 'stepper' },
        h('button', {
          class: 'stepper__btn', type: 'button', 'aria-label': `${grade.label} 하나 빼기`,
          onclick: () => { setCount(grade.id, (draft.counts[grade.id] ?? 0) - 1); },
        }, icon('minus', { size: 16 })),
        input,
        h('button', {
          class: 'stepper__btn', type: 'button', 'aria-label': `${grade.label} 하나 더하기`,
          onclick: () => { setCount(grade.id, (draft.counts[grade.id] ?? 0) + 1); },
        }, icon('plus', { size: 16 })),
      ),
    );
    refs.set(grade.id, { li, input, unitEl });
    return li;
  }));

  const sync = () => {
    totalEl.textContent = `${scoreOf(draft, gym).toLocaleString('ko-KR')}점`;
    for (const grade of grades) {
      const { li, input, unitEl } = refs.get(grade.id);
      const count = draft.counts[grade.id] ?? 0;
      // 은퇴한 색은 그날 기록이 남아 있을 때만 보인다
      li.hidden = grade.retired && count === 0;
      unitEl.textContent =
        `${scoreFor(gym.scoreTable, draft.levelAtTime, grade).toLocaleString('ko-KR')}점`;
      // 사람이 직접 치는 중이면 건드리지 않는다. 커서가 튄다.
      if (document.activeElement !== input) input.value = String(count);
    }
  };

  const body = h('div', {},
    h('div', { class: 'fieldrow', style: { marginBottom: '0.75rem' } },
      h('div', { class: 'dial' },
        h('span', { class: 'dial__label' }, '날짜'),
        // 네이티브 달력은 기기마다 다르게 뜬다. 기록 화면과 같은 시트를 쓴다.
        h('button', {
          class: 'field field--btn', type: 'button',
          onclick: () => openDatePicker(ctx, {
            value: draft.date,
            onPick: (iso) => { draft.date = iso; dateEl.textContent = prettyDate(iso); },
          }),
        }, dateEl),
      ),
      h('label', { class: 'dial' },
        h('span', { class: 'dial__label' }, '그날의 레벨'),
        h('input', {
          class: 'field field--sm num', type: 'number', min: 0, value: draft.levelAtTime,
          onchange: (e) => {
            draft.levelAtTime = Math.max(0, Number(e.target.value) || 0);
            e.target.value = draft.levelAtTime;
            sync();
          },
        }),
      ),
    ),
    rows,
    h('div', { class: 'editfoot' },
      h('span', {}, '합계 ', totalEl),
      h('div', { class: 'btnrow' },
        button('삭제', {
          onClick: () => {
            if (confirm('이 날 기록을 지울까요? 되돌릴 수 없어요.')) {
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
  sync();
}
