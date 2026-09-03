/** 프로필·레벨 관리, 백업. */
import { h, panel, button, icon, eyebrow, modal, dangerButton, editableText } from './components.js';
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

  /*
   * 한 줄에 필요한 것만 둔다.
   *
   * 예전에는 이름이 두 군데 있었다 — 읽는 자리(버튼 안 텍스트)와 고치는
   * 자리(옆에 붙인 입력칸). 좁은 화면에서 하나를 숨기는 미디어 쿼리까지
   * 붙였는데, 그건 잘못된 걸 알면서 가린 것이다. 이름은 하나고, 그 자리에서
   * 고친다. 평소에는 테두리 없이 글자처럼 보이다가 손이 닿으면 칸이 된다.
   *
   * 톱니(설정) 버튼도 없앴다. 설정할 게 레벨 하나뿐인데 그걸 열려고 버튼을
   * 누르고 시트를 띄웠다. 값이 하나면 그 값을 바로 놓는다.
   */
  const lvEl = h('span', { class: 'profilerow__lv num' }, levelLabel(level));
  const step = (d) => () => {
    const next = Math.min(MAX_LEVEL, Math.max(0, level + d));
    if (next !== level) actions.setLevel(profile.id, next);
  };

  return h('li', { class: `profilerow${isCurrent ? ' is-current' : ''}` },
    // 아바타가 곧 선택 표시다. 지금 기록 화면에서 보고 있는 사람은 반전된다.
    h('button', {
      class: 'avatar profilerow__sel', type: 'button',
      'aria-pressed': isCurrent ? 'true' : 'false',
      'aria-label': `${profile.name} 기록 보기`,
      title: '이 사람 기록 보기',
      onclick: () => actions.setProfile(profile.id),
    }, profile.name.slice(0, 1)),

    editableText({
      value: profile.name,
      label: `이름 (${profile.name})`,
      fkey: `profile-name:${profile.id}`,
      onCommit: (v) => actions.renameProfile(profile.id, v),
    }),

    h('span', { class: 'stepper' },
      h('button', {
        class: 'stepper__btn', type: 'button',
        'aria-label': `${profile.name} 레벨 낮추기`, onclick: step(-1),
      }, icon('minus', { size: 16 })),
      lvEl,
      h('button', {
        class: 'stepper__btn', type: 'button',
        'aria-label': `${profile.name} 레벨 올리기`, onclick: step(+1),
      }, icon('plus', { size: 16 })),
    ),

    dangerButton({
      className: 'iconbtn',
      label: `${profile.name} 삭제`,
      armedLabel: `한 번 더 누르면 ${profile.name}${josa(profile.name, '과/와')} 그 기록이 모두 지워져요`,
      size: 15,
      onConfirm: () => actions.deleteProfile(profile.id),
    }),
  );
}

/** 숙련도는 사람에게 붙는다. 짐을 옮긴다고 실력이 달라지지 않으므로 값은 하나뿐이다. */
