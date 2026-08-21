/**
 * 여러 소스를 병합해 앱이 쓰는 시드를 만든다.
 *
 * 목록은 넓게, 난이도는 아는 만큼만. 난이도를 모르는 짐도 목록에는 있어야
 * 사용자가 고르고 직접 채울 수 있다.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const CACHE = 'tools/cache';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLOR = {
  흰색: '#F5F5F5', 하양: '#F5F5F5', 화이트: '#F5F5F5',
  핑크: '#FF6FA5', 분홍: '#FF6FA5',
  빨강: '#E23B34', 빨간색: '#E23B34',
  주황: '#F07C1E', 오렌지: '#F07C1E',
  노랑: '#F2C41D', 노란색: '#F2C41D',
  연두: '#A8D24A', 라임: '#A8D24A',
  초록: '#3FA45B', 녹색: '#3FA45B',
  하늘: '#4FB6E8', 하늘색: '#4FB6E8', 민트: '#3FC7B4',
  파랑: '#2F7DD1', 파란색: '#2F7DD1',
  남색: '#2A3D8F', 네이비: '#2A3D8F',
  보라: '#7B4BC4', 자주: '#8E3B7A',
  회색: '#8A8F98', 그레이: '#8A8F98',
  갈색: '#7A5230', 브라운: '#7A5230',
  검정: '#1C1C1E', 검은색: '#1C1C1E', 블랙: '#1C1C1E',
  별: '#D4AF37', 치즈: '#F0C060',
};
function hexOf(label, i, n) {
  if (COLOR[label]) return COLOR[label];
  // 숫자나 V등급처럼 색이 아닌 라벨은 순서에 따라 회색조로 둔다
  const t = i / Math.max(1, n - 1);
  const v = Math.round(0xE8 - t * 0xC0);
  return `#${v.toString(16).padStart(2, '0').repeat(2)}${Math.min(255, v + 4).toString(16).padStart(2, '0')}`;
}

const ALIAS = { peakers: '피커스', theclimb: '더클라임', allez: '알레', seoulboulders: '서울볼더스',
  climbingpark: '클라이밍파크', onflick: '온플릭', onsight: '온사이트', vertigo: '버티고',
  santa: '산타', warehouse: '웨어하우스', boulderfriends: '볼더프렌즈', koala: '코알라',
  hook: '훅', gateone: '게이트원', theplastic: '더플라스틱' };
function norm(s) {
  let t = s.normalize('NFKC').toLowerCase();
  // "더클라임 연남점 THECLIMB Yeonnam, Seoul" 처럼 영문 병기가 붙은 변형을 같은 짐으로 본다
  t = t.replace(/[,\-]?\s*seoul\b.*$/i, '');
  t = t.replace(/\b(yeonnam|sillim|isu|gangnam|hongdae|seongsu|mullae|magok|sadang|nonhyeon|yangjae)\b/gi, '');
  for (const [en, ko] of Object.entries(ALIAS)) t = t.replaceAll(en, ko);
  t = t.replace(/[a-z]+/g, '');
  t = t.replace(/[\s\-_()·,.]|클라이밍|볼더링|볼더스|짐|센터|점/g, '');
  return t;
}
const guOf = (a) => (a || '').match(/서울\S*\s+(\S+구)/)?.[1] ?? null;

/**
 * 이름이 달라 자동 매칭이 안 되지만 같은 곳으로 확인된 짝.
 * 왼쪽 이름을 오른쪽으로 바꿔 하나로 합친다.
 */
const SAME_PLACE = {
  '서울볼더스 선유': '서울볼더스 클라이밍 컴퍼니',
  '온사이트 클라이밍': '온플릭클라이밍 삼성점',
  '클라이밍88': 'KBS스포츠월드 88클라이밍센터',
};
const canonical = (name) => SAME_PLACE[name.trim()] ?? name;

/**
 * 조사로 걸러낸 항목. 자동 필터로는 잡히지 않는다.
 *   브이업짐        헬스·피트니스 체인이며 클라이밍장이 아니다
 *   이창현클라이밍   폐업 (2호점 비숍 클라이밍은 별도로 목록에 있다)
 *   몽키즈클라이밍   마포구 주소는 본사다. 실제 지점은 북가좌점(서대문구)
 */
const EXCLUDE = new Set(['브이업짐', '이창현클라이밍', '몽키즈클라이밍']);

// 이 앱은 친구들과 하는 실내 볼더링 내기용이다.
// 야외 인공암벽장, 대학·공공 체육시설은 색 등급 체계가 없거나 일반 이용이 어렵다.
const NOT_GYM = /파쿠르|용품|샵|스토어|아카데미협회/i;
const OUTDOOR_OR_PUBLIC =
  /인공암벽|암벽등반공원|스포츠\s*클라이밍\s*경기장|한강공원|폭포공원|대학교|여대|고려대|체육관|레포츠\s*센터|피트니스|청소년|BAC\s*센터|유수지/i;
const isTarget = (name) =>
  !NOT_GYM.test(name) && !OUTDOOR_OR_PUBLIC.test(name) && !EXCLUDE.has(name.trim());

const rows = [];
const index = new Map();
function findSimilar(k, gu) {
  if (index.has(k)) return index.get(k);
  // 한글 브랜드명은 두 글자로도 변별된다 ("산타", "알레"). 영문 기준 3자로 잡으면 놓친다.
  if (k.length < 2) return null;
  for (const [key, g] of index) {
    if (g.gu !== gu || key.length < 2) continue;
    if (key.startsWith(k) || k.startsWith(key)) return g;
  }
  return null;
}

function addGym(rawName, gu, grades, source, exercises) {
  if (!gu) return false;
  const name = canonical(rawName);
  const k = norm(name);
  const prev = findSimilar(k, gu);
  if (prev) {
    // 이미 있으면 난이도가 더 풍부한 쪽을 남긴다
    if ((grades?.length ?? 0) > prev.grades.length) {
      prev.grades = grades; prev.gradesSource = source;
    }
    // 영문 병기가 붙은 긴 이름보다 짧고 한글인 이름을 쓴다
    const hangul = (x) => (x.match(/[가-힣]/g) ?? []).length / Math.max(1, x.length);
    if (hangul(name) > hangul(prev.name) + 0.15 || (hangul(name) >= hangul(prev.name) && name.length < prev.name.length)) {
      prev.name = name;
    }
    return false;
  }
  const g = { name, gu, grades: grades ?? [], gradesSource: grades?.length ? source : null };
  // 볼더링 종목이 없고 난이도도 없으면 지구력·리드 중심 암장이다.
  // 색 등급을 안 쓰는 곳을 "난이도 미등록"으로 적으면 데이터가 빠진 것처럼 읽힌다.
  if (!g.grades.length && exercises && !exercises.includes('볼더링')) {
    g.kinds = exercises.filter((x) => x !== '볼더링');
  }
  index.set(k, g); rows.push(g);
  return true;
}

// --- 스피릿: 목록 + 난이도 -------------------------------------------
const sp = JSON.parse(readFileSync(`${CACHE}/seoul-raw.json`, 'utf8'));
let n1 = 0;
for (const g of sp) {
  if (!isTarget(g.name)) continue;
  const grades = (g.grades ?? []).map((x, i, arr) =>
    ({ label: x.label, color: hexOf(x.label, i, arr.length), order: i }));
  if (addGym(g.name, guOf(g.address), grades, '스피릿(spiri7) 등급 DB', g.exercises)) n1++;
}
console.log(`스피릿: ${n1}곳`);

// --- climblife: 목록 보강 --------------------------------------------
let n2 = 0;
const cl = await (async () => {
  const p = `${CACHE}/climblife.json`;
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  const r = await fetch('https://climblife.co.kr/api/gyms?limit=500');
  const j = await r.json();
  writeFileSync(p, JSON.stringify(j.items ?? [], null, 1));
  return j.items ?? [];
})();
for (const g of cl) {
  if (g.region !== '서울') continue;
  if (!/클라이밍|볼더|클라임|climb|boulder/i.test(g.name)) continue;
  if (!isTarget(g.name)) continue;
  // 이름이 거의 영문뿐이면 같은 짐의 영문 표기일 뿐이다. 한글 이름 쪽을 남긴다.
  if ((g.name.match(/[가-힣]/g) ?? []).length < 2) continue;
  if (addGym(g.name.split(' Theclimb')[0].split('(')[0].trim(), guOf(g.address), [], null)) n2++;
}
console.log(`climblife 보강: +${n2}곳`);

// --- OpenStreetMap: 목록 보강 (재배포 허용) ---------------------------
let n3 = 0;
const osm = await (async () => {
  const p = `${CACHE}/osm.json`;
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  // Overpass는 자주 rate limit이 걸린다. 실패해도 나머지 소스로 진행한다.
  const MIRRORS = ['https://overpass-api.de/api/interpreter',
                   'https://overpass.kumi.systems/api/interpreter'];
  const q = `[out:json][timeout:90];(nwr["sport"~"climbing"](37.41,126.76,37.71,127.19);
    nwr["name"~"클라이밍|볼더링|클라임",i](37.41,126.76,37.71,127.19););out center tags;`;
  for (const url of MIRRORS) {
    try {
      const r = await fetch(url, { method: 'POST', body: q });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text.trim().startsWith('{')) continue;
      const j = JSON.parse(text);
      writeFileSync(p, JSON.stringify(j.elements ?? [], null, 1));
      return j.elements ?? [];
    } catch { await sleep(1500); }
  }
  console.log('   (OSM 응답 없음, 건너뜀)');
  return [];
})();
for (const e of osm) {
  const t = e.tags ?? {};
  if (!t.name || !/클라이밍|볼더|클라임|climb|boulder/i.test(t.name)) continue;
  if (!isTarget(t.name)) continue;
  const gu = t['addr:district'] ?? guOf(t['addr:full']);
  if (addGym(t.name.split(' onsight')[0].trim(), gu, [], null)) n3++;
}
console.log(`OSM 보강: +${n3}곳`);

rows.sort((a, b) => a.gu.localeCompare(b.gu, 'ko') || a.name.localeCompare(b.name, 'ko'));
writeFileSync('data/gyms.seed.json', JSON.stringify(rows, null, 1));

const withG = rows.filter((r) => r.grades.length);
const gus = new Set(rows.map((r) => r.gu));
console.log(`\n최종 ${rows.length}곳 / ${gus.size}개 구 / 난이도 ${withG.length}곳 (${Math.round(withG.length / rows.length * 100)}%)`);
const byGu = {};
for (const r of rows) byGu[r.gu] = (byGu[r.gu] ?? 0) + 1;
console.log(Object.entries(byGu).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
