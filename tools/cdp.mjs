/**
 * 의존성 없는 Chrome DevTools Protocol 드라이버.
 * Node 내장 WebSocket만 쓴다. 실제 마우스/키보드 입력을 보내므로
 * dump-dom과 달리 "진짜로 눌러본" 결과를 얻는다.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let launchSeq = 0;

/*
 * 띄운 브라우저를 전부 기억해 두고 프로세스가 끝날 때 정리한다.
 * 스크립트가 중간에 던지면 close() 가 실행되지 않아 헤드리스 크롬이 살아남는데,
 * 그게 쌓이면 다음 실행이 그 좀비에 붙어 버린다. 그러면 방금 만든 화면이 아니라
 * 남의 화면을 검사하게 되고, 도구는 아무 문제 없다고 보고한다.
 */
const alive = new Set();
let cleanupHooked = false;
function hookCleanup() {
  if (cleanupHooked) return;
  cleanupHooked = true;
  const bye = () => { for (const p of [...alive]) kill(p); };
  process.on('exit', bye);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { bye(); process.exit(1); });
  process.on('uncaughtException', (e) => { bye(); throw e; });
}

function kill(handle) {
  alive.delete(handle);
  try { handle.proc.kill('SIGKILL'); } catch {}
  try {
    if (handle.profile && existsSync(handle.profile)) {
      rmSync(handle.profile, { recursive: true, force: true });
    }
  } catch {}
}

export async function launch({ width = 414, height = 896, dark = true } = {}) {
  hookCleanup();
  // 포트를 직접 고르지 않는다. 0 을 주면 크롬이 빈 포트를 잡고 그 번호를
  // DevToolsActivePort 파일에 적어 준다. 번호를 우리가 정하면 앞선 실행이 남긴
  // 브라우저와 충돌해, 새로 띄운 줄 알고 옛 브라우저를 조종하게 된다.
  const profile = `/tmp/cdp-climbing-${process.pid}-${launchSeq++}`;
  const args = [
    '--remote-debugging-port=0',
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', `--user-data-dir=${profile}`, '--disable-application-cache',
    `--window-size=${width},${height}`,
    dark ? '--force-dark-mode' : '--force-light-mode',
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  const handle = { proc, profile };
  alive.add(handle);

  const portFile = `${profile}/DevToolsActivePort`;
  let port = null;
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    try {
      const first = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (first) { port = Number(first); break; }
    } catch {}
  }
  if (!port) { kill(handle); throw new Error('Chrome이 포트를 열지 못했습니다'); }

  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch {}
    await sleep(150);
  }
  if (!target) { kill(handle); throw new Error('Chrome에 붙지 못했습니다'); }
  return new Page(handle, target.webSocketDebuggerUrl, { width, height }, dark);
}

class Page {
  constructor(handle, wsUrl, viewport, dark = true) {
    this.handle = handle;
    this.proc = handle.proc;
    this.wsUrl = wsUrl;
    this.viewport = viewport;
    this.dark = dark;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(msg.params.exceptionDetails.exception?.description
          ?? msg.params.exceptionDetails.text);
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        this.consoleErrors.push(msg.params.entry.text);
      }
    });
    await this.send('Network.enable');
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Log.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.viewport.width, height: this.viewport.height,
      deviceScaleFactor: 2, mobile: true,
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await this.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-color-scheme', value: this.dark ? 'dark' : 'light' }],
    });
    return this;
  }

  /*
   * 타임아웃이 15초였다. 기계가 바쁘면(로드 90 넘는 상황을 실제로 봤다) 멀쩡한
   * Runtime.evaluate 도 그 안에 답을 못 준다. 그러면 도구는 '검사 실패'라고 적는데,
   * 앱에는 아무 문제가 없다. 도구가 거짓말을 하는 또 하나의 방식이다.
   * 진짜로 멈춘 경우는 어차피 60초를 넘기므로 넉넉히 준다.
   */
  send(method, params = {}, { timeout = 60000 } = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout: ${method} (${timeout / 1000}초). 기계가 바쁜지 확인하세요`));
        }
      }, timeout);
    });
  }

  /*
   * 고정 대기 뒤에 바로 localStorage 를 만지면, 기계가 바쁠 때 아직 about:blank 에
   * 머물러 있어 SecurityError 가 난다. 실제로 라이트 테마 8개 화면이 그렇게 죽었다.
   * 몇 밀리초를 기다릴지 찍는 대신 도착을 확인한다.
   */
  async goto(url, { wait = 900 } = {}) {
    await this.send('Page.navigate', { url });
    if (/^https?:/.test(url)) {
      const base = url.split('#')[0].split('?')[0];
      for (let i = 0; i < 80; i++) {
        const here = await this.eval(() => location.href).catch(() => '');
        if (here.startsWith(base)) break;
        await sleep(100);
      }
    }
    await sleep(wait);
  }

  async eval(fn, ...args) {
    const expr = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  }

  /** 셀렉터의 화면 중심 좌표. 없거나 화면 밖이면 null. */
  box(selector, nth = 0) {
    return this.eval((sel, n) => {
      const el = document.querySelectorAll(sel)[n];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return {
        x: r.left + r.width / 2, y: r.top + r.height / 2,
        w: r.width, h: r.height, top: r.top, bottom: r.bottom,
        text: (el.textContent || '').trim().slice(0, 60),
        visible: r.bottom > 0 && r.top < innerHeight,
      };
    }, selector, nth);
  }

  /** 실제 터치 입력을 보낸다. holdMs를 주면 길게 누르기. */
  async tap(selector, { nth = 0, holdMs = 0, scroll = true } = {}) {
    if (scroll) {
      await this.eval((sel, n) => {
        const el = document.querySelectorAll(sel)[n];
        el?.scrollIntoView({ block: 'center', behavior: 'instant' });
      }, selector, nth);
      await sleep(120);
    }
    const b = await this.box(selector, nth);
    if (!b) throw new Error(`요소 없음: ${selector}[${nth}]`);
    const pt = [{ x: b.x, y: b.y, radiusX: 6, radiusY: 6, force: 1 }];
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    if (holdMs) await sleep(holdMs);
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(holdMs ? 220 : 160);
    return b;
  }

  async setValue(selector, value, { nth = 0 } = {}) {
    await this.eval((sel, n, v) => {
      const el = document.querySelectorAll(sel)[n];
      if (!el) throw new Error('no el ' + sel);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, nth, value);
    await sleep(180);
  }

  /** 진짜 클릭. 합성 이벤트가 아니라 실제 마우스 입력을 보낸다. */
  async clickReal(selector, { nth = 0 } = {}) {
    await this.eval((sel, n) => {
      document.querySelectorAll(sel)[n]?.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, selector, nth);
    await sleep(120);
    const b = await this.box(selector, nth);
    if (!b) throw new Error(`요소 없음: ${selector}[${nth}]`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type, x: b.x, y: b.y, button: 'left', clickCount: 1,
      });
    }
    await sleep(180);
    return b;
  }

  /** 진짜 타이핑. 포커스를 옮기고 문자를 실제로 넣는다. */
  async typeReal(selector, value, { nth = 0, clear = true } = {}) {
    await this.clickReal(selector, { nth });
    if (clear) {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    }
    await this.send('Input.insertText', { text: value });
    await sleep(200);
  }

  async pressKey(key, code, vk) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
    await sleep(200);
  }

  async text(selector, nth = 0) {
    return this.eval((sel, n) => {
      const el = document.querySelectorAll(sel)[n];
      return el ? (el.textContent || '').trim() : null;
    }, selector, nth);
  }

  async count(selector) {
    return this.eval((sel) => document.querySelectorAll(sel).length, selector);
  }

  async shot(path, { full = false } = {}) {
    const params = { format: 'png' };
    if (full) {
      const m = await this.send('Page.getLayoutMetrics');
      params.clip = {
        x: 0, y: 0,
        width: m.cssContentSize.width,
        height: Math.min(m.cssContentSize.height, 6000),
        scale: 1, captureBeyondViewport: true,
      };
      params.captureBeyondViewport = true;
    }
    const { data } = await this.send('Page.captureScreenshot', params);
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  takeErrors() {
    const e = { console: [...this.consoleErrors], page: [...this.pageErrors] };
    this.consoleErrors.length = 0;
    this.pageErrors.length = 0;
    return e;
  }

  async close() {
    try { this.ws?.close(); } catch {}
    kill(this.handle);
  }
}

export { sleep };
