/**
 * 짐 선택기.
 *
 * 지역 선택 컨트롤을 따로 두지 않는다. 검색창 하나가 이름과 지역을 함께
 * 찾으므로("강남"만 쳐도 강남구 짐이 나온다) 드롭다운은 같은 일을 두 번
 * 하는 셈이고, 25개 항목짜리 네이티브 select는 손으로 고르기도 나쁘다.
 *
 * 대신 자주 가는 곳(★)을 맨 위에 따로 모은다. 목록이 110곳이라 스크롤로
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
      kids.push(h('p', { class: 'gymlist__empty hint' },
        q ? `'${query.trim()}' 검색 결과가 없어요.` : '등록된 클라이밍장이 없어요.'));
    } else {
      if (favorites.length) {
        kids.push(section('자주 가는 곳', favorites, ctx, () => sheet.close()));
      }
      kids.push(section(q ? `검색 결과 ${rest.length + favorites.length}곳` : `전체 ${rest.length}곳`,
        rest, ctx, () => sheet.close()));
    }
    list.replaceChildren(...kids);
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
      h('p', { class: 'hint' }, '찾는 곳이 없나요?'),
      button('직접 추가', {
        onClick: () => { sheet.close(); actions.openNewGym(); },
        trailing: 'plus', small: true,
      }),
    ),
  );

  const sheet = modal('클라이밍장', body);
  render();
}

function section(title, gyms, ctx, close) {
  if (!gyms.length) return h('div', { style: { display: 'none' } });
  return h('section', { class: 'gymsec' },
    h('h3', { class: 'gymsec__title' }, title),
    h('ul', {}, gyms.map((g) => gymRow(g, ctx, close))),
  );
}

function gymRow(gym, { actions }, close) {
  const noGrades = gym.grades.length === 0;
  // 색 등급을 안 쓰는 암장이다. "난이도 미등록"으로 적으면 데이터가 빠진 줄 안다.
  const kinds = gym.kinds?.length ? gym.kinds.join('·') : null;
  return h('li', { class: 'gymrow' },
    h('button', {
      class: 'gymrow__pick', type: 'button',
      onclick: () => { actions.setGym(gym.id); close(); },
    },
      h('span', { class: 'gymrow__dots' },
        gym.grades.slice().sort((a, b) => a.order - b.order).slice(0, 5)
          .map((g) => hold(g, { size: 15, bolt: false })),
      ),
      h('span', { class: 'gymrow__text' },
        h('span', { class: 'gymrow__name' }, gym.name),
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
      onclick: () => { actions.toggleFavorite(gym.id); },
    }, icon('star', { size: 16, fill: gym.favorite })),
  );
}
