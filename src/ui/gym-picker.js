/**
 * 짐 선택기.
 *
 * 지역 선택 컨트롤을 따로 두지 않는다. 검색창 하나가 이름과 지역을 함께
 * 찾으므로("강남"만 쳐도 강남구 짐이 나온다) 드롭다운은 같은 일을 두 번
 * 하는 셈이고, 25개 항목짜리 네이티브 select는 손으로 고르기도 나쁘다.
 *
 * 대신 자주 가는 곳(★)을 맨 위에 따로 모은다. 목록이 112곳이라 스크롤로
 * 찾는 것보다 그게 훨씬 빠르다.
 */
import { h, button, icon, modal } from './components.js';
import { hold } from './hold.js';
import { sortGyms } from '../domain/gym.js';

export function openGymPicker(ctx) {
  const { state, actions } = ctx;
  let query = '';

  const list = h('div', { class: 'gymlist' });

  const render = () => {
    const all = state.gyms.filter((g) => !g.archived);
    const q = query.trim().toLowerCase();
    const match = (g) => !q || g.name.toLowerCase().includes(q) || g.gu.includes(q);

    const favorites = all.filter((g) => g.favorite && match(g));
    const rest = sortGyms(all.filter((g) => !g.favorite && match(g)));
    const kids = [];

    if (!favorites.length && !rest.length) {
      kids.push(h('div', { class: 'gymlist__empty' },
        h('p', { class: 'hint' },
          q ? `'${query.trim()}'와 일치하는 곳이 없어요.` : '등록된 클라이밍장이 없어요.'),
        q && button('검색어 지우기', {
          onClick: () => {
            const input = body.querySelector('.field[type=search]');
            if (input) { input.value = ''; query = ''; render(); input.focus(); }
          },
          small: true,
        })));
    } else {
      if (favorites.length) {
        kids.push(section('자주 가는 곳', favorites, ctx, () => sheet.close(), render));
      }
      kids.push(section(q ? `검색 결과 ${rest.length + favorites.length}곳` : `전체 ${rest.length}곳`,
        rest, ctx, () => sheet.close(), render));
    }
    // 별을 눌러 다시 그릴 때 목록이 맨 위로 튀지 않게 자리를 지킨다
    const box = list.closest('.modal__body');
    const keep = box ? box.scrollTop : 0;
    list.replaceChildren(...kids);
    if (box) box.scrollTop = keep;
  };

  const body = h('div', { class: 'pickerbody' },
    h('div', { class: 'pickerhead' },
      h('input', {
        class: 'field', type: 'search', placeholder: '이름이나 지역으로 찾기',
        'aria-label': '클라이밍장 이름 또는 지역 검색',
        oninput: (e) => { query = e.target.value; render(); },
      }),
    ),
    list,
    h('div', { class: 'gymlist__foot' },
      button('직접 추가', {
        onClick: () => { sheet.close(); actions.openNewGym(); },
        trailing: 'plus', small: true,
      }),
    ),
  );

  const sheet = modal('클라이밍장', body);
  render();
  // 지금 짐이 목록 저 아래에 있으면 표시를 해 둬도 보이지 않는다.
  // 스크롤 컨테이너는 .pickerbody 의 조상이라 closest 로 찾아 올라간다.
  requestAnimationFrame(() => {
    const here = list.querySelector('[data-current]');
    const box = list.closest('.modal__body');
    if (!here || !box) return;
    // offsetTop 은 기준이 되는 조상이 달라질 수 있어 화면 좌표 차이로 계산한다.
    // 검색창(스티키) 바로 아래에 붙인다. 어중간한 위치면 위아래로 반 줄씩 잘려 보인다.
    const head = body.querySelector('.pickerhead')?.getBoundingClientRect().height ?? 0;
    const delta = here.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop += delta - head;
  });
}

function section(title, gyms, ctx, close, refresh) {
  if (!gyms.length) return h('div', { style: { display: 'none' } });
  return h('section', { class: 'gymsec' },
    h('h3', { class: 'gymsec__title' }, title),
    h('ul', {}, gyms.map((g) => gymRow(g, ctx, close, refresh))),
  );
}

function gymRow(gym, { state, actions }, close, refresh) {
  const noGrades = gym.grades.length === 0;
  // 색 등급을 안 쓰는 암장이다. "난이도 미등록"으로 적으면 데이터가 빠진 줄 안다.
  const kinds = gym.kinds?.length ? gym.kinds.join('·') : null;
  // 112곳 목록에서 지금 어디를 보고 있는지 표시가 없으면, 바꾸러 왔다가 길을 잃는다
  const current = gym.id === state.ui.gymId;
  return h('li', { class: 'gymrow' },
    h('button', {
      class: 'gymrow__pick', type: 'button',
      'aria-current': current ? 'true' : null,
      'data-current': current ? '1' : null,
      onclick: () => { actions.setGym(gym.id); close(); },
    },
      h('span', { class: 'gymrow__dots' },
        // 다 보여줄 수 없으면 몇 개가 더 있는지 알린다. 잘라서 반쪽만 남기면
        // 그 짐의 색 구성이 틀리게 전달된다.
        gym.grades.slice().sort((a, b) => a.order - b.order).slice(0, 5)
          .map((g) => hold(g, { size: 15, bolt: false })),
        gym.grades.length > 5
          && h('span', { class: 'gymrow__more num' }, `+${gym.grades.length - 5}`),
        // 색 등급이 없는 곳(12곳, 전부 지구력·리드·보드 짐)은 이 칸이 통째로 비어
        // 목록이 들쭉날쭉했다. 이유는 옆 줄에 적혀 있으므로 여기서는 자리만 표시한다.
        noGrades && h('span', { class: 'gymrow__nocolor', 'aria-hidden': 'true' }),
      ),
      h('span', { class: 'gymrow__text' },
        h('span', { class: 'gymrow__top' },
          h('span', { class: 'gymrow__name' }, gym.name),
          current && h('span', { class: 'gymrow__now' }, '지금'),
        ),
        h('span', { class: 'hint' },
          gym.gu,
          noGrades
            ? (kinds ? ` · ${kinds} 중심` : ' · 난이도 미등록')
            : ` · ${gym.grades.filter((g) => !g.retired).length}단계`,
        ),
      ),
    ),
    h('button', {
      class: `gymrow__star${gym.favorite ? ' is-on' : ''}`,
      type: 'button', 'aria-label': `${gym.name} 즐겨찾기`,
      onclick: () => { actions.toggleFavorite(gym.id); refresh(); },
    }, icon('star', { size: 16, fill: gym.favorite })),
  );
}
