/**
 * Firebase Realtime Database 클라이언트. SDK 없이 REST 와 EventSource 만 쓴다.
 *
 * 이 앱은 런타임 의존성이 0 이다. Firebase SDK 를 붙이면 그게 깨지는데,
 * 정작 우리가 쓰는 건 "값 하나 쓰고, 바뀌면 알려 줘" 둘뿐이라 REST 로 충분하다.
 *
 *   읽기   GET    <db>/rooms/<code>.json
 *   쓰기   PUT    <db>/rooms/<code>/sessions/<id>.json
 *   지우기 DELETE <db>/rooms/<code>/sessions/<id>.json
 *   구독   EventSource(<db>/rooms/<code>.json)
 *
 * 구독이 라이브러리 없이 되는 이유는 EventSource 가 규격상 Accept 헤더를
 * text/event-stream 으로 보내기 때문이다. RTDB 는 그 헤더를 보고 SSE 로 답한다.
 *
 * 방 코드가 곧 비밀번호다. 그래서 코드는 주소에만 있고 로그에는 남기지 않는다.
 */

/** 방 하나에 붙는다. 방을 바꾸면 새로 만든다. */
export function createRemote({ databaseUrl, room }) {
  const base = `${String(databaseUrl).replace(/\/+$/, '')}/rooms/${room}`;
  const url = (path = '') => `${base}${path}.json`;

  /*
   * 쓰기는 줄을 세운다.
   *
   * 완등을 빠르게 여러 번 누르면 같은 경로에 요청이 겹쳐 날아가고, 응답이
   * 뒤바뀌어 도착하면 옛 값이 새 값을 덮는다. 경로마다 마지막 것만 보낸다.
   */
  const pending = new Map();   // path -> { value, remove }
  let flushing = false;

  async function send(path, init, tries = 3) {
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url(path), init);
        if (res.ok) return true;
        // 4xx 는 다시 보내도 같은 답이다. 규칙에 막혔거나 주소가 틀렸다.
        if (res.status >= 400 && res.status < 500) {
          console.warn('서버가 거절했어요', res.status, path);
          return false;
        }
      } catch { /* 네트워크. 아래에서 쉬었다 다시 */ }
      await new Promise((r) => setTimeout(r, 200 * 2 ** i));
    }
    return false;
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      while (pending.size) {
        const [path, job] = pending.entries().next().value;
        pending.delete(path);
        await (job.remove
          ? send(path, { method: 'DELETE' })
          : send(path, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(job.value),
            }));
      }
    } finally { flushing = false; }
  }

  return {
    /** 방 전체를 한 번 읽는다. 없는 방이면 null 이 온다. */
    async getAll() {
      const res = await fetch(url(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`방을 읽지 못했어요 (HTTP ${res.status})`);
      return await res.json();
    },

    put(path, value) { pending.set(path, { value }); flush(); },
    remove(path) { pending.set(path, { remove: true }); flush(); },

    /** 여러 경로를 한 번에. 가져오기처럼 통째로 바뀔 때만 쓴다. */
    async patchAll(obj) {
      return send('', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj),
      });
    },

    /** 밀린 쓰기가 다 나갈 때까지 기다린다. 검증용. */
    async drain() { await flush(); },

    /**
     * 변경 구독. 돌려주는 함수를 부르면 끊는다.
     *
     * RTDB 는 붙자마자 방 전체를 put 이벤트 하나로 보내 준다. 그래서 첫
     * 이벤트가 곧 초기 적재다. 따로 GET 할 필요가 없다.
     */
    stream({ onEvent, onStatus }) {
      let es = null;
      let closed = false;
      let retry = 0;

      const open = () => {
        if (closed) return;
        es = new EventSource(url());
        es.addEventListener('open', () => { retry = 0; onStatus?.('on'); });
        for (const kind of ['put', 'patch']) {
          es.addEventListener(kind, (e) => {
            try {
              const { path, data } = JSON.parse(e.data);
              onEvent?.({ kind, path, data });
            } catch { /* 깨진 프레임은 버린다 */ }
          });
        }
        es.addEventListener('error', () => {
          onStatus?.('off');
          if (closed) return;
          // EventSource 는 스스로 다시 붙지만, RTDB 는 끊을 때 스트림을
          // 닫아 버리는 경우가 있어 직접 다시 연다.
          es.close();
          retry = Math.min(retry + 1, 5);
          setTimeout(open, 500 * 2 ** retry);
        });
      };
      open();
      return () => { closed = true; onStatus?.('off'); es?.close(); };
    },
  };
}
