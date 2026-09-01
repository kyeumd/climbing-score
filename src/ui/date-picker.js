/**
 * 날짜 고르기.
 *
 * 예전에는 <input type="date"> 하나였다. iOS·안드로이드·데스크톱이 저마다 다른
 * 달력을 띄우고, 그중 어느 것도 이 앱처럼 생기지 않았다. 앱 안에서 같은 시트로 연다.
 *
 * vanilla-calendar-pro 는 vendor/ 에 ESM 빌드를 넣어 쓴다. 이 앱은 번들러가 없고
 * 런타임 의존성을 두지 않는 것이 규칙이라, 패키지를 참조하는 대신 파일을 들고 있다.
 * 딸려 오는 CSS 는 구조만 있고 색이 없어서 색은 앱 토큰으로 직접 입힌다.
 */
import { Calendar } from '../../vendor/vanilla-calendar/index.mjs';
import { h, modal, button } from './components.js';
import { localDate } from '../domain/ids.js';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-31 → 8월 31일 (일) */
export function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = localDate();
  if (iso === today) return `오늘 · ${m}월 ${d}일`;
  return `${m}월 ${d}일 (${WEEK[dt.getDay()]})`;
}

/**
 * 기본값은 기록 화면의 날짜(state.ui.date)를 바꾸는 것이다.
 * 세션 편집처럼 다른 값을 고쳐야 하는 곳은 value/onPick 을 넘긴다.
 * 그래야 앱 안에 네이티브 <input type=date> 가 하나도 남지 않는다.
 */
export function openDatePicker({ state, actions }, { value, onPick } = {}) {
  const current = value ?? state.ui.date;
  const commit = onPick ?? ((iso) => actions.setDate(iso));
  const mount = h('div', { class: 'datepick' });
  const sheet = modal('날짜 고르기',
    h('div', {},
      mount,
      h('div', { class: 'datepick__foot' },
        button('오늘로', {
          onClick: () => { commit(localDate()); sheet.close(); },
          small: true,
        }),
      ),
    ),
  );

  const cal = new Calendar(mount, {
    selectedDates: [current],
    // 미래 기록은 만들 수 없다. 오늘까지만 고를 수 있게 한다.
    // 옵션 이름은 dateMax 다. disableDatesAfter 로 적었더니 라이브러리가
    // 모르는 키를 조용히 버려서, 다음 달 날짜도 그대로 눌렸다.
    displayDatesOutside: false,
    dateMax: localDate(),
    locale: 'ko-KR',
    firstWeekday: 0,
    onClickDate(self) {
      const picked = self.context.selectedDates[0];
      if (!picked) return;
      commit(picked);
      sheet.close();
    },
  });
  cal.init();
  return sheet;
}
