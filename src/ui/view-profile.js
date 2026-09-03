/** 프로필·레벨 관리, 백업. */
import { h, panel, button, icon, eyebrow, modal, confirmModal, editableText, newPersonFields } from './components.js';
import { josa, levelLabel } from '../domain/text.js';
import { MAX_LEVEL, shortId, handleTaken } from '../domain/profile.js';

export function viewProfile(ctx) {
  const { state, actions } = ctx;

  return h('div', { class: 'view' },
    h('div', { class: 'viewhead' },
      // 탭으로 들어오는 화면이라 '뒤로'는 갈 곳이 없다. 탭바가 늘 아래에 있다.
      h('h1', { class: 'title' }, '프로필'),
    ),

    panel(
      h('div', { class: 'section-head', style: { marginBottom: '0.75rem' } },
        eyebrow('참가자'),
        button('추가', { onClick: actions.startAddProfile, small: true, trailing: 'plus' }),
      ),
      h('ul', { class: 'profilelist' }, state.profiles.map((p) => profileRow(p, ctx))),
      // 여기서도 팝업 없이 바로 붙인다. 격자 쪽과 같은 칸을 쓴다.
      state.ui.adding ? newPersonFields({
        onAdd: (p) => actions.addProfile(p),
        onCancel: () => actions.stopAddProfile(),
        isTaken: (v) => handleTaken(state.profiles, v),
      }) : null,
    ),

    h('div', { class: 'section' },
      panel(
        eyebrow('백업'),
        h('p', { class: 'hint', style: { margin: '0.35rem 0 1rem' } },
          '이 브라우저에만 저장돼요.'),
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
  const step = (d) => () => {
    const next = Math.min(MAX_LEVEL, Math.max(0, level + d));
    if (next !== level) actions.setLevel(profile.id, next);
  };

  /*
   * 아바타는 그림이지 버튼이 아니다. 누를 수 있게 해 뒀더니 무엇을 고르는
   * 것인지 알 수 없는 네모 상자가 이름 왼쪽에 붙어 있는 꼴이었다.
   * 기록을 보는 건 따로 있는 버튼이 맡는다.
   */
  const who = h('div', { class: 'prow__who' },
    h('span', { class: 'pavatar', 'aria-hidden': 'true' }, profile.name.slice(0, 1)),
    h('span', { class: 'pident' },
      editableText({
        value: profile.name,
        label: `닉네임 (${profile.name})`,
        fkey: `profile-name:${profile.id}`,
        onCommit: (v) => actions.renameProfile(profile.id, v),
      }),
      // 닉네임은 바뀌어도 이 값은 안 바뀐다. 같은 이름이 둘일 때 이걸로 가른다.
      h('span', { class: 'pident__id num', title: '바꿀 수 없는 고유 번호' }, shortId(profile)),
    ),
  );

  /* 조작은 한 덩어리로 묶는다. 낱개로 두면 줄이 접힐 때 아이콘만 다음 줄
     왼쪽으로 흘러내려, 무엇에 딸린 버튼인지 알 수 없게 된다. */
  const ops = h('div', { class: 'prow__ops' },
    h('span', { class: 'stepper' },
      h('button', {
        class: 'stepper__btn', type: 'button',
        'aria-label': `${profile.name} 레벨 낮추기`, onclick: step(-1),
      }, icon('minus', { size: 16 })),
      h('span', { class: 'profilerow__lv num' }, levelLabel(level)),
      h('button', {
        class: 'stepper__btn', type: 'button',
        'aria-label': `${profile.name} 레벨 올리기`, onclick: step(+1),
      }, icon('plus', { size: 16 })),
    ),

    h('button', {
      class: 'iconbtn', type: 'button',
      'aria-label': `${profile.name} 삭제`, title: '삭제',
      onclick: () => confirmModal({
        title: '참가자 지우기',
        message: `${profile.name}${josa(profile.name, '과/와')} 그 기록이 모두 지워져요. 되돌릴 수 없어요.`,
        onConfirm: () => actions.deleteProfile(profile.id),
      }),
    }, icon('close', { size: 15 })),
  );

  return h('li', { class: `profilerow${isCurrent ? ' is-current' : ''}` }, who, ops);
}

/** 숙련도는 사람에게 붙는다. 짐을 옮긴다고 실력이 달라지지 않으므로 값은 하나뿐이다. */
