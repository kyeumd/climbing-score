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
import { createProfile, setLevel as setProfileLevel } from './domain/profile.js';
import { h, clear, button, icon, modal } from './ui/components.js';
import { viewMatch } from './ui/view-match.js';
import { viewStats } from './ui/view-stats.js';
import { viewProfile } from './ui/view-profile.js';
import { viewGym } from './ui/view-gym.js';
import { viewScoreTable } from './ui/view-score-table.js';
import { openGymPicker } from './ui/gym-picker.js';

// 서버로 옮길 때 여기 한 줄만 바꾼다.
const store = createLocalStorageAdapter();

const state = {
  ...emptyState(),
  ui: { route: 'match', gymId: null, profileId: null, date: localDate(), gymSettingsId: null },
};

let root;

/* ============================================================
   상태 저장 후 다시 그리기
   ============================================================ */
function persistGym(gym) { store.saveGym(gym); reload(); }
function persistProfile(p) { store.saveProfile(p); reload(); }

function reload() {
  const loaded = store.loadAll();
  state.profiles = loaded.profiles;
  state.gyms = loaded.gyms;
  state.sessions = loaded.sessions;
  state.meta = loaded.meta;
  render();
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
    openGymPicker(ctx);
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
  openLevelPicker(profileId) {
    const p = state.profiles.find((x) => x.id === profileId);
    if (p) import('./ui/view-profile.js').then((m) => m.openLevels(p, ctx));
  },

  /** 세션이 없으면 이 시점에 만든다. 레벨과 점수표를 스냅샷으로 박는다. */
  bump(session, gradeId, delta) {
    const existing = findSession(state.sessions, {
      profileId: session.profileId, gymId: session.gymId, date: session.date,
    });
    const base = existing ?? session;
    store.saveSession(bumpCount(base, gradeId, delta));
    reload();
  },

  saveSession(session) { store.saveSession(session); reload(); },
  deleteSession(id) { store.deleteSession(id); reload(); },

  openProfilePicker() { profilePicker(); },
  openNewProfile() { newProfile(); },
  deleteProfile(id) {
    store.deleteProfile(id);
    if (state.ui.profileId === id) state.ui.profileId = null;
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

const ctx = { state, actions };

/* ============================================================
   작은 모달들
   ============================================================ */
function profilePicker() {
  const body = h('div', {},
    state.profiles.length === 0
      ? h('p', { class: 'subtitle', style: { marginBottom: '1rem' } }, '아직 프로필이 없습니다.')
      : h('ul', { class: 'profilelist' }, state.profiles.map((p) =>
          h('li', { class: 'profilerow' },
            h('button', {
              class: 'profilerow__pick', type: 'button',
              onclick: () => { actions.setProfile(p.id); sheet.close(); },
            },
              h('span', { class: 'avatar' }, p.name.slice(0, 1)),
              h('span', { class: 'profilerow__name' }, p.name),
            ),
          ))),
    h('div', { style: { marginTop: '1rem' } },
      button('새 참가자', {
        onClick: () => { sheet.close(); newProfile(); }, variant: 'solid', trailing: 'plus',
      }),
    ),
  );
  const sheet = modal('참가자', body);
}

function newProfile() {
  const input = h('input', { class: 'field', placeholder: '이름', autofocus: true });
  const submit = () => {
    const name = input.value.trim();
    if (!name) return;
    const profile = createProfile({ name, primaryGymId: state.ui.gymId });
    store.saveProfile(profile);
    state.ui.profileId = profile.id;
    sheet.close();
    reload();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const sheet = modal('새 참가자',
    h('div', {}, input,
      h('div', { style: { marginTop: '1rem' } },
        button('추가', { onClick: submit, variant: 'solid', trailing: 'check' }))),
  );
  setTimeout(() => input.focus(), 50);
}

function newGym() {
  const name = h('input', { class: 'field', placeholder: '클라이밍장 이름' });
  const gu = h('input', { class: 'field field--sm', placeholder: '구 (예: 강남구)' });
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
  const sheet = modal('클라이밍장 추가',
    h('div', {},
      h('div', { class: 'fieldrow' }, name, gu),
      h('p', { class: 'hint', style: { marginTop: '0.75rem' } },
        '추가 후 난이도 색을 등록하는 화면으로 넘어갑니다.'),
      h('div', { style: { marginTop: '1rem' } },
        button('추가', { onClick: submit, variant: 'solid', trailing: 'check' })),
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
      tab('gym', 'gear', '짐 설정', () => actions.openGymSettings(state.ui.gymId)),
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
      console.warn('시드를 불러오지 못해 기존 목록을 유지합니다.', err);
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
