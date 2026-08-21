/** 사용자가 실제로 보는 화면. 데모 픽스처가 아니라 index.html 을 그대로 본다. */
import { launch, sleep } from './cdp.mjs';
const S='tools/shots';
const p = await (await launch({width:414,height:896,dark:true})).connect();
await p.goto('http://localhost:8099/index.html', {wait:700});
await p.eval(() => localStorage.clear());
await p.goto('http://localhost:8099/index.html', {wait:2600});
await p.shot(`${S}/_r1.png`);
// 사용자가 하듯 짐을 고른다
await p.eval(() => [...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('클라이밍장'))?.click());
await sleep(800);
await p.shot(`${S}/_r2.png`);
await p.eval(() => { document.querySelector('.modal__body').scrollTop = 260; });
await sleep(400);
await p.shot(`${S}/_r3.png`);
console.log('실제 앱 3장');
await p.close();
