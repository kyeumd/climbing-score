/**
 * 방 코드.
 *
 * 계정이 없으므로 이 코드가 곧 비밀번호다. 코드를 아는 사람만 그 방을 읽고 쓴다.
 *
 * 그래서 짧게 만들지 않는다. 헷갈리는 글자를 뺀 30자 알파벳에서 16자를 뽑아
 * 대략 78비트다. 사람이 불러 주기에는 긴 값이지만, 부를 일이 없다 — 친구에게는
 * 링크로 넘기고 링크를 누르면 그 방으로 들어온다(app.js 의 roomFromLink).
 *
 * 부르기 쉬운 짧은 이름도 생각해 봤다. 그런데 배포된 자바스크립트에 데이터베이스
 * 주소가 들어 있어 누구나 읽을 수 있고, 서버에는 출처를 검사할 방법이 없다.
 * 그러면 이 코드가 유일한 자물쇠라서, 짧으면 자물쇠가 없는 것과 같다.
 *
 * 0 과 O, 1 과 I 와 L 은 받아 적을 때 반드시 틀리므로 알파벳에 아예 없다.
 * 없는 글자를 비슷한 글자로 고쳐 주지는 않는다 — D 를 O 로 잘못 읽은 것인지
 * 알 방법이 없어서, 고쳐 주는 척하면 엉뚱한 방으로 보내게 된다. 그냥 버린다.
 */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 16;

export const ROOM_LENGTH = LENGTH;

/** 새 방 코드. 직접 정하지 않은 사람에게 주는 값이라 길게 뽑는다. */
export function createRoomCode() {
  let out = '';
  const bytes = new Uint8Array(LENGTH * 2);
  // 256 은 30 으로 나누어떨어지지 않는다. 나머지만 쓰면 앞쪽 글자가 더 자주
  // 나오므로, 치우침을 만드는 꼬리 구간은 버리고 다시 뽑는다.
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let i = bytes.length;
  while (out.length < LENGTH) {
    if (i >= bytes.length) { crypto.getRandomValues(bytes); i = 0; }
    const b = bytes[i++];
    if (b >= limit) continue;
    out += ALPHABET[b % ALPHABET.length];
  }
  return out;
}

/** 사람이 적어 넣은 것을 코드로 다듬는다. 공백·하이픈은 버리고 소문자는 올린다. */
export function normalizeRoomCode(v) {
  return String(v ?? '').toUpperCase()
    .split('')
    .filter((c) => ALPHABET.includes(c))
    .join('')
    .slice(0, LENGTH);
}

export function isValidRoomCode(v) {
  return normalizeRoomCode(v).length === LENGTH;
}

/** 화면에 보여 줄 꼴. 네 글자씩 끊으면 눈으로 대조하기 쉽다. */
export function formatRoomCode(v) {
  const s = normalizeRoomCode(v);
  return (s.match(/.{1,4}/g) ?? []).join('-');
}
