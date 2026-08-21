/**
 * 동작 흐름 검토.
 *
 * 정지 화면만 보면 "누르면 어떻게 되는가"를 못 본다. 카운트가 오르는지,
 * 순위가 바뀌는지, 모달이 제대로 닫히는지는 시퀀스로만 드러난다.
 *
 * 각 상호작용 스텝마다 캡처해 한 줄 스트립으로 합친다. 녹화 영상과 달리
 * 정지 프레임이라 눈으로 훑고 이상한 칸을 짚어낼 수 있다.
 *
 *   node tools/flow.mjs            전체 흐름
 *   node tools/flow.mjs 기록       이름에 '기록'이 든 흐름만
 */
import { launch, sleep } from './cdp.mjs';
import { readdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'tools/flows';
const DEMO = 'http://localhost:8099/tools/demo.html';
const FRESH = 'http://localhost:8099/index.html';
const filter = process.argv[2] ?? null;

/** 브라우저 안에서 도는 헬퍼들 */
const HELPERS = `
  const $ = (s, n = 0) => document.querySelectorAll(s)[n];
  const byText = (s, t) => [...document.querySelectorAll(s)].find(e => e.textContent.includes(t));
  const tap = (el) => { if (!el) throw new Error('없음');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    // .gcard는 pointer 이벤트로 동작하지만 일반 버튼은 click 핸들러를 쓴다
    if (!el.classList.contains('gcard')) el.click(); };
  const hold = (el) => new Promise(r => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    setTimeout(() => { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); r(); }, 600); });
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
`;

const FLOWS = [
  {
    name: '완등 기록',
    url: DEMO,
    steps: [
      ['시작', null],
      ['초록 탭 (+1)', `tap($('.gcard', 3))`],
      ['초록 두 번 더', `tap($('.gcard', 3)); await wait(250); tap($('.gcard', 3))`],
      ['남색 탭 (역전 시도)', `tap($('.gcard', 5)); await wait(250); tap($('.gcard', 5))`],
      ['길게 눌러 취소', `await hold($('.gcard', 5))`],
    ],
  },
  {
    name: '참가자 추가',
    url: DEMO,
    steps: [
      ['시작', null],
      ['참가자 추가', `tap(byText('.btn', '참가자 추가'))`],
      ['새 참가자', `tap(byText('.modal .btn', '새 참가자'))`],
      ['이름 입력', `const i = $('.modal .field'); i.value = '민서';
                    i.dispatchEvent(new Event('input', { bubbles: true }))`],
      ['추가 완료', `tap(byText('.modal .btn', '추가'))`],
      ['새 참가자로 기록', `tap($('.gcard', 2))`],
    ],
  },
  {
    name: '짐 바꾸기',
    url: DEMO,
    steps: [
      ['시작', null],
      ['짐 선택기 열기', `tap($('.matchbar__gym'))`],
      ['구 칩 선택', `tap($('.chip', 2))`],
      ['짐 고르기', `tap($('.gymrow__pick', 1))`],
      ['난이도 확인 배너', `null`],
      ['맞아요 누르기', `tap(byText('.btn', '맞아요'))`],
    ],
  },
  {
    name: '난이도 편집',
    url: DEMO,
    steps: [
      ['짐 설정', `tap($('.tab', 3))`],
      ['색 추가', `tap($('.swatch', 6))`],
      ['순서 내리기', `tap($('.graderow .iconbtn', 1))`],
      ['이름 고치기', `const i = $('.graderow__label'); i.focus(); i.value = '연빨강';
                      i.dispatchEvent(new Event('change', { bubbles: true }))`],
      ['확인 완료 체크', `$('.toggle input').click()`],
    ],
  },
  {
    name: '숙련도 변경',
    url: DEMO,
    steps: [
      ['프로필', `tap($('.tab', 2))`],
      ['숙련도 열기', `tap($('.profilerow .iconbtn'))`],
      ['LV7로 올림', `const s = $('.levelpick__slider'); s.value = 7;
                     s.dispatchEvent(new Event('input', { bubbles: true }))`],
      ['닫기', `tap(byText('.modal .btn', '닫기'))`],
      ['대결 화면 점수 확인', `tap($('.tab', 0))`],
    ],
  },
  {
    name: '세션 수정',
    url: DEMO,
    steps: [
      ['기록', `tap($('.tab', 1))`],
      ['세션 열기', `$('.sessionrow').click()`],
      ['개수 바꾸기', `const i = $('.editrow input', 3); i.value = 9;
                     i.dispatchEvent(new Event('change', { bubbles: true }))`],
      ['저장', `tap(byText('.modal .btn', '저장'))`],
    ],
  },
  {
    name: '첫 실행',
    url: FRESH,
    fresh: true,
    steps: [
      ['빈 상태', null],
      ['클라이밍장 고르기', `tap(byText('.btn', '클라이밍장'))`],
      ['검색', `const i = $('.field[type=search]'); i.value = '더클라임';
               i.dispatchEvent(new Event('input', { bubbles: true }))`],
      ['짐 선택', `tap($('.gymrow__pick'))`],
      ['프로필 고르기', `tap(byText('.btn', '프로필'))`],
      ['새 참가자', `tap(byText('.modal .btn', '새 참가자'))`],
      ['이름 입력 후 추가', `const i = $('.modal .field'); i.value = '나';
                          i.dispatchEvent(new Event('input', { bubbles: true }));
                          await wait(200); tap(byText('.modal .btn', '추가'))`],
      ['첫 완등 기록', `tap($('.gcard', 2))`],
    ],
  },
];

for (const f of readdirSync(OUT)) { if (f.endsWith('.png')) unlinkSync(`${OUT}/${f}`); }

for (const flow of FLOWS) {
  if (filter && !flow.name.includes(filter)) continue;
  const page = await (await launch({ width: 414, height: 896, dark: true })).connect();
  const frames = [];
  try {
    await page.goto(flow.url, { wait: 700 });
    if (flow.fresh) { await page.eval(() => localStorage.clear()); }
    await page.goto(flow.url, { wait: 2400 });

    for (const [label, code] of flow.steps) {
      if (code && code !== 'null') {
        try {
          await page.eval(new Function(`return (async () => { ${HELPERS} ${code} })()`));
        } catch (e) {
          console.log(`  [${flow.name}] "${label}" 실패: ${String(e.message).slice(0, 60)}`);
        }
        await sleep(700);
      }
      const file = `${OUT}/${flow.name.replace(/\s/g, '')}_${frames.length}_${label.replace(/[\s()+]/g, '')}.png`;
      await page.shot(file);
      frames.push([label, file]);
      process.stdout.write('.');
    }
  } catch (e) {
    console.log(`\n${flow.name} 중단: ${String(e.message).slice(0, 70)}`);
  }
  await page.close();

  const py = `
from PIL import Image, ImageDraw, ImageFont
frames = ${JSON.stringify(frames)}
TH, PAD, LBL = 260, 8, 24
BG, FG, AR = (18,18,20), (235,235,240), (120,124,132)
try: font = ImageFont.truetype("/System/Library/Fonts/Supplemental/AppleGothic.ttf", 13)
except Exception: font = ImageFont.load_default()
ims = []
for name, path in frames:
    im = Image.open(path).convert("RGB"); im.thumbnail((TH, TH*3), Image.LANCZOS); ims.append((name, im))
if ims:
    cw = max(i.width for _, i in ims) + PAD*2 + 18
    ch = max(i.height for _, i in ims) + PAD*2 + LBL
    strip = Image.new("RGB", (cw*len(ims), ch), BG)
    d = ImageDraw.Draw(strip)
    for k, (name, im) in enumerate(ims):
        x = k*cw
        d.text((x+PAD, y := 5), f"{k+1}. {name}", fill=FG, font=font)
        strip.paste(im, (x+PAD, LBL))
        d.rectangle([x+PAD-1, LBL-1, x+PAD+im.width, LBL+im.height], outline=(60,60,66))
        if k < len(ims)-1:
            cy = LBL + im.height//2
            d.line([x+PAD+im.width+5, cy, x+cw+PAD-6, cy], fill=AR, width=2)
            d.polygon([(x+cw+PAD-6, cy), (x+cw+PAD-12, cy-4), (x+cw+PAD-12, cy+4)], fill=AR)
    out = "${OUT}/_flow_${flow.name.replace(/\s/g, '')}.png"
    strip.save(out); print(out, strip.size)
`;
  console.log('\n' + execFileSync('python3', ['-c', py]).toString().trim());
}
