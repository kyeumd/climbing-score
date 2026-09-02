/** 프로필·레벨 관리, 백업. */
import { h, panel, button, icon, eyebrow, modal, dangerButton } from './components.js';
import { josa, levelLabel } from '../domain/text.js';
import { MAX_LEVEL } from '../domain/profile.js';

export function viewProfile(ctx) {
  const { state, actions } = ctx;

  return h('div', { class: 'view' },
    h('div', { class: 'viewhead' },
      // 탭으로 들어오는 화면이라 '뒤로'는 갈 곳이 없다. 탭바가 늘 아래에 있다.
      h('h1', { class: 'title' }, '프로필'),
    ),

    panel(
      h('div', { class: 'section-head', style: { marginBottom: '0.75rem' } },
        h('div', {},
          eyebrow('참가자'),
          h('p', { class: 'hint', style: { marginTop: '0.35rem' } },
            '내기에 참여하는 사람들. 이 기기 안에서만 관리돼요.'),
        ),
        button('추가', { onClick: actions.openNewProfile, small: true, trailing: 'plus' }),
      ),
      state.profiles.length === 0
        ? h('p', { class: 'subtitle' }, '아직 프로필이 없어요.')
        : h('ul', { class: 'profilelist' },
            state.profiles.map((p) => profileRow(p, ctx))),
    ),

    h('div', { class: 'section' },
      panel(
        eyebrow('백업'),
        h('p', { class: 'subtitle', style: { margin: '0.5rem 0 1rem' } },
          '기록은 이 브라우저에만 있어요. 캐시를 지우면 사라지니 가끔 내보내 두세요.'),
        h('div', { class: 'btnrow' },
          // ↗ 는 앱 밖으로 나가는 동작에만 쓴다. 화면 이동은 › (next)
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
        h('span', { class: 'hint num' }, levelLabel(level)),
      ),
    ),
    /*
     * 이름 고치기. 여기 말고는 이름을 바꿀 길이 아예 없었다 — 짐은
     * renameGym 이 있는데 사람은 없어서, 잘못 적으면 지우고 다시 넣는 수밖에
     * 없었다. 난이도 이름과 같은 방식(그 자리에서 입력칸)으로 맞춘다.
     */
    h('input', {
      class: 'profilerow__rename', value: profile.name,
      'aria-label': `${profile.name} 이름 고치기`,
      'data-fkey': `profile-name:${profile.id}`,
      onchange: (e) => actions.renameProfile(profile.id, e.target.value),
    }),
    h('div', { class: 'graderow__ops' },
      h('button', {
        class: 'iconbtn', type: 'button', title: '숙련도 설정',
        'aria-label': `${profile.name} 숙련도 설정`,
        onclick: () => openLevels(profile, { state, actions }),
      }, icon('gear', { size: 15 })),
      // 확인은 브라우저 팝업이 아니라 버튼이 맡는다. 두 번 눌러야 지워진다.
      dangerButton({
        className: 'iconbtn',
        label: `${profile.name} 삭제`,
        armedLabel: `한 번 더 누르면 ${profile.name}${josa(profile.name, '과/와')} 그 기록이 모두 지워져요`,
        size: 15,
        onConfirm: () => actions.deleteProfile(profile.id),
      }),
    ),
  );
}

/** 숙련도는 사람에게 붙는다. 짐을 옮긴다고 실력이 달라지지 않으므로 값은 하나뿐이다. */
export function openLevels(profile, { actions }) {
  const current = profile.level ?? 0;
  const readout = h('span', { class: 'levelpick__value num' }, levelLabel(current));

  /*
   * 끄는 동안에는 눈에 보이는 것만 바꾸고, 손을 뗄 때 한 번 저장한다.
   *
   * 예전에는 input 마다 setLevel 을 불렀다. 그 안에서 프로필과 오늘 세션들을
   * 저장하고 화면을 통째로 다시 그린다. 0→8 아홉 단계를 옮기는 데만 저장이
   * 17번 일어났고, 진짜 손가락은 그보다 훨씬 촘촘하게 쏜다. 매번 저장소
   * 전체를 직렬화할 이유가 없다.
   */
  const preview = (v) => {
    const next = Math.max(0, Math.min(MAX_LEVEL, v));
    readout.textContent = levelLabel(next);
    slider.value = next;
    // 트랙은 한 덩어리라 채운 만큼을 CSS 로 알려 줘야 한다.
    // 안 그러면 Lv.0 과 Lv.8 의 막대가 똑같이 생긴다.
    slider.style.setProperty('--pct', `${(next / MAX_LEVEL) * 100}%`);
    return next;
  };
  // change 는 끌기가 끝날 때, 그리고 화살표 키로 옮길 때 한 번씩 온다
  const commit = (v) => { actions.setLevel(profile.id, preview(v)); };

  const slider = h('input', {
    class: 'levelpick__slider', type: 'range', min: 0, max: MAX_LEVEL, step: 1, value: current,
    'aria-label': '내 숙련도 레벨',
    style: { '--pct': `${(current / MAX_LEVEL) * 100}%` },
    oninput: (e) => preview(Number(e.target.value)),
    onchange: (e) => commit(Number(e.target.value)),
  });

  const body = h('div', {},
    h('p', { class: 'hint', style: { marginBottom: '1.25rem' } },
      '지금 편하게 깨는 단계를 고르세요.'),
    h('div', { class: 'levelpick' },
      readout,
      slider,
      h('div', { class: 'levelpick__ticks' },
        Array.from({ length: MAX_LEVEL + 1 }, () => h('span', {}))),
      h('div', { class: 'levelpick__scale hint num' },
        h('span', {}, '쉬움'), h('span', {}, '어려움')),
    ),
    h('p', { class: 'hint', style: { marginTop: '1.25rem' } },
      '레벨과 문제 난이도의 차이로 점수가 정해져요. 지난 기록은 그대로 남아요.'),
  );
  modal(`${profile.name}의 숙련도`, body);
}
