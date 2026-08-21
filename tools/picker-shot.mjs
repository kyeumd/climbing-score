import { launch, sleep } from './cdp.mjs';
const S='tools/shots';
const p = await (await launch({width:414,height:896,dark:true})).connect();
await p.goto('http://localhost:8099/tools/demo.html', {wait:2300});
await p.eval(() => document.querySelector('.matchbar__gym').click());
await sleep(700);
await p.shot(`${S}/_pick0.png`);
await p.eval(() => { const b=document.querySelector('.modal__body'); b.scrollTop=420; });
await sleep(400);
await p.shot(`${S}/_pick1.png`);
const m = await p.eval(() => {
  const q=s=>document.querySelector(s), b=s=>{const e=q(s);if(!e)return null;
    const r=e.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),h:Math.round(r.height)};};
  return {head:b('.modal__head'), search:b('.field[type=search]'), chips:b('.chips'),
          firstRow:b('.gymrow'), scrolled:q('.modal__body').scrollTop};
});
console.log(JSON.stringify(m));
await p.close();
