/** 짐 설정 — 난이도 등급 편집. 색 체계 없이는 앱이 성립하지 않으므로 핵심 화면. */
import { h, panel, button, icon, eyebrow, modal } from './components.js';
import { hold, holdShape } from './hold.js';
import { activeGrades } from '../domain/gym.js';

const PALETTE = [
  ['흰색', '#F5F5F5'], ['핑크', '#FF6FA5'], ['빨강', '#E23B34'], ['주황', '#F07C1E'],
  ['노랑', '#F2C41D'], ['연두', '#A8D24A'], ['초록', '#3FA45B'], ['하늘', '#4FB6E8'],
  ['파랑', '#2F7DD1'], ['남색', '#2A3D8F'], ['보라', '#7B4BC4'], ['회색', '#8A8F98'],
  ['갈색', '#7A5230'], ['검정', '#1C1C1E'],
];

export function viewGym(ctx, gymId) {
  const { state, actions } = ctx;
  const gym = state.gyms.find((g) => g.id === gymId);
  if (!gym) {
    return h('div', { class: 'view' },
      h('div', { class: 'viewhead' }, h('h1', { class: 'title' }, '클라이밍장')),
      panel(
        eyebrow('선택 필요'),
        h('h2', { class: 'title', style: { margin: '0.5rem 0 0.35rem' } }, '어느 곳을 설정할까요?'),
        button('클라이밍장 고르기', {
          onClick: actions.openGymPicker, variant: 'solid', trailing: 'next',
        }),
      ),
    );
  }

  // 은퇴한 색은 지난 기록을 세는 데만 쓰인다. 설정 목록에는 두지 않는다.
  const grades = activeGrades(gym);

  return h('div', { class: 'view' },
    h('div', { class: 'viewhead' },
      // 탭으로 들어오는 화면이라 '뒤로'는 갈 곳이 없다. 탭바가 늘 아래에 있다.
      h('h1', { class: 'title' }, gym.name),
    ),

    panel(
      h('div', { class: 'section-head', style: { marginBottom: '0.75rem' } },
        eyebrow('난이도 색'),
        h('label', { class: 'toggle' },
          h('input', {
            type: 'checkbox', checked: gym.gradesVerified,
            onchange: () => actions.setGymVerified(gym.id, !gym.gradesVerified),
          }),
          h('span', {}, '색 목록 확인함'),
        ),
      ),

      gym.gradesSource && !gym.gradesVerified && h('p', { class: 'hint warn' },
        '클라이밍 기록 앱 자료를 참고한 초기값이라 실제와 다를 수 있어요.'),

      h('ul', { class: 'gradelist' },
        grades.map((g, i) => gradeRow(g, i, grades.length, gym, actions))),

      h('div', { class: 'gradeadd' },
        h('p', { class: 'hint', style: { marginBottom: '0.5rem' } }, '색 추가'),
        h('div', { class: 'swatches' },
          PALETTE.map(([label, color], i) => h('button', {
            // 이미 목록에 있는 색이면 그렇게 표시한다. 14개 중 11개가 이미
            // 쓰는 색인데 전부 똑같이 눌러 달라는 모습이었다.
            class: `swatch${gym.grades.some((x) => x.label === label) ? ' is-used' : ''}`,
            type: 'button', title: label,
            'aria-label': `${label} 추가`,
            onclick: () => actions.addGrade(gym.id, { label, color }),
          },
            hold({ label, color, order: i }, { size: 24, bolt: false }),
            h('span', { class: 'swatch__name' }, label))),
        ),
      ),
    ),

    h('div', { class: 'section' },
      panel(
        eyebrow('점수표'),
        button('점수표 열기', {
          onClick: () => actions.openScoreTable(gym.id), trailing: 'next',
        }),
      ),
    ),

    h('div', { class: 'section' },
      panel(
        eyebrow('클라이밍장 정보'),
        h('div', { class: 'fieldrow', style: { marginTop: '0.75rem' } },
          // 값이 채워져 있으면 placeholder가 사라져 무슨 칸인지 알 수 없다
          h('label', { class: 'dial' },
            h('span', { class: 'dial__label' }, '이름'),
            h('input', {
              class: 'field', value: gym.name, 'aria-label': '클라이밍장 이름',
              'data-fkey': 'gym-name',
              onchange: (e) => actions.renameGym(gym.id, e.target.value),
            }),
          ),
          h('label', { class: 'dial' },
            h('span', { class: 'dial__label' }, '자치구'),
            h('input', {
              class: 'field', value: gym.gu ?? '', placeholder: '예: 강남구', 'aria-label': '자치구',
              'data-fkey': 'gym-gu',
              onchange: (e) => actions.setGymGu(gym.id, e.target.value),
            }),
          ),
        ),
      ),
    ),
  );
}

function gradeRow(grade, i, total, gym, actions) {
  return h('li', { class: `graderow${grade.retired ? ' is-retired' : ''}` },
    h('span', { class: 'graderow__order num' }, i + 1),
    h('button', {
      class: 'graderow__dot', type: 'button', 'aria-label': '색 바꾸기',
      onclick: () => pickColor(grade, gym, actions),
    }, hold(grade, { size: 30 })),
    h('input', {
      class: 'graderow__label', value: grade.label, 'aria-label': `${i + 1}단계 이름`,
      'data-fkey': `grade-label:${grade.id}`,
      onchange: (e) => actions.updateGrade(gym.id, grade.id, { label: e.target.value }),
    }),
    h('div', { class: 'graderow__ops' },
      iconBtn('위로', 'back', () => actions.moveGrade(gym.id, grade.id, -1), i === 0, 'rotate(90deg)'),
      iconBtn('아래로', 'back', () => actions.moveGrade(gym.id, grade.id, +1), i === total - 1, 'rotate(-90deg)'),
      h('button', {
        // 되돌릴 수 있는 동작이라 위험 표시를 하지 않는다. 지우기(X)와도 글리프가 다르다.
        class: 'iconbtn', type: 'button',
        title: '빼기',
        'aria-label': `${grade.label} 빼기`,
        onclick: () => actions.removeGrade(gym.id, grade.id),
      }, icon('minus', { size: 15 })),
    ),
  );
}

function iconBtn(title, name, onClick, disabled, transform) {
  return h('button', {
    class: 'iconbtn', type: 'button', title, disabled,
    style: transform ? { transform } : null,
    onclick: onClick,
  }, icon(name, { size: 15 }));
}

function pickColor(grade, gym, actions) {
  // 이름을 직접 고쳐 둔 등급이면 색만 바꾼다. 팔레트 이름을 그대로 쓰던
  // 등급이라야 새 색 이름을 따라간다. 안 그러면 '화이트'가 색만 바꿔도 '파랑'이 된다.
  const named = PALETTE.some(([l]) => l === grade.label);
  const sheet = modal('색 고르기',
    h('div', { class: 'swatches swatches--lg' },
      PALETTE.map(([label, color]) => h('button', {
        class: `swatch swatch--lg${color === grade.color ? ' is-on' : ''}`,
        type: 'button', title: label,
        'aria-pressed': String(color === grade.color),
        onclick: () => {
          actions.updateGrade(gym.id, grade.id, named ? { color, label } : { color });
          sheet.close();
        },
      },
        hold({ label, color, order: grade.order }, { size: 30, bolt: false }),
        h('span', { class: 'swatch__name' }, label))),
    ),
  );
}
