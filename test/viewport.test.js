/**
 * 화면을 덮는 고정 상자는 동적 뷰포트(dvh)로 높이를 못 박아야 한다.
 *
 * .modal 은 inset: 0 만 두고 있었다. 그러면 상자가 '레이아웃 뷰포트'를 따라가는데,
 * 모바일 브라우저는 주소창이 보이는 동안 그 값을 실제 보이는 높이보다 크게 잡는다.
 * align-items: flex-end 라 시트가 그 큰 상자의 바닥, 즉 화면 밖으로 밀렸다.
 * 시트 자신은 92dvh 를 쓰는데 담는 상자만 안 써서 둘이 어긋나 있었다.
 *
 * 브라우저 검사로는 못 잡는다. 헤드리스에는 주소창이 없어 레이아웃 높이와
 * 보이는 높이가 늘 같기 때문이다(tools/mobile-audit.mjs 주석 참고).
 * 그래서 규칙 자체를 여기서 지킨다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8');

/** 선택자의 선언 블록을 통째로 꺼낸다 */
function block(selector) {
  const i = CSS.indexOf(`\n${selector} {`);
  assert.notEqual(i, -1, `${selector} 규칙을 찾지 못했습니다`);
  const open = CSS.indexOf('{', i);
  const close = CSS.indexOf('}', open);
  return CSS.slice(open + 1, close);
}

test('화면을 덮는 모달은 dvh 로 높이를 정한다', () => {
  const b = block('.modal');
  assert.match(b, /position:\s*fixed/, '.modal 이 고정 배치가 아닙니다');
  assert.match(b, /height:\s*100dvh/,
    '.modal 에 height: 100dvh 가 없습니다. inset: 0 만으로는 주소창이 뜬 기기에서 '
    + '시트가 화면 밖으로 밀립니다.');
});

test('시트와 그것을 담는 상자가 같은 뷰포트 단위를 쓴다', () => {
  const outer = block('.modal');
  const sheet = block('.modal__sheet');
  const unit = (s) => (s.match(/\d+(dvh|vh)\b/g) ?? []).map((x) => x.replace(/\d+/, ''));
  const both = [...unit(outer), ...unit(sheet)];
  assert.ok(both.length >= 2, `뷰포트 단위를 찾지 못했습니다: ${JSON.stringify(both)}`);
  assert.deepEqual([...new Set(both)], ['dvh'],
    `vh 와 dvh 가 섞여 있으면 주소창 높이만큼 어긋납니다: ${both.join(', ')}`);
});
