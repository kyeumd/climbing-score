/**
 * 클라이밍 홀드 실루엣.
 *
 * 난이도를 색으로만 구분하면 색각이상자는 읽을 수 없다. 색과 모양을
 * 함께 쓰면 이중 부호화가 되어 누구나 구분할 수 있고, 암장에서 실제로
 * 만지는 물건이라 앱의 성격도 한눈에 드러난다.
 *
 * 실제 홀드 분류를 따랐다. 위에서 본 실루엣에 볼트 구멍을 하나 둔다.
 */

const SHAPES = [
  // 저그 - 손가락이 다 들어가는 큰 손잡이. 입문 단계에 흔하다
  { name: 'jug',     d: 'M4.2 13.6c-.8-4.2 2-8.1 6.4-8.7 4.6-.6 8.5 2 9.2 6 .5 3.3-1.3 5.8-4.6 6.6-1.9.5-3.4.2-5.2-.2-2.9-.7-5.2-1.1-5.8-3.7z' },
  // 슬로퍼 - 잡을 데 없는 둥근 돔
  { name: 'sloper',  d: 'M3.6 16.2c0-5.2 3.8-9 8.5-9s8.3 3.6 8.3 8.8c0 1.4-.6 2.2-2 2.2H5.5c-1.3 0-1.9-.7-1.9-2z' },
  // 핀치 - 엄지와 마주 잡는 세로 형태
  { name: 'pinch',   d: 'M8.4 3.6c2.4-.7 5 .3 6.2 2.4 1.4 2.4 1.5 5.6.9 8.8-.5 2.9-1.8 5.4-4.4 5.6-2.7.2-4.4-2.1-5-5-.7-3.4-.6-6.9.4-9.3.4-1.1 1-2.1 1.9-2.5z' },
  // 크림프 - 손끝만 걸리는 얇은 턱
  { name: 'crimp',   d: 'M2.8 11.4c2.6-1.9 6-2.8 9.4-2.8 3.2 0 6.4.8 8.9 2.5.9.6 1.1 1.6.6 2.4-.6.9-1.7 1-2.9 1H5c-1.1 0-2-.1-2.5-.9-.5-.8-.3-1.7.3-2.2z' },
  // 포켓 - 손가락 한두 개만 들어가는 구멍
  { name: 'pocket',  d: 'M12 3.8c4.7 0 8.4 3.6 8.4 8.2s-3.7 8.2-8.4 8.2-8.3-3.6-8.3-8.2S7.3 3.8 12 3.8zm0 5.4a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z' },
  // 엣지 - 각진 면으로 깎인 홀드
  { name: 'edge',    d: 'M5.1 6.3 18 4.4c1.3-.2 2.2.6 2.3 1.8l.5 9.4c.1 1.4-.8 2.3-2.2 2.4L7 18.9c-1.4.1-2.3-.7-2.6-2L3.3 8.6C3.1 7.3 3.8 6.5 5.1 6.3z' },
  // 볼륨 - 벽에서 튀어나온 큰 삼각 면
  { name: 'volume',  d: 'M11.2 3.9c.8-.7 1.9-.5 2.6.3l6.6 8.2c1 1.3.6 2.9-1 3.4l-11.7 3.7c-1.8.6-3.3-.9-2.8-2.7l2.6-9.1c.2-.8.5-1.4 1.1-1.9z' },
  // 언더클링 - 아래에서 받쳐 잡는 뒤집힌 형태
  { name: 'undercling', d: 'M4.6 9.1c1.1-2.6 4-4.2 7.4-4.2 3.6 0 6.7 1.8 7.7 4.6.8 2.3.1 4.7-1.8 6.4-1.9 1.7-4.7 2.4-7.3 1.9-3.9-.8-6.4-3.8-6.4-6.9 0-.6.1-1.2.4-1.8z' },
];

/** 색의 상대 밝기. 0(검정) ~ 1(흰색) */
function luminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) return 0.5;
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

const extreme = (hex) => { const l = luminance(hex); return l > 0.72 || l < 0.06; };

/** 밝은 색은 어두운 선, 어두운 색은 밝은 선. 중간색은 테마 대비색을 따른다. */
function outlineFor(hex) {
  const l = luminance(hex);
  if (l > 0.72) return 'rgba(0, 0, 0, 0.55)';
  if (l < 0.06) return 'rgba(255, 255, 255, 0.72)';
  return 'var(--hold-line)';
}

/** 등급 순서마다 다른 홀드 모양. 같은 짐 안에서 형태가 반복되지 않는다. */
export function holdShape(order) {
  return SHAPES[order % SHAPES.length];
}

/**
 * 홀드 하나를 그린다.
 * 어두운 색은 어두운 배경에, 밝은 색은 밝은 배경에 묻히므로
 * 테마 대비색 외곽선을 항상 두른다.
 */
export function hold(grade, { size = 22, bolt = true } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const shape = holdShape(grade.order ?? 0);

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', 'hold');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${grade.label} 난이도`);

  const body = document.createElementNS(ns, 'path');
  body.setAttribute('d', shape.d);
  body.setAttribute('fill', grade.color || 'currentColor');
  // 아주 밝은 색은 어두운 선으로, 아주 어두운 색은 밝은 선으로 감싼다.
  // 테마 대비색 하나로 고정하면 흰색은 라이트에서, 검정은 다크에서 사라진다.
  body.setAttribute('stroke', outlineFor(grade.color));
  body.setAttribute('stroke-width', extreme(grade.color) ? '1.8' : '1.4');
  body.setAttribute('stroke-linejoin', 'round');
  svg.append(body);

  // 볼트 구멍. 실제 홀드는 전부 이걸로 벽에 박혀 있다.
  if (bolt && size >= 18 && shape.name !== 'pocket') {
    const hole = document.createElementNS(ns, 'circle');
    hole.setAttribute('cx', '12');
    hole.setAttribute('cy', '12');
    hole.setAttribute('r', '1.7');
    hole.setAttribute('fill', 'var(--hold-bolt)');
    svg.append(hole);
  }
  return svg;
}
