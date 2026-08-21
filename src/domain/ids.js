/** 안정적인 id 생성. crypto.randomUUID가 없는 환경(구형 사파리)도 대비한다. */
export function uid(prefix = 'id') {
  const rand = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

/** 짐 이름에서 만드는 안정적 slug. 시드를 다시 적재해도 같은 id가 나온다. */
export function slugId(prefix, name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

/** 로컬 기준 YYYY-MM-DD. 타임존 변환으로 "어제 세션"이 되는 사고를 막는다. */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
