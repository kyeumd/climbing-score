/** 라우팅과 상태 조립. 저장 어댑터를 여기서 한 번만 주입한다. */
import { DATABASE_URL } from './config.js';
import { createLocalStorageAdapter } from './storage/local-storage.js';
import { createSyncedAdapter } from './storage/synced.js';
import { createRoomCode, normalizeRoomCode, isValidRoomCode } from './domain/room.js';
import { loadSeed, mergeSeed, SEED_VERSION } from './storage/seed.js';
import { emptyState } from './storage/adapter.js';
import { localDate, uid } from './domain/ids.js';
import {
  toggleFavorite, markVerified, addGrade, updateGrade, moveGrade,
  retireGrade, removeGrade as removeGradeFrom, sortGyms,
} from './domain/gym.js';
import { findSession, createSession, bumpCount } from './domain/session.js';
import { createProfile, setLevel as setProfileLevel, rename as renameProfileName } from './domain/profile.js';
import { h, clear, button, icon, modal } from './ui/components.js';
import { viewMatch } from './ui/view-match.js';
import { viewStats } from './ui/view-stats.js';
import { viewProfile } from './ui/view-profile.js';
import { viewGym } from './ui/view-gym.js';
import { viewScoreTable } from './ui/view-score-table.js';
import { openGymPicker } from './ui/gym-picker.js';
import { openDatePicker } from './ui/date-picker.js';

/*
 * 저장소 조립.
 *
 * 주소가 비어 있으면 지금까지처럼 이 브라우저에만 쌓는다. 주소가 있으면 방
 * 코드를 아는 사람끼리 같은 값을 실시간으로 본다. 어느 쪽이든 UI 가 보는
 * 계약은 같아서 화면 코드는 이 갈래를 모른다.
 */
const ROOM_KEY = 'climbing-score/room';
const ROOM_PAST_KEY = 'climbing-score/room-past';
/*
 * 함께 보기를 끄는 열쇠.
 *
 * 기록을 이 기기 밖으로 내보내고 싶지 않은 사람이 있다. 그리고 검증용 페이지도
 * 서버에 붙으면 안 된다 — 실제로 tools/e2e-*.html 이 가짜 기록을 진짜 방에
 * 올리고 있었다. 켜고 끄는 스위치 하나로 둘 다 해결된다.
 */
const SYNC_KEY = 'climbing-score/sync';

function syncEnabled() {
  try { return localStorage.getItem(SYNC_KEY) !== 'off'; } catch { return true; }
}

function storedRoom() {
  try { return normalizeRoomCode(localStorage.getItem(ROOM_KEY) ?? ''); } catch { return ''; }
}

/*
 * 지난 방 코드.
 *
 * 이미 기록이 있는 방으로 옮기면 서버가 이기므로, 이 기기에 있던 기록은
 * 화면에서 사라진다. 서버의 옛 방에는 그대로 있는데 코드를 잊으면 영영
 * 못 돌아간다. 옮기기 전에 적어 둔다.
 */
function pastRooms() {
  try { return JSON.parse(localStorage.getItem(ROOM_PAST_KEY) ?? '[]').filter(Boolean); }
  catch { return []; }
}

function rememberRoom(code) {
  if (!code) return;
  const next = [code, ...pastRooms().filter((c) => c !== code)].slice(0, 5);
  try { localStorage.setItem(ROOM_PAST_KEY, JSON.stringify(next)); } catch { /* 못 적어도 넘어간다 */ }
}

/*
 * 방 코드는 이 기기에만 둔다. 앱 데이터와 같은 열쇠에 넣으면 내보내기 JSON 에
 * 섞여 나가는데, 그건 비밀번호를 첨부해서 보내는 셈이다.
 */
function saveRoom(code) {
  try {
    if (code) localStorage.setItem(ROOM_KEY, code);
    else localStorage.removeItem(ROOM_KEY);
  } catch { /* 저장 못 해도 이번 실행 동안은 유지된다 */ }
}

/*
 * 링크로 들어온 방.
 *
 * 코드를 # 뒤에 붙인다. # 뒤는 브라우저가 서버로 보내지 않는다 — 코드가 곧
 * 비밀번호라, 경로에 넣으면 GitHub Pages 접속 기록에 그대로 남는다.
 *
 * 읽은 뒤에는 주소창에서 지운다. 남겨 두면 뒤로 가기 기록과 화면 캡처에
 * 열쇠가 따라다닌다.
 */
function roomFromLink() {
  const m = location.hash.match(/(?:^#|&)room=([^&]*)/);
  if (!m) return '';
  const code = normalizeRoomCode(decodeURIComponent(m[1]));
  return isValidRoomCode(code) ? code : '';
}

function clearLinkFromAddress() {
  if (!location.hash) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 못 지워도 넘어간다 */ }
}

function pickRoom() {
  if (!DATABASE_URL || !syncEnabled()) return '';
  const linked = roomFromLink();
  const now = storedRoom();
  if (linked) {
    // 옮기기 전 방은 적어 둔다. 서버에는 그대로 있으므로 돌아갈 수 있다.
    if (now && now !== linked) rememberRoom(now);
    saveRoom(linked);
    return linked;
  }
  if (now) return now;
  const made = createRoomCode();
  saveRoom(made);
  return made;
}

const local = createLocalStorageAdapter();
const room = pickRoom();
clearLinkFromAddress();

/*
 * 이미 열려 있는 앱에 링크가 들어오는 경우.
 *
 * 주소창에 붙여 넣거나, 같은 탭에서 링크를 누르면 # 만 바뀐다. 그때 브라우저는
 * 페이지를 다시 읽지 않으므로 위의 pickRoom 이 다시 돌지 않는다. 아무 일도
 * 일어나지 않는 것처럼 보이는데, 정작 주소창에는 방 코드가 떠 있다.
 */
addEventListener('hashchange', () => {
  const linked = roomFromLink();
  if (linked && linked !== room) actions.joinRoom(linked);
  else clearLinkFromAddress();
});
const synced = room ? createSyncedAdapter({ local, databaseUrl: DATABASE_URL, room }) : null;
const store = synced ?? local;

const state = {
  ...emptyState(),
  ui: { route: 'match', gymId: null, profileId: null, date: localDate(), gymSettingsId: null, adding: false, playing: null },
};

let root;

/* ============================================================
   상태 저장 후 다시 그리기
   ============================================================ */
function persistGym(gym) { store.saveGym(gym); reload(); }
function persistProfile(p) { store.saveProfile(p); reload(); }

function reloadState() {
  const loaded = store.loadAll();
  state.profiles = loaded.profiles;
  state.gyms = loaded.gyms;
  state.sessions = loaded.sessions;
  state.meta = loaded.meta;
}

function reload() {
  reloadState();
  render();
}

/*
 * 화면을 통째로 다시 그리지 않고 숫자만 고쳐 쓰는 자리.
 *
 * render() 는 clear(root) 로 전부 부수고 새로 만든다. 그래서 스크롤 위치와
 * 포커스·캐럿을 손으로 되붙이는 코드가 아래에 붙어 있다. 되붙일 수 없는 것이
 * 하나 있는데, 지금 손가락이 누르고 있는 요소다. 완등 +1 한 번에 176개
 * 칸이 통째로 교체되니, 누르는 중에 값이 바뀌는 상호작용(길게 눌러 감소)은
 * 자기가 붙어 있던 DOM 노드를 잃는다.
 *
 * 개수가 바뀌는 것뿐인데 구조를 부술 이유가 없다. 기록 격자가 자기를
 * 갱신하는 함수를 여기 걸어 두고, bump 는 그걸 먼저 부른다.
 */
let liveSync = null;

/*
 * 서버가 무언가 바꿨다.
 *
 * 여기서 render() 를 바로 부르면 안 된다. 격자를 통째로 다시 만들면 지금
 * 손가락이 누르고 있는 칸이 DOM 에서 사라져 길게 눌러 빼기가 깨진다 —
 * 예전에 그렇게 당한 적이 있어 만들어 둔 통로가 liveSync 다. 숫자만 달라진
 * 경우에는 그쪽이 맡고, 구조가 달라졌을 때만 다시 그린다.
 */
function onRemoteChange(what) {
  reloadState();
  // 세션 개수만 달라졌을 때만 빠른 길로 간다. 사람·색·짐 설정이 바뀌었다면
  // 격자의 구조 자체가 달라지므로 그 통로로는 화면이 안 바뀐다.
  if (what === 'sessions' && liveSync?.()) return;
  render();
}

function onSyncStatus() {
  // 연결 표시는 프로필 화면에만 있다. 그 화면을 보고 있을 때만 다시 그린다.
  if (state.ui.route === 'profile') render();
}

function patchGym(gymId, fn) {
  const gym = state.gyms.find((g) => g.id === gymId);
  if (gym) persistGym(fn(gym));
}

/* ============================================================
   액션 — UI는 이것만 호출한다
   ============================================================ */
const actions = {
  goHome() { state.ui.route = 'match'; render(); },
  openStats() { state.ui.route = 'stats'; render(); },
  openProfiles() { state.ui.route = 'profile'; render(); },
  openGymSettings(gymId) {
    state.ui.route = 'gym'; state.ui.gymSettingsId = gymId; render();
  },
  openScoreTable(gymId) {
    state.ui.route = 'scoreTable'; state.ui.gymSettingsId = gymId; render();
  },

  setGym(id) { state.ui.gymId = id; render(); },
  setDate(d) { state.ui.date = d || localDate(); render(); },
  openDatePicker() { openDatePicker(ctx); },
  setProfile(id) {
    state.ui.profileId = id;
    const p = state.profiles.find((x) => x.id === id);
    if (p?.primaryGymId && state.gyms.some((g) => g.id === p.primaryGymId)) {
      state.ui.gymId = p.primaryGymId;
    }
    render();
  },

  openGymPicker() { openGymPicker(ctx); },
  toggleFavorite(gymId) {
    patchGym(gymId, (gym) => {
      const next = toggleFavorite(gym);
      // 즐겨찾기로 처음 지정하면 그 짐을 기본 짐으로 삼는다.
      const p = state.profiles.find((x) => x.id === state.ui.profileId);
      if (next.favorite && p && !p.primaryGymId) {
        store.saveProfile({ ...p, primaryGymId: gymId });
      }
      return next;
    });
    // 예전에는 여기서 openGymPicker(ctx) 를 다시 불러 목록을 갱신했다.
    // 그러면 열려 있던 모달 위에 새 모달이 한 겹 더 쌓인다. 별을 세 번 누르면
    // 모달 3개에 행 330개가 되고, 스크롤 위치도 매번 날아간다.
    // 목록 갱신은 선택기가 스스로 한다 (gym-picker.js 의 refresh).
  },
  verifyGym(gymId) { patchGym(gymId, markVerified); },
  setGymVerified(gymId, on) {
    patchGym(gymId, (gym) => ({ ...gym, gradesVerified: on }));
  },
  renameGym(gymId, name) {
    if (name.trim()) patchGym(gymId, (gym) => ({ ...gym, name: name.trim() }));
  },
  setGymGu(gymId, gu) { patchGym(gymId, (gym) => ({ ...gym, gu: gu.trim() })); },

  addGrade(gymId, { label, color }) { patchGym(gymId, (gym) => addGrade(gym, { label, color })); },
  updateGrade(gymId, gradeId, patch) {
    patchGym(gymId, (gym) => updateGrade(gym, gradeId, patch));
  },
  moveGrade(gymId, gradeId, dir) { patchGym(gymId, (gym) => moveGrade(gym, gradeId, dir)); },
  /*
   * 색 빼기.
   *
   * 예전에는 무조건 은퇴 표시만 하고 목록에 남겨 뒀다. 뺐는데 그대로 있으니
   * 안 지워진 것으로 보인다. 기록이 없으면 진짜 지운다.
   *
   * 기록이 있으면 지울 수 없다 — 그 색의 id 로 완등 수를 세어 두었으므로
   * 지우면 지난 점수를 다시 셀 수 없다. 이때는 은퇴시키고 목록에서 감춘다.
   * 과거 기록은 그대로 남고, 세션 편집에서는 여전히 보인다.
   */
  removeGrade(gymId, gradeId) {
    const used = state.sessions.some(
      (x) => x.gymId === gymId && (x.counts?.[gradeId] ?? 0) > 0);
    patchGym(gymId, (gym) => (used ? retireGrade(gym, gradeId) : removeGradeFrom(gym, gradeId)));
  },

  setScoreTable(gymId, patch) {
    patchGym(gymId, (gym) => ({ ...gym, scoreTable: { ...gym.scoreTable, ...patch } }));
  },
  setOverride(gymId, key, value) {
    patchGym(gymId, (gym) => ({
      ...gym,
      scoreTable: {
        ...gym.scoreTable,
        overrides: { ...(gym.scoreTable.overrides ?? {}), [key]: value },
      },
    }));
  },

  setLevel(profileId, level) {
    const p = state.profiles.find((x) => x.id === profileId);
    if (!p) return;
    const next = setProfileLevel(p, level);
    store.saveProfile(next);
    // 오늘 기록은 아직 진행 중이므로 새 레벨을 따라간다.
    // 지난 날짜는 그때의 실력으로 남겨 둔다.
    const today = localDate();
    for (const s of state.sessions) {
      if (s.profileId === profileId && s.date === today && s.levelAtTime !== next.level) {
        store.saveSession({ ...s, levelAtTime: next.level });
      }
    }
    reload();
  },

  /** 세션이 없으면 이 시점에 만든다. 레벨과 점수표를 스냅샷으로 박는다. */
  bump(session, gradeId, delta) {
    const existing = findSession(state.sessions, {
      profileId: session.profileId, gymId: session.gymId, date: session.date,
    });
    const base = existing ?? session;
    const next = bumpCount(base, gradeId, delta);
    // 0 에서 더 빼는 건 아무것도 바꾸지 않는다. 저장도 렌더도 하지 않는다.
    if (existing && (existing.counts?.[gradeId] ?? 0) === (next.counts?.[gradeId] ?? 0)) return;
    store.saveSession(next);
    reloadState();
    // 격자 구조는 그대로고 숫자만 달라졌다. 부수지 않고 고쳐 쓴다.
    if (liveSync?.()) return;
    render();
  },

  saveSession(session) { store.saveSession(session); reload(); },
  deleteSession(id) { store.deleteSession(id); reload(); },

  /*
   * 프로필 화면의 '추가' 칸을 열고 닫는다. 대결 화면은 이 상태를 쓰지 않는다 —
   * 거기서는 점선 + 카드가 참가자 시트를 띄운다(view-match.js).
   */
  startAddProfile() { state.ui.adding = true; render(); },
  /*
   * 오늘 대결에 낄 사람.
   *
   * 프로필은 계속 남는 명단이고, 대결은 그중 오늘 온 사람만 세운다.
   * playing 이 null 이면 아직 고른 적이 없다는 뜻이라, 오늘 기록이 있는
   * 사람을 자동으로 세운다. 그래야 앱을 껐다 켜도 하던 대결이 그대로다.
   * 아무도 기록이 없으면(하루의 시작) 명단 전원을 세운다.
   */
  togglePlaying(id) {
    const now = new Set(playingIds());
    if (now.has(id)) now.delete(id); else now.add(id);
    // 전원을 다 빼면 격자가 사라진다. 마지막 한 명은 남긴다.
    if (!now.size) return;
    state.ui.playing = [...now];
    savePlaying();
    render();
  },
  /* 기록 화면의 빈 상태에서 부른다. 프로필 화면을 '추가' 칸이 열린 채로 띄운다. */
  openNewProfile() { state.ui.route = 'profile'; state.ui.adding = true; render(); },

  /* ---- 방 ---- */
  /*
   * 친구에게 보낼 링크.
   *
   * 도메인은 이 앱이 올라간 자리라 누구에게나 같다. 열쇠 노릇을 하는 것은
   * # 뒤의 코드다. 그래서 링크 자체를 아무 데나 올리면 안 된다.
   */
  shareLink() {
    return `${location.origin}${location.pathname}#room=${room}`;
  },
  /*
   * 폰에서는 공유 시트가 뜬다(카톡·메시지). 없는 환경에서는 클립보드로 떨어진다.
   * 돌려주는 값으로 화면이 무슨 일이 일어났는지 말한다 — 아무 반응이 없으면
   * 버튼이 고장 난 것으로 읽힌다.
   */
  async shareRoom() {
    const url = actions.shareLink();
    if (navigator.share) {
      try {
        await navigator.share({ title: '클라이밍 점수', text: '오늘 같이 기록해요', url });
        return 'shared';
      } catch (err) {
        // 사용자가 공유 시트를 닫은 것은 실패가 아니다
        if (err?.name === 'AbortError') return 'cancelled';
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch { return 'failed'; }
  },
  roomInfo() {
    return {
      enabled: !!DATABASE_URL,
      on: !!room,
      code: room,
      status: synced?.status() ?? 'off',
      past: pastRooms().filter((c) => c !== room),
    };
  },
  /*
   * 껐다 켜면 저장소 조립부터 달라진다. 화면만 고쳐 쓰지 않고 페이지를 새로
   * 연다 — 방을 옮길 때와 같은 이유다.
   */
  setSync(on) {
    try {
      if (on) localStorage.removeItem(SYNC_KEY);
      else localStorage.setItem(SYNC_KEY, 'off');
    } catch { /* 못 적으면 이번 실행 동안만 유지된다 */ }
    location.reload();
  },
  /*
   * 친구 방으로 옮긴다. 코드를 바꾸면 보던 값이 통째로 달라지므로, 화면만
   * 고쳐 쓰지 않고 페이지를 새로 연다. 스트림·캐시가 모두 새 방 기준으로
   * 다시 서야 하는데 그걸 손으로 갈아 끼우는 것보다 정확하다.
   */
  joinRoom(codeText) {
    const code = normalizeRoomCode(codeText);
    if (!isValidRoomCode(code) || code === room) return false;
    rememberRoom(room);
    saveRoom(code);
    location.reload();
    return true;
  },
  stopAddProfile() { state.ui.adding = false; render(); },
  addProfile({ handle, name }) {
    const profile = createProfile({ handle, name, primaryGymId: state.ui.gymId });
    store.saveProfile(profile);
    if (!state.ui.profileId) state.ui.profileId = profile.id;
    // 방금 만든 사람은 오늘 대결에 넣는다. 만들자마자 또 골라야 할 이유가 없다.
    // (저장까지 해 둔다. 안 그러면 새로고침 뒤 저장된 옛 명단에서 이 사람만 빠진다.)
    if (state.ui.playing) {
      state.ui.playing = [...state.ui.playing, profile.id];
      savePlaying();
    }
    // adding 을 켜 둔 채 다시 그린다. 이름 칸이 그대로 남아 다음 이름을 받는다.
    reload();
  },
  renameProfile(id, name) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p) return;
    const next = renameProfileName(p, name);
    if (next === p) { render(); return; }   // 빈 이름 — 원래 이름을 되돌려 그린다
    store.saveProfile(next);
    reload();
  },
  deleteProfile(id) {
    store.deleteProfile(id);
    if (state.ui.profileId === id) {
      // null 로 두면 다른 참가자가 남아 있어도 기록 화면이 빈 상태가 된다
      state.ui.profileId = store.loadAll().profiles[0]?.id ?? null;
    }
    reload();
  },
  openNewGym() { newGym(); },

  exportData() {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = h('a', {
      href: URL.createObjectURL(blob),
      download: `climbing-${localDate()}.json`,
    });
    document.body.append(a); a.click(); a.remove();
  },
  importData() {
    const input = h('input', { type: 'file', accept: 'application/json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const result = store.importJSON(await file.text());
      if (!result.ok) alert(`가져오기 실패\n\n${result.errors.join('\n')}`);
      else reload();
    });
    input.click();
  },
};

/*
 * 오늘 대결에 세울 사람.
 *
 * 고른 적이 없으면 명단 전원이다. '오늘 기록이 있는 사람' 을 기본으로 삼아
 * 봤더니, 셋이 왔는데 한 명만 기록한 뒤 새로고침하면 나머지 둘이 사라졌다.
 * 기본은 전원이고, 안 온 사람만 빼면 된다.
 *
 * 고른 결과는 날짜와 함께 저장한다. 껐다 켜도 그대로고, 날이 바뀌면 저절로
 * 전원으로 돌아간다. 앱 데이터와 섞지 않으려고 열쇠를 따로 쓴다.
 */
const PLAY_KEY = 'climbing-score/playing';

function savePlaying() {
  try {
    localStorage.setItem(PLAY_KEY, JSON.stringify({ date: state.ui.date, ids: state.ui.playing }));
  } catch { /* 저장 못 해도 이번 세션 동안은 유지된다 */ }
}

function storedPlaying() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAY_KEY) || 'null');
    return raw && raw.date === state.ui.date ? raw.ids : null;
  } catch { return null; }
}

function playingIds() {
  const picked = state.ui.playing ?? storedPlaying();
  if (picked?.length) {
    const keep = new Set(picked);
    // 그 사이 지워진 사람은 빠지고, 열 순서는 명단 순서를 따른다
    const kept = state.profiles.filter((p) => keep.has(p.id)).map((p) => p.id);
    if (kept.length) return kept;
  }
  return state.profiles.map((p) => p.id);
}

const ctx = {
  state,
  actions,
  playingIds,
  /* 기록 격자가 '나는 이렇게 스스로 갱신한다'고 알려 오는 통로 */
  setLiveSync(fn) { liveSync = fn; },
};

/* ============================================================
   작은 모달들
   ============================================================ */
/*
 * 빈 칸으로 '추가' 를 누르면 아무 일도 일어나지 않았다. 조용히 삼키면
 * 버튼이 고장 난 것처럼 보인다. 비어 있는 동안은 아예 못 누르게 한다.
 */
function gate(input, btn) {
  const sync = () => { btn.disabled = !input.value.trim(); };
  input.addEventListener('input', sync);
  sync();
  return btn;
}

function newGym() {
  // 값이 채워지면 placeholder 는 사라진다. 무슨 칸인지 라벨로 남긴다 (짐 설정 화면과 같은 꼴)
  const name = h('input', { class: 'field', placeholder: '예: 더클라임 강남점', 'aria-label': '클라이밍장 이름' });
  const gu = h('input', { class: 'field', placeholder: '예: 강남구', 'aria-label': '자치구' });
  const submit = async () => {
    if (!name.value.trim()) return;
    const { createGym } = await import('./domain/gym.js');
    const gym = createGym({ name: name.value.trim(), gu: gu.value.trim(), isCustom: true });
    store.saveGym(gym);
    state.ui.gymId = gym.id;
    sheet.close();
    reload();
    actions.openGymSettings(gym.id);
  };
  for (const el of [name, gu]) {
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      // 한글 조합 중 엔터는 '조합 확정' 이지 '입력 완료' 가 아니다.
      // 여기서 받으면 덜 만들어진 이름으로 짐이 저장된다.
      if (e.isComposing || e.keyCode === 229) return;
      submit();
    });
  }
  const addBtn = gate(name, button('추가', { onClick: submit, variant: 'solid', trailing: 'check' }));
  const sheet = modal('클라이밍장 추가',
    h('div', {},
      h('div', { class: 'fieldrow' },
        h('label', { class: 'dial' }, h('span', { class: 'dial__label' }, '이름'), name),
        h('label', { class: 'dial' }, h('span', { class: 'dial__label' }, '자치구'), gu),
      ),
      h('p', { class: 'hint', style: { marginTop: '0.75rem' } },
        '추가하면 난이도 색을 등록하는 화면으로 넘어가요.'),
      h('div', { style: { marginTop: '1rem' } }, addBtn),
    ),
  );
  setTimeout(() => name.focus(), 50);
}

/* ============================================================
   렌더
   ============================================================ */
let lastRoute = null;

/**
 * 화면을 통째로 다시 그린다. 그 대가로 두 가지가 날아가므로 직접 복원한다.
 *   - 스크롤: 카드를 탭할 때마다 맨 위로 튕기면 암장에서 쓸 수가 없다
 *   - 포커스: 등급 이름을 고칠 때마다 입력칸에서 튕겨 나간다
 * 화면이 실제로 바뀔 때만 맨 위로 올린다.
 */
function render() {
  const views = {
    match: () => viewMatch(ctx),
    stats: () => viewStats(ctx),
    profile: () => viewProfile(ctx),
    gym: () => viewGym(ctx, state.ui.gymSettingsId),
    scoreTable: () => viewScoreTable(ctx, state.ui.gymSettingsId),
  };

  const routeChanged = lastRoute !== state.ui.route;
  const scrollY = window.scrollY;
  const active = document.activeElement;
  const focusKey = active?.dataset?.fkey ?? null;
  const caret = focusKey && 'selectionStart' in active ? active.selectionStart : null;

  // 새로 그리면 이전 격자의 갱신 함수는 죽은 노드를 가리킨다
  liveSync = null;
  clear(root);
  root.append(views[state.ui.route]());
  root.append(tabBar());
  lastRoute = state.ui.route;

  if (routeChanged) {
    window.scrollTo({ top: 0 });
  } else {
    window.scrollTo({ top: scrollY });
    if (focusKey) {
      const next = root.querySelector(`[data-fkey="${CSS.escape(focusKey)}"]`);
      if (next) {
        next.focus({ preventScroll: true });
        if (caret != null && 'setSelectionRange' in next) {
          try { next.setSelectionRange(caret, caret); } catch {}
        }
      }
    }
  }
}

function tabBar() {
  const tab = (route, name, label, onClick) => h('button', {
    class: `tab${state.ui.route === route ? ' is-on' : ''}`,
    type: 'button', onclick: onClick,
    'aria-current': state.ui.route === route ? 'page' : null,
  }, icon(name, { size: 19 }), h('span', {}, label));

  return h('nav', { class: 'tabbar', 'aria-label': '주요 화면' },
    h('div', { class: 'tabbar__inner' },
      tab('match', 'trophy', '대결', actions.goHome),
      tab('stats', 'chart', '기록', actions.openStats),
      tab('profile', 'user', '프로필', actions.openProfiles),
      // 짐이 없어도 짐 설정 화면으로 먼저 들어간다. 다른 화면 위에 모달만
      // 띄우면 어디로 갔는지 알 수 없고 탭 표시도 어긋난다.
      tab('gym', 'gear', '클라이밍장', () => actions.openGymSettings(state.ui.gymId)),
    ),
  );
}

/* ============================================================
   부팅 — 시드는 최초 1회만. 사용자 데이터를 덮어쓰지 않는다.
   ============================================================ */
async function boot() {
  root = document.getElementById('app');
  let loaded = store.loadAll();

  // 시드 버전이 오르면 목록을 갱신한다. 사용자 흔적은 mergeSeed가 지킨다.
  if ((loaded.meta?.seedVersion ?? 0) < SEED_VERSION) {
    try {
      const { gyms: fresh, version } = await loadSeed();
      const gyms = loaded.gyms.length ? mergeSeed(loaded.gyms, fresh) : fresh;
      store.replaceAll({ ...loaded, gyms, meta: { ...loaded.meta, seedVersion: version, seeded: true } });
      loaded = store.loadAll();
    } catch (err) {
      console.warn('시드를 불러오지 못해 기존 목록을 유지해요.', err);
    }
  }

  /*
   * 방에 붙는다.
   *
   * 첫 화면은 캐시로 이미 그릴 수 있으므로 여기서 기다리는 건 잠깐이다.
   * 실패해도 앱은 돈다 — 서버가 없을 뿐 기록은 이 브라우저에 쌓인다.
   */
  if (synced) {
    try {
      await synced.connect({ onRemoteChange, onStatusChange: onSyncStatus });
      loaded = store.loadAll();
    } catch (err) {
      console.warn('방에 붙지 못했어요. 이 브라우저에만 저장합니다.', err);
    }
  }

  Object.assign(state, loaded);
  state.ui.profileId = state.profiles[0]?.id ?? null;

  const me = state.profiles.find((p) => p.id === state.ui.profileId);
  state.ui.gymId = me?.primaryGymId
    ?? sortGyms(state.gyms.filter((g) => g.favorite))[0]?.id
    ?? null;

  render();
}

boot();
