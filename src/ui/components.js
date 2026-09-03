/** DOM 조립 헬퍼와 공통 UI 조각. 프레임워크 없음. */

/** h('div', {class:'x', onclick:fn}, child, ...) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** 아이콘은 라이브러리 대신 인라인 SVG로. 의존성 0을 지킨다. */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
  close: 'M6 6l12 12M18 6 6 18',
  arrow: 'M7 17 17 7M9 7h8v8',
  star: 'M12 3.6l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.88l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z',
  check: 'M4 12.5 9 17.5 20 6.5',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  user: 'M4 20c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  trophy: 'M7 4h10v4a5 5 0 0 1-10 0V4zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 20h6M12 13v7',
  pencil: 'M4.5 19.5l4-1L20 7a2.1 2.1 0 0 0-3-3L5.5 15.5l-1 4zM14.5 5.5l3 3',
};

export function icon(name, { size = 18, fill = false } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', PATHS[name] ?? '');
  path.setAttribute('fill', fill ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

export function button(label, { onClick, variant = '', trailing, small = false, ...rest } = {}) {
  const cls = ['btn', variant && `btn--${variant}`, small && 'btn--sm'].filter(Boolean).join(' ');
  const kids = [label];
  if (trailing) kids.push(h('span', { class: 'btn__icon' }, icon(trailing, { size: 14 })));
  return h('button', { class: cls, type: 'button', onclick: onClick, ...rest }, ...kids);
}

/** 셸 + 코어 두 겹. 모든 주요 카드가 이걸 쓴다. */
export function panel(...children) {
  return h('div', { class: 'shell' }, h('div', { class: 'core' }, ...children));
}

export function eyebrow(text) {
  return h('span', { class: 'eyebrow' }, text);
}

export function empty(message, action) {
  return h('div', { class: 'empty' }, h('p', { class: 'subtitle' }, message), action);
}

/** 점수 롤업. transform/opacity만 건드려 GPU에서 처리되게 한다. */
export function animateNumber(el, to, { duration = 420 } = {}) {
  const from = Number(el.dataset.value ?? 0);
  el.dataset.value = String(to);
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = to.toLocaleString('ko-KR');
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased).toLocaleString('ko-KR');
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * 탭은 +1, 길게 누르기는 -1.
 *
 * 예전에는 delay가 지나는 순간 곧바로 onHold를 실행했다. 그런데 그 안에서
 * 화면을 다시 그리면 지금 누르고 있는 요소가 DOM에서 사라지고, 손을 뗄 때
 * 새로 만들어진 요소가 클릭을 받아 +1이 한 번 더 들어갔다.
 *
 * 그래서 판정을 손 뗄 때로 옮겼다. 화면 갱신은 언제나 pointerup 이후에만
 * 일어나므로 요소가 중간에 교체되지 않는다. 길게 누르는 중임은 진동과
 * 클래스로 알린다.
 */
export function onPressAndHold(el, { onTap, onHold, delay = 250 }) {
  let downAt = 0;
  let timer = null;
  let repeat = null;
  let fired = 0;   // 반복으로 실제 실행된 횟수

  const reset = () => {
    clearTimeout(timer);
    clearInterval(repeat);
    timer = null;
    repeat = null;
    fired = 0;
    downAt = 0;
    el.classList.remove('is-pressing', 'is-held');
    // 손을 뗐으니 그물도 걷는다
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', reset);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', reset);
  };

  /*
   * 손 떼기를 el 과 window 양쪽에서 받는다. 어느 쪽이 먼저 와도 되고,
   * reset() 이 downAt 을 0 으로 돌리므로 뒤따라 오는 쪽은 그냥 돌아간다.
   *
   * el 하나면 될 일이고, 실제로 지금은 그것으로 충분하다. 누르는 동안 요소가
   * 사라지지 않게 하는 것은 여기가 아니라 렌더 쪽에서 풀었다 —
   * 개수가 바뀌어도 격자를 부수지 않고 숫자만 고쳐 쓴다(view-match.js 의 sync,
   * app.js 의 liveSync). 예전에는 완등 +1 한 번에 176개 칸이 통째로 교체됐고,
   * 그래서 누르고 있던 셀이 DOM 에서 사라져 pointerup 이 영영 오지 않았다.
   *
   * window 쪽은 그 뒤에 남겨 두는 그물이다. 다른 이유로 화면 전체가 다시
   * 그려지는 중에 손을 떼도 타이머가 살아남지 않게 한다. 반대로 window 만
   * 두면 안 된다 — 떨어져 나간 요소에 직접 쏜 이벤트는 문서 트리에 없어
   * window 까지 올라오지 않는다.
   */
  const onUp = (e) => {
    if (!downAt) return;
    const held = performance.now() - downAt >= delay;
    const already = fired;
    reset();
    e.preventDefault();
    // 반복이 한 번도 실행되지 않았다면(타이머가 돌기 전에 뗐다면) 여기서 한 번 줄인다
    if (!held) onTap?.(e);
    else if (already === 0) onHold?.(e);
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    downAt = performance.now();
    el.classList.add('is-pressing');
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', reset);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', reset);
    // 활성 포인터가 아니면 던진다. 그물을 먼저 치고, 실패해도 넘어간다 —
    // 여기서 예외가 새면 아래 타이머가 걸리지 않아 누르기 자체가 죽는다.
    try { el.setPointerCapture?.(e.pointerId); } catch { /* 잡을 포인터가 없다 */ }
    /*
     * 임계점에서 첫 감소를 바로 준다.
     *
     * 예전에는 여기서 실행하지 않고 손 뗄 때로 미뤘다. onHold 안에서 화면을
     * 다시 그리면 누르고 있던 요소가 사라졌기 때문인데, 이제 격자는 부수지
     * 않고 숫자만 고쳐 쓰므로(view-match.js 의 sync) 그럴 이유가 없다.
     *
     * 미룬 대가가 컸다. 250ms 에는 아무 일도 안 일어나고 450ms 에 처음
     * 줄더니, 그 뒤로 200ms 마다 계속 줄었다. 2개짜리는 650ms 만에 0이 된다.
     * 누른 사람은 언제 '먹었는지' 모른 채 값이 쓸려 나가는 걸 본다.
     *
     * 바로 한 번 줄이고, 한 박자(700ms) 쉰 뒤에 반복을 시작한다. 그래서
     * 보통의 길게 누르기는 정확히 -1 이고 — 화면에 적힌 그대로다 —
     * 여러 개를 지우려고 계속 붙들고 있을 때만 이어서 줄어든다.
     */
    timer = setTimeout(() => {
      el.classList.add('is-held');
      fired += 1;
      onHold?.();
      navigator.vibrate?.(14);
      timer = setTimeout(() => {
        repeat = setInterval(() => { fired += 1; onHold?.(); navigator.vibrate?.(8); }, 250);
      }, 700);
    }, delay);
  });

  el.addEventListener('pointerleave', reset);
  // 브라우저가 뒤따라 보내는 click을 막는다. 안 막으면 한 번 더 세진다.
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

/**
 * 새 사람 넣는 칸 — 아이디와 닉네임.
 *
 * 아이디는 만들 때 한 번만 적고 그 뒤로는 못 바꾼다. 닉네임은 언제든 바꾼다.
 * 두 칸 어디서든 엔터를 치면 붙고, 칸이 비워진 채 남아 다음 사람을 받는다.
 *
 * 이미 쓰는 아이디면 조용히 넘기지 않는다 — 아무 일도 안 일어나면
 * '추가가 안 된다' 로 읽힌다. 그 자리에 이유를 적는다.
 */
export function newPersonFields({ onAdd, onCancel, isTaken }) {
  const err = h('p', { class: 'newperson__err hint', role: 'alert' }, '');
  const handle = h('input', {
    class: 'field newperson__id', type: 'text', placeholder: '아이디',
    'aria-label': '아이디 (나중에 바꿀 수 없어요)', autocomplete: 'off',
    enterkeyhint: 'next', 'data-fkey': 'new-handle',
  });
  const name = h('input', {
    class: 'field newperson__name', type: 'text', placeholder: '닉네임',
    'aria-label': '닉네임', autocomplete: 'off', enterkeyhint: 'done',
  });

  const submit = () => {
    const hv = handle.value.trim().replace(/\s+/g, '');
    const nv = name.value.trim();
    if (!hv && !nv) { onCancel(); return; }
    if (!hv) { err.textContent = '아이디를 적어 주세요.'; handle.focus(); return; }
    if (isTaken(hv)) { err.textContent = `'${hv}' 는 이미 쓰고 있어요.`; handle.focus(); return; }
    err.textContent = '';
    // 닉네임을 안 적으면 아이디를 그대로 쓴다. 두 번 적게 할 이유가 없다.
    onAdd({ handle: hv, name: nv || hv });
    handle.value = ''; name.value = '';
    handle.focus();
  };

  for (const el of [handle, name]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key !== 'Enter') return;
      // 한글 조합 중 엔터는 확정 신호지 입력 완료가 아니다
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      submit();
    });
    el.addEventListener('input', () => { err.textContent = ''; });
  }

  const box = h('div', { class: 'newperson' },
    h('div', { class: 'newperson__row' }, handle, name), err);
  // 두 칸 모두 비운 채 밖으로 나가면 닫는다
  box.addEventListener('focusout', (e) => {
    if (box.contains(e.relatedTarget)) return;
    if (!handle.value.trim() && !name.value.trim()) onCancel();
  });
  return box;
}

/**
 * 지우기 전에 한 번 묻는다.
 *
 * window.confirm 은 브라우저가 그리는 팝업이라 앱과 생김새가 다르고, 모바일에서
 * 스크롤 도중 잘못 닫기 쉽다. 앱의 시트로 묻는다.
 *
 * 두 번 눌러야 실행되는 버튼도 써 봤지만, 처음 누를 때 아무 일도 안 일어나는
 * 것처럼 보여서 이상하다. 한 번 누르면 바로 반응하고, 거기서 답한다.
 */
export function confirmModal({ title, message, confirmLabel = '지우기', onConfirm }) {
  const sheet = modal(title,
    h('div', {},
      h('p', { class: 'subtitle', style: { marginBottom: 'var(--sp-5)' } }, message),
      h('div', { class: 'btnrow', style: { justifyContent: 'flex-end' } },
        button('취소', { onClick: () => sheet.close(), small: true }),
        button(confirmLabel, {
          onClick: () => { sheet.close(); onConfirm(); },
          variant: 'solid', small: true, trailing: 'check',
        }),
      ),
    ),
  );
  return sheet;
}

/**
 * 그 자리에서 고치는 글자.
 *
 * 입력칸을 상자로 두르면 한 줄에 상자가 셋씩 생겨 어디가 무엇인지 읽히지
 * 않는다. 평소에는 그냥 글자로 두고, 옆에 연필을 흐리게 띄워 고칠 수 있다는
 * 것만 알린다. 손이 닿으면 밑줄이 생기고, 고치는 중에는 밑줄이 액센트로 켜진다.
 *
 * (호버가 없는 손가락 화면을 생각해 연필은 늘 보이게 둔다. 호버에만 나타나게
 * 하면 휴대폰에서는 영영 안 보인다.)
 */
export function editableText({ value, label, fkey, onCommit, className = '' }) {
  /* 칸을 글자 폭에 맞춘다. 늘어난 채로 두면 연필이 이름에서 멀찍이 떨어져
     그 이름을 고치는 버튼이라는 게 읽히지 않는다. */
  const fit = (el) => { el.size = Math.max(3, [...el.value].length + 1); };
  const input = h('input', {
    class: 'ename__input', type: 'text', value,
    'aria-label': label, autocomplete: 'off',
    ...(fkey ? { 'data-fkey': fkey } : {}),
    oninput: (e) => fit(e.target),
    onchange: (e) => onCommit(e.target.value),
  });
  fit(input);
  return h('span', { class: `ename${className ? ' ' + className : ''}` },
    input, icon('pencil', { size: 13 }));
}

/** 모달. backdrop-blur는 고정 요소에만 허용된다(성능 가드레일). */
let modalSeq = 0;

/* 시트 안에서 탭으로 옮겨 다닐 수 있는 것들. 순서는 DOM 순서를 따른다. */
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), '
  + 'select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function modal(title, body, { onClose } = {}) {
  // 닫은 뒤에는 열기 전에 있던 자리로 돌려보낸다. 안 그러면 포커스가 <body> 로
  // 떨어져, 키보드 사용자는 탭을 처음부터 다시 눌러 내려와야 한다.
  const restoreTo = document.activeElement;
  const close = () => {
    wrap.remove();
    unlockScroll();
    document.removeEventListener('keydown', onKey);
    if (restoreTo?.isConnected) restoreTo.focus();
    onClose?.();
  };
  /*
   * aria-modal="true" 만 적어 두고 실제로는 아무것도 막지 않고 있었다.
   * 짐 선택기에서 탭을 누르면 시트 뒤의 기록 격자(.cell)와 탭바로 빠져나가,
   * 보이지도 않는 곳에 포커스가 서 있었다. 여기서 가둔다.
   *
   * 모달이 겹쳐 열릴 수 있으므로(세션 편집 → 날짜 고르기) 맨 위 시트만 처리한다.
   */
  const onKey = (e) => {
    if (document.querySelector('.modal:last-of-type') !== wrap) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...sheet.querySelectorAll(FOCUSABLE)]
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    if (!sheet.contains(here)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && here === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && here === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);

  const titleId = `modal-title-${++modalSeq}`;
  const sheet = h('div', {
    class: 'modal__sheet shell', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
  },
    h('div', { class: 'core' },
      h('div', { class: 'modal__head' },
        h('h2', { class: 'title', id: titleId }, title),
        button('닫기', { onClick: close, variant: 'ghost', small: true }),
      ),
      h('div', { class: 'modal__body' }, body),
    ),
  );
  const wrap = h('div', {
    class: 'modal',
    onclick: (e) => { if (e.target === wrap) close(); },
  }, sheet);
  document.body.append(wrap);
  // 모달이 열린 채 뒤 페이지가 스크롤되면 배경이 밀려 어지럽다.
  // 스크롤 위치를 고정하고 닫을 때 되돌린다.
  lockScroll();
  requestAnimationFrame(() => {
    wrap.classList.add('is-open');
    // 열자마자 포커스를 시트 안으로 들여놓는다. 검색창이 있으면 거기가 목적지다.
    const target = sheet.querySelector('input[type=search]')
      ?? sheet.querySelector('.modal__body ' + FOCUSABLE)
      ?? sheet.querySelector(FOCUSABLE);
    target?.focus({ preventScroll: true });
  });
  return { close, el: wrap };
}


/* 모달 스크롤 잠금. 중첩해서 열려도 카운트로 관리한다. */
let lockDepth = 0;
let lockedAt = 0;

function lockScroll() {
  if (lockDepth++ > 0) return;
  lockedAt = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockedAt}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  if (--lockDepth > 0) return;
  lockDepth = 0;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.overflow = '';
  window.scrollTo(0, lockedAt);
}
