/**
 * 암장 목록·난이도 수집기.
 *
 * 두 단계는 분리되어 있다.
 *   1단계 목록: 넓을수록 좋다. 난이도를 몰라도 사용자가 고를 수 있어야 한다.
 *   2단계 난이도: 아는 곳만 채우고, 나머지는 사용자가 현장에서 입력한다.
 *
 * 중간 결과를 tools/cache/에 남겨 다시 돌릴 때 네트워크를 아낀다.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const CACHE = 'tools/cache';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fresh = process.argv.includes('--fresh');

async function cached(name, fn) {
  const path = `${CACHE}/${name}.json`;
  if (!fresh && existsSync(path)) {
    console.log(`   (캐시) ${name}`);
    return JSON.parse(readFileSync(path, 'utf8'));
  }
  const data = await fn();
  writeFileSync(path, JSON.stringify(data, null, 1));
  return data;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch { out[idx] = null; }
      await sleep(55);
    }
  }));
  return out;
}

console.log('1단계: 전국 암장 이름');
const names = await cached('spiri7-names', async () => {
  const r = await fetch('https://api.spiri7.com/api/v1/companies/gyms');
  return r.json();
});
console.log(`   ${names.length}곳`);

console.log('2단계: 상세(주소·id·종목)');
let done = 0;
const detail = await cached('spiri7-detail', async () => {
  const rows = await pool(names, 6, async (name) => {
    const res = await fetch(`https://spiri7.com/gym/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const m = (await res.text()).match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) return null;
    const d = JSON.parse(m[1])?.props?.pageProps?.datas;
    if (++done % 150 === 0) console.log(`   ${done}/${names.length}`);
    return d?.id ? { id: d.id, name: d.name, address: d.address ?? '',
                     lat: d.lat, lng: d.lng, category2: d.category2,
                     exercises: (d.exercises ?? []).map((e) => e.name) } : null;
  });
  return rows.filter(Boolean);
});
console.log(`   ${detail.length}곳`);

// 서울 전부를 후보로 삼는다. 볼더링 종목 등록 여부로 거르면
// 등록만 안 해둔 볼더링짐이 통째로 빠진다.
const SEOUL = /^서울/;
const GYMISH = /클라이밍|볼더|클라임|climb|boulder/i;
const NOT_GYM = /파쿠르|용품|샵|스토어|아카데미협회/i;
/* 다른 시·도가 주소에 박혀 있으면 서울이 아니다 */
const OTHER_SIDO = /^(경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/;

/*
 * 주소 대신 속칭만 적어 둔 곳이 있다. 그루트클라이밍의 주소는 "뚝섬" 한 단어다.
 * /^서울/ 로만 거르면 이런 곳이 통째로 사라진다 — 실제로 그래서 빠져 있었다.
 * 자치구를 특정할 수 있는 서울 동네 이름만 표로 둔다. 애매한 것은 넣지 않는다.
 */
const SEOUL_ALIAS = {
  뚝섬: '성동구', 성수: '성동구', 서울숲: '성동구', 왕십리: '성동구',
  홍대: '마포구', 합정: '마포구', 상수: '마포구', 연남: '마포구', 망원: '마포구',
  강남: '강남구', 역삼: '강남구', 삼성동: '강남구', 대치: '강남구', 논현: '강남구',
  신사: '강남구', 압구정: '강남구', 청담: '강남구',
  잠실: '송파구', 석촌: '송파구', 문정: '송파구',
  신촌: '서대문구', 이대: '서대문구', 연희: '서대문구',
  건대: '광진구', 구의: '광진구',
  이수: '동작구', 사당: '동작구', 노량진: '동작구',
  신림: '관악구', 서울대입구: '관악구',
  문래: '영등포구', 여의도: '영등포구', 당산: '영등포구',
  종로: '종로구', 광화문: '종로구', 을지로: '중구', 명동: '중구', 충무로: '중구',
  용산: '용산구', 이태원: '용산구', 한남: '용산구',
  목동: '양천구', 마곡: '강서구', 화곡: '강서구',
  상계: '노원구', 노원: '노원구', 수유: '강북구', 미아: '강북구',
  창동: '도봉구', 성북: '성북구', 안암: '성북구', 회기: '동대문구', 청량리: '동대문구',
  면목: '중랑구', 상봉: '중랑구', 은평: '은평구', 연신내: '은평구',
  구로: '구로구', 신도림: '구로구', 가산: '금천구', 독산: '금천구',
  천호: '강동구', 길동: '강동구', 방배: '서초구', 서초: '서초구', 교대: '서초구',
};
const aliasGu = (addr) => {
  const t = String(addr ?? '').trim();
  if (!t || OTHER_SIDO.test(t) || SEOUL.test(t)) return null;
  for (const [k, gu] of Object.entries(SEOUL_ALIAS)) if (t.includes(k)) return gu;
  return null;
};
/* 서울 여부와 자치구를 함께 정한다. 주소가 정식이면 거기서, 속칭이면 표에서. */
const withGu = detail.map((g) => {
  const gu = SEOUL.test(g.address)
    ? (g.address.match(/서울\S*\s+(\S+구)/)?.[1] ?? null)
    : aliasGu(g.address);
  return gu ? { ...g, gu } : null;
}).filter(Boolean);

/* 실내 여부는 이름 정규식으로 짐작하지 않는다. spiri7 이 category2 로 알려 준다. */
const seoul = withGu.filter((g) =>
  (g.category2 ? g.category2 === 'indoor' : (GYMISH.test(g.name) || g.exercises.length))
  && !NOT_GYM.test(g.name));
console.log(`   (주소 ${withGu.filter((g) => SEOUL.test(g.address)).length}곳`
  + ` + 속칭 ${withGu.filter((g) => !SEOUL.test(g.address)).length}곳)`);
console.log(`3단계: 서울 후보 ${seoul.length}곳 난이도 조회`);

/*
 * 색 체계를 등록하지 않은 짐에는 API 가 표준 V등급 20개를 그대로 돌려준다.
 * (Vb, V0-, V0, V0+, V1 ... V16) 확인해 보니 서로 다른 두 짐이 글자 하나까지
 * 같은 목록을 내놨다. 그 짐의 벽 세팅이 아니라 기본값이라는 뜻이다.
 * 이걸 그대로 받으면 색 등급을 안 쓰는 12곳에 없는 데이터가 생긴다.
 */
const V_ONLY = /^V(b|\d+[-+]?)$/i;
const isDefaultVScale = (labels) =>
  labels.length >= 15 && labels.every((l) => V_ONLY.test(String(l).trim()));

let d2 = 0;
let vSkipped = 0;
const graded = await cached('spiri7-seoul-grades', async () => pool(seoul, 5, async (g) => {
  const res = await fetch(`https://api.spiri7.com/api/v1/companies/gyms/${g.id}/skill?exerciseId=1`);
  if (++d2 % 50 === 0) console.log(`   ${d2}/${seoul.length}`);
  if (!res.ok) return { ...g, grades: [] };
  const j = await res.json();
  const raw = (j.grades ?? []).slice().sort((a, b) => a.match_level - b.match_level);
  if (isDefaultVScale(raw.map((x) => x.name))) { vSkipped++; return { ...g, grades: [] }; }
  const grades = raw.map((x, i) => ({ label: x.name, order: i, matchLevel: x.match_level }));
  return { ...g, grades };
}));
if (vSkipped) console.log(`   기본 V등급만 있어 건너뜀: ${vSkipped}곳`);

const withG = graded.filter((g) => g?.grades?.length);
console.log(`\n서울 ${graded.length}곳 / 난이도 ${withG.length}곳 (${Math.round(withG.length / graded.length * 100)}%)`);
writeFileSync(`${CACHE}/seoul-raw.json`, JSON.stringify(graded.filter(Boolean), null, 1));
