/**
 * 의존성 없는 Chrome DevTools Protocol 드라이버.
 * Node 내장 WebSocket만 쓴다. 실제 마우스/키보드 입력을 보내므로
 * dump-dom과 달리 "진짜로 눌러본" 결과를 얻는다.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let launchSeq = 0;

export async function launch({ port = 9333, width = 414, height = 896, dark = true } = {}) {
  // 포트와 프로필을 매번 새로 잡는다. 공유하면 두 번째 실행이 기존 브라우저에
  // 탭만 열고 끝나서, 내가 보는 페이지와 실제 페이지가 어긋난다.
  port = port + (launchSeq % 200);
  const profile = `/tmp/cdp-climbing-${process.pid}-${launchSeq++}`;
  const args = [
    `--remote-debugging-port=${port}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', `--user-data-dir=${profile}`, '--disable-application-cache',
    `--window-size=${width},${height}`,
    dark ? '--force-dark-mode' : '--force-light-mode',
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch {}
  }
  if (!target) throw new Error('Chrome에 붙지 못했습니다');
  return new Page(proc, target.webSocketDebuggerUrl, { width, height }, dark);
}

class Page {
  constructor(proc, wsUrl, viewport, dark = true) {
    this.proc = proc;
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

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout: ${method}`)); }
      }, 15000);
    });
  }

  async goto(url, { wait = 900 } = {}) {
    await this.send('Page.navigate', { url });
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
    this.proc.kill();
  }
}

export { sleep };
