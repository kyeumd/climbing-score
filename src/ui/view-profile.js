/** 프로필·레벨 관리, 백업. */
import { h, panel, button, icon, eyebrow, modal } from './components.js';
import { MAX_LEVEL } from '../domain/profile.js';

export function viewProfile(ctx) {
  const { state, actions } = ctx;

  return h('div', { class: 'view' },
    h('div', { class: 'viewhead' },
      button('뒤로', { onClick: actions.goHome, variant: 'ghost', small: true }),
      h('h1', { class: 'title' }, '프로필'),
    ),

    panel(
      h('div', { class: 'section-head', style: { marginBottom: '0.75rem' } },
        h('div', {},
          eyebrow('참가자'),
          h('p', { class: 'hint', style: { marginTop: '0.35rem' } },
            '내기에 참여하는 사람들. 이 기기 안에서만 관리됩니다.'),
        ),
        button('추가', { onClick: actions.openNewProfile, small: true, trailing: 'plus' }),
      ),
      state.profiles.length === 0
        ? h('p', { class: 'subtitle' }, '아직 프로필이 없습니다.')
        : h('ul', { class: 'profilelist' },
            state.profiles.map((p) => profileRow(p, ctx))),
    ),

    h('div', { class: 'section' },
      panel(
        eyebrow('백업'),
        h('p', { class: 'subtitle', style: { margin: '0.5rem 0 1rem' } },
          '기록은 이 브라우저에만 있습니다. 캐시를 지우면 사라지니 가끔 내보내 두세요.'),
        h('div', { class: 'btnrow' },
          button('JSON 내보내기', { onClick: actions.exportData, trailing: 'arrow' }),
          button('가져오기', { onClick: actions.importData }),
        ),
      ),
    ),
  );
}

function profileRow(profile, { state, actions }) {
  const isCurrent = profile.id === state.ui.profileId;
  const level = profile.level ?? 0;

  return h('li', { class: `profilerow${isCurrent ? ' is-current' : ''}` },
    h('button', {
      class: 'profilerow__pick', type: 'button',
      onclick: () => actions.setProfile(profile.id),
    },
      h('span', { class: 'avatar' }, profile.name.slice(0, 1)),
      h('span', { class: 'profilerow__text' },
        h('span', { class: 'profilerow__name' }, profile.name),
        h('span', { class: 'hint num' }, `LV${level}`),
      ),
    ),
    h('div', { class: 'graderow__ops' },
      h('button', {
        class: 'iconbtn', type: 'button', title: '숙련도 설정',
        'aria-label': `${profile.name} 숙련도 설정`,
        onclick: () => openLevels(profile, { state, actions }),
      }, icon('gear', { size: 15 })),
      h('button', {
        class: 'iconbtn iconbtn--danger', type: 'button', title: '삭제',
        'aria-label': `${profile.name} 삭제`,
        onclick: () => {
          if (confirm(`"${profile.name}"과 그 기록을 모두 지웁니다. 계속할까요?`)) {
            actions.deleteProfile(profile.id);
          }
        },
      }, icon('minus', { size: 15 })),
    ),
  );
}

/** 숙련도는 사람에게 붙는다. 짐을 옮긴다고 실력이 달라지지 않으므로 값은 하나뿐이다. */
export function openLevels(profile, { actions }) {
  const current = profile.level ?? 0;
  const readout = h('span', { class: 'levelpick__value num' }, `LV${current}`);

  const apply = (v) => {
    const next = Math.max(0, Math.min(MAX_LEVEL, v));
    readout.textContent = `LV${next}`;
    slider.value = next;
    actions.setLevel(profile.id, next);
  };

  const slider = h('input', {
    class: 'levelpick__slider', type: 'range', min: 0, max: MAX_LEVEL, step: 1, value: current,
    'aria-label': '내 숙련도 레벨',
    oninput: (e) => apply(Number(e.target.value)),
  });

  const body = h('div', {},
    h('p', { class: 'hint', style: { marginBottom: '1.25rem' } },
      '지금 편하게 깨는 단계를 고르세요.'),
    h('div', { class: 'levelpick' },
      readout,
      slider,
      h('div', { class: 'levelpick__scale hint num' },
        h('span', {}, 'LV0'), h('span', {}, `LV${MAX_LEVEL}`)),
    ),
    h('p', { class: 'hint', style: { marginTop: '1.25rem' } },
      '레벨과 문제 난이도의 차이로 점수가 정해져요. 지난 기록은 그대로 남습니다.'),
  );
  modal(`${profile.name}의 숙련도`, body);
}
