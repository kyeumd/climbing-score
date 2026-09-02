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
import { open, HELPERS as BASE } from './seed.mjs';
import { readdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'tools/flows';
const filter = process.argv[2] ?? null;

/** seed.mjs 의 헬퍼에 이 도구에서만 쓰는 둘을 얹는다 */
const HELPERS = `
  ${BASE}
  const $ = q;
  const hold = (el) => new Promise(r => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    setTimeout(() => { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); r(); }, 600); });
`;

const FLOWS = [
  {
    name: '완등 기록',
    steps: [
      ['시작', null],
      ['초록 탭 (+1)', `tap($('.grid__row button', 3))`],
      ['초록 두 번 더', `tap($('.grid__row button', 3)); await wait(250); tap($('.grid__row button', 3))`],
      ['남색 탭 (역전 시도)', `tap($('.grid__row button', 5)); await wait(250); tap($('.grid__row button', 5))`],
      ['길게 눌러 취소', `await hold($('.grid__row button', 5))`],
    ],
  },
  {
    name: '참가자 추가',
    steps: [
      ['시작', null],
      ['참가자 추가', `tap(byText('.btn', '참가자 추가'))`],
      ['이름 입력', `const i = $('.grid__new'); i.focus(); i.value = '민서'`],
      ['엔터로 추가', `const i = $('.grid__new');
                     i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                     await wait(400);
                     const o = $('.grid__new');
                     if (o) o.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`],
      // .grid__row button 을 전체에서 세면 열이 늘어난 만큼 어긋난다.
      // 두 번째 줄의 두 번째 칸(= 새 참가자)을 콕 집는다.
      ['새 참가자로 기록', `tap(q('.grid__row', 1).querySelectorAll('.cell')[1])`],
    ],
  },
  {
    name: '짐 바꾸기',
    steps: [
      ['시작', null],
      ['짐 선택기 열기', `tap($('.matchbar__gym'))`],
      // 자치구 칩은 없앴다. 검색창이 지역까지 찾는다.
      ['지역으로 검색', `const i = $('.field[type=search]'); i.value = '송파';
                       i.dispatchEvent(new Event('input', { bubbles: true }))`],
      ['짐 고르기', `tap($('.gymrow__pick'))`],
      ['난이도 확인 배너', `null`],
      ['맞아요 누르기', `tap(byText('.btn', '맞아요'))`],
    ],
  },
  {
    name: '난이도 편집',
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
    fresh: true,
    steps: [
      ['빈 상태', null],
      ['클라이밍장 고르기', `tap(byText('.btn', '클라이밍장'))`],
      ['검색', `const i = $('.field[type=search]'); i.value = '더클라임';
               i.dispatchEvent(new Event('input', { bubbles: true }))`],
      ['짐 선택', `tap($('.gymrow__pick'))`],
      // 색 순서 확인 배너가 먼저 뜬다. 버튼 이름은 '프로필' 이 아니라 '참가자 추가' 다.
      ['색 순서 확인', `const ok = byText('.btn', '맞아요'); if (ok) tap(ok)`],
      ['참가자 추가', `tap(byText('.btn', '참가자 추가'))`],
      ['이름 입력 후 추가', `const i = $('.grid__new'); i.focus(); i.value = '나';
                          i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                          await wait(400);
                          const o = $('.grid__new');
                          if (o) o.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`],
      ['첫 완등 기록', `tap($('.grid__row button', 2))`],
    ],
  },
];

// 이름을 걸러 한 흐름만 돌릴 때도 전부 지우고 있었다. 아무것도 안 맞으면
// 남아 있던 스트립까지 사라져, 방금 지운 걸 다시 찍어야 했다. 돌릴 것만 지운다.
const targets = FLOWS.filter((f) => !filter || f.name.includes(filter));
if (!targets.length) {
  console.log(`'${filter}' 와 맞는 흐름이 없습니다: ${FLOWS.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
for (const f of readdirSync(OUT)) {
  if (!f.endsWith('.png')) continue;
  if (targets.some((t) => f.includes(t.name.replace(/\s/g, '')))) unlinkSync(`${OUT}/${f}`);
}

for (const flow of targets) {
  const page = await (await launch({ width: 414, height: 896, dark: true })).connect();
  const frames = [];
  try {
    // 데모가 아니라 실제 앱을 눌러서 상태를 만든다 (seed.mjs 주석 참고)
    await open(page, { seed: !flow.fresh, sleep });

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
