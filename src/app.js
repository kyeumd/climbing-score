/** 라우팅과 상태 조립. 저장 어댑터를 여기서 한 번만 주입한다. */
import { createLocalStorageAdapter } from './storage/local-storage.js';
import { loadSeed, mergeSeed, SEED_VERSION } from './storage/seed.js';
import { emptyState } from './storage/adapter.js';
import { localDate, uid } from './domain/ids.js';
import {
  toggleFavorite, markVerified, addGrade, updateGrade, moveGrade,
  retireGrade, restoreGrade, sortGyms,
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

// 서버로 옮길 때 여기 한 줄만 바꾼다.
const store = createLocalStorageAdapter();

const state = {
  ...emptyState(),
  ui: { route: 'match', gymId: null, profileId: null, date: localDate(), gymSettingsId: null, adding: false },
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
  toggleRetire(gymId, gradeId, retire) {
    patchGym(gymId, (gym) => (retire ? retireGrade(gym, gradeId) : restoreGrade(gym, gradeId)));
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
   * 예전에는 참가자 목록을 띄웠다. 그런데 대결 격자는 이미 모든 참가자를
   * 보여주므로, 목록에서 이름을 눌러도 화면이 그대로였다. 누른 사람은
   * 아무 일도 안 일어났다고 느낀다. 세 군데 호출부의 뜻이 모두 '만들기' 라
   * 바로 이름 입력으로 간다.
   */
  /*
   * 참가자는 팝업이 아니라 격자 안에서 바로 붙였다 뗀다.
   * adding 이 켜지면 머리글 맨 끝에 이름 칸이 한 열 생긴다.
   */
  startAddProfile() { state.ui.adding = true; render(); },
  /* 프로필 화면에서 부르는 자리. 액션을 지우고 호출부를 안 고쳐 버튼이 죽어 있었다. */
  openNewProfile() { state.ui.route = 'profile'; state.ui.adding = true; render(); },
  openProfilePicker() { actions.openNewProfile(); },
  /* 이 사람 기록 보기 — 고르고 기록 화면으로 넘어간다 */
  showProfileStats(id) {
    state.ui.profileId = id;
    state.ui.route = 'stats';
    render();
  },
  stopAddProfile() { state.ui.adding = false; render(); },
  addProfile(name) {
    const profile = createProfile({ name, primaryGymId: state.ui.gymId });
    store.saveProfile(profile);
    if (!state.ui.profileId) state.ui.profileId = profile.id;
    // adding 을 켜 둔 채 다시 그린다. 이름 칸이 그대로 남아 다음 이름을 받는다.
    reload();
  },
  /* 확인은 부르는 쪽(confirmModal)이 이미 받았다. 여기서는 지우기만 한다. */
  dropProfile(id) { actions.deleteProfile(id); },
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

const ctx = {
  state,
  actions,
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

  Object.assign(state, loaded);
  state.ui.profileId = state.profiles[0]?.id ?? null;

  const me = state.profiles.find((p) => p.id === state.ui.profileId);
  state.ui.gymId = me?.primaryGymId
    ?? sortGyms(state.gyms.filter((g) => g.favorite))[0]?.id
    ?? null;

  render();
}

boot();
