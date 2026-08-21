/** 길게 눌러 감소가 정확히 -1 되는지, 손 뗄 때 다시 세지 않는지 확인 */
import { launch, sleep } from './cdp.mjs';
const p = await (await launch({ width: 414, height: 896, dark: true })).connect();
await p.goto('http://localhost:8099/tools/demo.html', { wait: 2300 });

const read = () => p.eval(() => ({
  총점: Number(document.querySelector('.total__score')?.dataset.value ?? -1),
  초록: document.querySelectorAll('.gcard')[3]?.querySelector('.gcard__count')?.textContent || '0',
}));

console.log('시작        ', JSON.stringify(await read()));

// 탭 3번 (실제 터치 입력)
for (let i = 0; i < 3; i++) { await p.tap('.gcard', { nth: 3 }); }
console.log('탭 x3       ', JSON.stringify(await read()));

// 길게 누르기 2번
await p.tap('.gcard', { nth: 3, holdMs: 700 });
console.log('길게 x1     ', JSON.stringify(await read()));
await p.tap('.gcard', { nth: 3, holdMs: 700 });
console.log('길게 x2     ', JSON.stringify(await read()));

// 0에서 더 길게 눌러도 음수가 되지 않아야 한다
await p.tap('.gcard', { nth: 3, holdMs: 700 });
await p.tap('.gcard', { nth: 3, holdMs: 700 });
console.log('0에서 길게  ', JSON.stringify(await read()));
await p.close();
