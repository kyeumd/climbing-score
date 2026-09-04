/** 프로필·레벨 관리, 백업. */
import { h, panel, button, icon, eyebrow, modal, confirmModal, editableText, newPersonFields } from './components.js';
import { josa, levelLabel } from '../domain/text.js';
import { MAX_LEVEL, shortId, handleTaken } from '../domain/profile.js';
import { formatRoomCode, isValidRoomCode, ROOM_LENGTH } from '../domain/room.js';

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
        /* 열어 두면 닫을 길이 있어야 한다. 같은 버튼이 그 일을 맡는다 —
           칸만 덩그러니 남아 있고 끝내는 방법이 없으면 고장으로 보인다. */
        state.ui.adding
          ? button('완료', { onClick: actions.stopAddProfile, small: true, variant: 'solid', trailing: 'check' })
          : button('추가', { onClick: actions.startAddProfile, small: true, trailing: 'plus' }),
      ),
      h('ul', { class: 'profilelist' }, state.profiles.map((p) => profileRow(p, ctx))),
      // 여기서도 팝업 없이 바로 붙인다. 격자 쪽과 같은 칸을 쓴다.
      state.ui.adding ? newPersonFields({
        onAdd: (p) => actions.addProfile(p),
        onCancel: () => actions.stopAddProfile(),
        isTaken: (v) => handleTaken(state.profiles, v),
      }) : null,
    ),

    roomPanel(ctx),

    h('div', { class: 'section' },
      panel(
        eyebrow('백업'),
        /* 방에 붙어 있으면 '이 브라우저에만' 은 거짓말이다. 상태에 맞게 말한다. */
        h('p', { class: 'hint', style: { margin: '0.35rem 0 1rem' } },
          actions.roomInfo().code
            ? '기록은 방에 저장돼요. 방을 잃어버릴 때를 대비해 가끔 내려받아 두세요.'
            : '이 브라우저에만 저장돼요.'),
        h('div', { class: 'btnrow' },
          // ↗ 는 앱 밖으로 나가는 동작에만 쓴다. 화면 이동은 › (next)
          button('JSON 내보내기', { onClick: actions.exportData, trailing: 'arrow' }),
          button('가져오기', { onClick: actions.importData }),
        ),
      ),
    ),
  );
}

/**
 * 함께 보기.
 *
 * 계정이 없다. 방 코드가 곧 열쇠라서, 그 방을 아는 사람은 같은 기록을 보고
 * 같이 고칠 수 있다.
 *
 * 그래서 코드를 부르게 하지 않는다. 링크로 넘기면 친구는 누르기만 하면 되고,
 * 코드는 길고 안전한 값을 그대로 쓸 수 있다. 짧고 부르기 쉬운 코드는 곧
 * 약한 자물쇠다 — 데이터베이스 주소는 배포된 파일에 들어 있어 누구나 읽는다.
 *
 * 코드 자체는 접어 둔다. 링크가 막힌 상황(사진으로 찍어 보내는 경우)에만 쓴다.
 */
function roomPanel({ actions }) {
  const { enabled, on, code, status, past } = actions.roomInfo();
  if (!enabled) return null;

  /* 꺼져 있으면 켜는 길만 보여 준다. 켤 수 없는 스위치나 빈 칸을 두지 않는다. */
  if (!on) {
    return h('div', { class: 'section' },
      panel(
        eyebrow('함께 보기'),
        h('p', { class: 'hint', style: { margin: '0.35rem 0 1rem' } },
          '지금은 꺼져 있어요. 기록이 이 브라우저 밖으로 나가지 않아요.'),
        button('함께 보기 켜기', { onClick: () => actions.setSync(true), trailing: 'next' }),
      ),
    );
  }

  const said = h('p', { class: 'room__said hint', role: 'status' }, '');
  const say = (text) => {
    said.textContent = text;
    setTimeout(() => { said.textContent = ''; }, 2800);
  };

  /* 보낼 것을 눈으로 보여 준다. 무엇이 복사되는지 모르면 붙여 넣기가 불안하다. */
  const linkEl = h('span', { class: 'room__link' }, actions.shareLink());

  const copy = async () => {
    if (await actions.copyLink() === 'copied') {
      say('복사했어요. 카톡에 붙여 넣으세요.');
    } else {
      // 클립보드를 막아 둔 브라우저가 있다. 그때는 직접 고르게 해 준다.
      say('길게 눌러 복사해 주세요.');
      getSelection()?.selectAllChildren(linkEl);
    }
  };

  /* 링크 자체를 눌러도 복사된다. 버튼만 눌리게 하면 링크를 눌러 본 사람이 헛손질한다. */
  const linkBtn = h('button', {
    class: 'room__linkbtn', type: 'button', 'aria-label': '초대 링크 복사',
    onclick: copy,
  }, linkEl);

  const share = button('초대 링크 복사', { variant: 'solid', trailing: 'check', onClick: copy });

  const input = h('input', {
    class: 'field', type: 'text', placeholder: '방 코드',
    'aria-label': '친구의 방 코드', autocomplete: 'off', spellcheck: 'false',
    'data-fkey': 'room-join',
  });
  const err = h('p', { class: 'hint room__err', role: 'alert' }, '');
  const join = () => {
    if (!isValidRoomCode(input.value)) {
      err.textContent = `코드는 ${ROOM_LENGTH}글자예요. 다시 확인해 주세요.`;
      return;
    }
    if (!actions.joinRoom(input.value)) err.textContent = '이미 그 방에 있어요.';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    join();
  });
  input.addEventListener('input', () => { err.textContent = ''; });

  /* 링크를 못 쓸 때를 위한 뒷문. 평소에는 접어 둔다. */
  const manual = h('details', { class: 'room__manual' },
    h('summary', { class: 'hint' }, '링크 대신 코드로 하기'),
    h('div', { class: 'room__manualbody' },
      h('p', { class: 'hint', style: { margin: '0 0 0.35rem' } }, '내 방 코드'),
      h('span', { class: 'room__code num' }, formatRoomCode(code)),
      h('p', { class: 'hint', style: { margin: '0.75rem 0 0.4rem' } }, '친구 방으로 옮기기'),
      h('div', { class: 'fieldrow' }, input, button('들어가기', { onClick: join, small: true })),
      err,
      past.length ? h('div', { class: 'room__past' },
        h('p', { class: 'hint', style: { margin: '0 0 0.4rem' } }, '지난 방'),
        h('div', { class: 'chips chips--wrap' },
          past.map((c) => h('button', {
            class: 'chip', type: 'button', 'aria-label': `${formatRoomCode(c)} 방으로 돌아가기`,
            onclick: () => actions.joinRoom(c),
          }, formatRoomCode(c)))),
      ) : null,
    ),
  );

  return h('div', { class: 'section' },
    panel(
      h('div', { class: 'section-head', style: { marginBottom: '0.5rem' } },
        eyebrow('함께 보기'),
        h('span', { class: `room__dot${status === 'on' ? ' is-on' : ''}` },
          status === 'on' ? '연결됨' : '연결 안 됨'),
      ),
      h('p', { class: 'hint', style: { margin: '0 0 0.75rem' } },
        '링크를 받은 사람은 같은 기록을 보고 함께 고칠 수 있어요. 아무 데나 올리지 마세요.'),
      linkBtn,
      share,
      said,
      manual,
      h('div', { class: 'room__off' },
        button('함께 보기 끄기', { onClick: () => actions.setSync(false), small: true, variant: 'ghost' }),
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
