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
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    downAt = performance.now();
    el.classList.add('is-pressing');
    el.setPointerCapture?.(e.pointerId);
    timer = setTimeout(() => {
      el.classList.add('is-held');     // 여기서 감소를 실행하지 않는다
      navigator.vibrate?.(14);
      // 누른 채로 두면 계속 줄어든다. 여러 개를 지울 때 손을 떼고 다시
      // 누르기를 반복하지 않아도 된다.
      repeat = setInterval(() => { fired += 1; onHold?.(); navigator.vibrate?.(8); }, 200);
    }, delay);
  });

  el.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const held = performance.now() - downAt >= delay;
    const already = fired;
    reset();
    e.preventDefault();
    // 반복이 한 번도 실행되지 않았다면(타이머가 돌기 전에 뗐다면) 여기서 한 번 줄인다
    if (!held) onTap?.(e);
    else if (already === 0) onHold?.(e);
  });

  el.addEventListener('pointercancel', reset);
  el.addEventListener('pointerleave', reset);
  // 브라우저가 뒤따라 보내는 click을 막는다. 안 막으면 한 번 더 세진다.
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** 모달. backdrop-blur는 고정 요소에만 허용된다(성능 가드레일). */
let modalSeq = 0;

export function modal(title, body, { onClose } = {}) {
  const close = () => {
    wrap.remove();
    unlockScroll();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
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
  requestAnimationFrame(() => wrap.classList.add('is-open'));
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
