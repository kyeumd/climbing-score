/**
 * 서버 설정.
 *
 * 비워 두면 서버 없이 이 브라우저에만 저장한다 — 지금까지와 똑같이 돈다.
 * 주소를 채우면 방 코드를 아는 사람끼리 같은 화면을 실시간으로 본다.
 *
 * 이 주소는 비밀이 아니다. 브라우저가 받아 가는 파일에 들어가므로 공개된다.
 * 비밀은 방 코드 쪽이고, 서버 규칙(firebase.rules.json)이 그것으로 막는다.
 * 그래서 이 값은 저장소에 두어도 되지만, 방 코드는 절대 여기 적지 않는다.
 *
 * Firebase 콘솔 > Realtime Database 상단에 보이는 주소를 그대로 넣는다.
 *   예: https://클라이밍-default-rtdb.asia-southeast1.firebasedatabase.app
 */
export const DATABASE_URL = 'https://climbing-efbfe-default-rtdb.asia-southeast1.firebasedatabase.app';
