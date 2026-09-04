/**
 * 방 하나를 여럿이 함께 보는 저장소.
 *
 * 서버가 진실이고 localStorage 는 캐시다. 캐시를 남겨 두는 이유는 오프라인이
 * 아니라 첫 화면 때문이다. 앱을 열 때마다 서버를 기다리면 그동안 빈 화면을
 * 본다. 지난번 값을 즉시 그리고, 서버가 답하면 그 위를 덮는다.
 *
 * 저장 계약(adapter.js)은 동기다. loadAll 은 화면을 다시 그릴 때마다 불리는데
 * 이걸 비동기로 바꾸면 호출부 스무 곳이 함께 흔들린다. 그래서 이 어댑터도
 * 동기를 지킨다 — 읽기는 캐시가 즉시 답하고, 서버로 보내는 일만 뒤에서 한다.
 *
 * 무엇을 방에 올리는가.
 *
 *   올린다     사람, 세션, 손으로 만진 짐 설정
 *   안 올린다  짐 목록 시드 112곳
 *
 * 시드는 모두에게 같은 붙박이 자료다. 방에 두면 앱을 열 때마다 스트림 첫
 * 응답으로 83KB 가 통째로 내려온다. 방에는 실제로 손댄 짐만 올린다.
 */
import { createRemote } from './remote.js';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * @param local  캐시로 쓸 어댑터 (localStorage)
 * @param databaseUrl  Firebase 데이터베이스 주소. 비어 있으면 로컬만 쓴다.
 * @param room  방 코드
 */
export function createSyncedAdapter({ local, databaseUrl, room }) {
  const remote = createRemote({ databaseUrl, room });
  let stop = null;
  let status = 'off';        // off | on
  let onChange = null;       // 서버가 무언가 바꿨다고 앱에 알리는 통로
  let onStatus = null;

  /*
   * 무엇이 바뀌었는지 함께 알린다.
   *
   * 세션의 개수만 달라졌을 때는 격자를 부수지 않고 숫자만 고쳐 쓸 수 있다.
   * 하지만 색 이름이나 사람 이름이 바뀐 것까지 그 통로로 보내면 아무 일도
   * 일어나지 않는다 — 그 통로는 숫자만 고치도록 만들어졌기 때문이다.
   * 실제로 그렇게 새서, A 가 고친 색 이름이 B 화면에 영영 안 뜨는 것을
   * tools/e2e-sync.mjs 가 잡았다.
   */
  const notify = (what) => onChange?.(what);

  /* ---------- 서버 → 캐시 ---------- */

  /**
   * 방 전체가 왔다. 사람과 세션은 서버가 진실이라 없는 것은 지운다.
   *
   * 다만 '방이 통째로 비어 있다' 는 진실로 받지 않는다.
   *
   * 계정이 없는 앱이라 코드를 아는 사람은 누구나 방을 비울 수 있고, 그 빈
   * 상태를 그대로 받으면 각 기기의 캐시까지 따라 지워진다. 한 번의 실수나
   * 장난으로 모두의 기록이 동시에 사라지고, 서버에 백업도 없다.
   *
   * 그래서 빈 방을 만나면 지우는 대신 이 기기에 있는 것을 다시 올린다.
   * 기록이 남은 기기가 하나라도 있으면 방이 스스로 되살아난다.
   * 진짜로 하나씩 지운 경우는 이 길로 오지 않는다 — 그때는 항목별 이벤트가
   * 온다(applyNode).
   */
  function applySnapshot(data) {
    const roomData = data ?? {};
    const state = local.loadAll();

    const profiles = Object.values(roomData.profiles ?? {});
    const sessions = Object.values(roomData.sessions ?? {});
    const gyms = Object.values(roomData.gyms ?? {});

    const roomEmpty = !profiles.length && !sessions.length;
    const haveLocal = state.profiles.length > 0 || state.sessions.length > 0;
    if (roomEmpty && haveLocal) {
      console.warn('방이 비어 있어 이 기기의 기록을 다시 올려요.');
      adopt();
      return;
    }

    const sessionsChanged = !same(sessions, state.sessions);
    let structureChanged = !same(profiles, state.profiles);

    // 짐은 겹쳐 쓴다. 시드 목록은 캐시에만 있고 방에는 없다.
    const byId = new Map(state.gyms.map((g) => [g.id, g]));
    for (const g of gyms) {
      if (!same(byId.get(g.id), g)) structureChanged = true;
      byId.set(g.id, g);
    }

    local.replaceAll({ ...state, profiles, sessions, gyms: [...byId.values()] });
    if (structureChanged) notify('other');
    else if (sessionsChanged) notify('sessions');
  }

  /** 한 항목만 왔다. data 가 null 이면 지워진 것이다. */
  function applyNode(kind, id, data) {
    const state = local.loadAll();
    if (kind === 'profiles') {
      const now = state.profiles.find((p) => p.id === id);
      if (same(now, data)) return;              // 내가 방금 쓴 것이 되돌아온 것
      if (data == null) local.deleteProfile(id);
      else local.saveProfile(data);
      notify('other');
    } else if (kind === 'sessions') {
      const now = state.sessions.find((s) => s.id === id);
      if (same(now, data)) return;
      if (data == null) local.deleteSession(id);
      else local.saveSession(data);
      // 사람이 그대로고 개수만 달라졌다면 격자를 부수지 않아도 된다
      notify(data && now && data.profileId === now.profileId ? 'sessions' : 'other');
    } else if (kind === 'gyms') {
      const now = state.gyms.find((g) => g.id === id);
      if (same(now, data)) return;
      if (data == null) return;                 // 짐은 방에서 빠져도 시드가 남는다
      local.saveGym(data);
      notify('other');
    }
  }

  function onEvent({ kind, path, data }) {
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) { applySnapshot(data); return; }
    const [group, id] = parts;
    if (!id) {
      // 한 갈래가 통째로 왔다. 스냅샷과 같은 규칙으로 다시 맞춘다.
      const state = local.loadAll();
      applySnapshot({
        profiles: group === 'profiles' ? data : toMap(state.profiles),
        sessions: group === 'sessions' ? data : toMap(state.sessions),
        gyms: group === 'gyms' ? data : {},
      });
      return;
    }
    if (kind === 'patch' && data && typeof data === 'object') {
      // 항목 안의 몇 칸만 바뀐 경우. 지금 값 위에 얹는다.
      const state = local.loadAll();
      const list = { profiles: state.profiles, sessions: state.sessions, gyms: state.gyms }[group] ?? [];
      const now = list.find((x) => x.id === id);
      applyNode(group, id, { ...(now ?? { id }), ...data });
      return;
    }
    applyNode(group, id, data);
  }

  const toMap = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

  /* ---------- 캐시 → 서버 ---------- */

  /**
   * 방이 비어 있으면 지금 이 기기의 기록을 올린다.
   *
   * 안 그러면 동기화를 켜는 순간 그동안 쌓은 것이 서버의 빈 방으로 덮인다.
   * 방에 이미 무언가 있으면 서버가 이긴다 — 그게 여럿이 보는 값이다.
   */
  async function adopt() {
    const state = local.loadAll();
    const used = new Set(state.sessions.map((s) => s.gymId));
    // 손으로 만든 짐과 기록에 쓰인 짐만. 시드 112곳은 올리지 않는다.
    const gyms = state.gyms.filter((g) => g.isCustom || used.has(g.id));
    await remote.patchAll({
      profiles: toMap(state.profiles),
      sessions: toMap(state.sessions),
      gyms: toMap(gyms),
    });
  }

  return {
    /* ---- 저장 계약. 읽기는 캐시가 즉시 답한다 ---- */
    loadAll() { return local.loadAll(); },

    saveProfile(p) {
      const r = local.saveProfile(p);
      remote.put(`/profiles/${p.id}`, p);
      return r;
    },
    saveGym(g) {
      const r = local.saveGym(g);
      remote.put(`/gyms/${g.id}`, g);
      return r;
    },
    saveSession(s) {
      const r = local.saveSession(s);
      remote.put(`/sessions/${s.id}`, s);
      return r;
    },
    deleteSession(id) {
      const r = local.deleteSession(id);
      remote.remove(`/sessions/${id}`);
      return r;
    },
    deleteProfile(id) {
      // 사람을 지우면 그 사람 세션도 사라진다. 서버에서도 같이 지운다.
      const gone = local.loadAll().sessions.filter((s) => s.profileId === id);
      const r = local.deleteProfile(id);
      remote.remove(`/profiles/${id}`);
      for (const s of gone) remote.remove(`/sessions/${s.id}`);
      return r;
    },

    /* 시드 적재. 캐시에만 넣는다 — 방에 112곳을 올릴 이유가 없다. */
    replaceAll(state) { return local.replaceAll(state); },

    exportJSON() { return local.exportJSON(); },
    importJSON(text) {
      const r = local.importJSON(text);
      if (r.ok) adopt();
      return r;
    },

    /* ---- 방 ---- */
    async connect({ onRemoteChange, onStatusChange } = {}) {
      onChange = onRemoteChange;
      onStatus = onStatusChange;
      const existing = await remote.getAll();
      if (existing && Object.keys(existing).length) applySnapshot(existing);
      else await adopt();
      stop = remote.stream({
        onEvent,
        onStatus: (s) => { status = s; onStatus?.(s); },
      });
    },
    disconnect() { stop?.(); stop = null; status = 'off'; },
    status() { return status; },
    async drain() { await remote.drain(); },
  };
}
