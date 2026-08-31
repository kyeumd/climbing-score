/**
 * 받침에 따라 조사를 고른다.
 *
 * `${name}이 앞서고 있어요` 처럼 붙여 쓰면 '지수이 앞서고 있어요' 가 된다.
 * 이름·짐 이름은 사용자가 넣는 값이라 어느 쪽이 올지 미리 알 수 없다.
 *
 *   josa('동균', '이/가')  // '이'
 *   josa('지수', '이/가')  // '가'
 */
export function josa(word, pair) {
  const [withFinal, without] = pair.split('/');
  const last = String(word ?? '').trim().slice(-1);
  const code = last.charCodeAt(0);
  // 한글 음절이 아니면 (숫자·영문·빈 값) 받침을 알 수 없으므로 없는 쪽을 쓴다
  if (!(code >= 0xac00 && code <= 0xd7a3)) return without;
  return (code - 0xac00) % 28 === 0 ? without : withFinal;
}

/**
 * 숙련도 표기. 한 곳에서만 정한다.
 *
 * 예전에는 화면마다 `LV${n}` 을 직접 박아 일곱 군데에 흩어져 있었다.
 * 표기를 바꾸려면 일곱 군데를 다 찾아야 하고, 하나를 빠뜨리면 화면마다 달라진다.
 */
export function levelLabel(n) {
  return `Lv.${n}`;
}
