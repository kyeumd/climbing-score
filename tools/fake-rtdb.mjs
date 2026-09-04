/**
 * Firebase Realtime Database 를 흉내 내는 로컬 서버. 검증 전용이다.
 *
 * 실제 주소를 받기 전에 스트림·쓰기 흐름을 검증하려고 만들었다. 진짜 RTDB 의
 * REST 규약 중 이 앱이 쓰는 것만 구현한다.
 *
 *   GET    /rooms/<code>.json                        전체 읽기
 *   GET    /rooms/<code>.json  (text/event-stream)   변경 스트림 (SSE)
 *   PUT    /rooms/<code>/sessions/<id>.json          한 항목 쓰기
 *   PATCH  /rooms/<code>.json                        여러 경로 한 번에
 *   DELETE /rooms/<code>/sessions/<id>.json          한 항목 지우기
 *
 * 스트림 이벤트 모양도 진짜와 같게 맞춘다. 여기서 맞춰 두지 않으면 주소를
 * 받은 날 처음부터 다시 디버깅하게 된다.
 *
 *   event: put
 *   data: {"path":"/sessions/ses_1","data":{...}}
 *
 *   node tools/fake-rtdb.mjs 8100
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 8100);
let db = {};
const listeners = new Set();   // { res, path }

const seg = (p) => p.split('/').filter(Boolean);

function readAt(path) {
  let node = db;
  for (const k of seg(path)) {
    if (node == null || typeof node !== 'object') return null;
    node = node[k];
  }
  return node === undefined ? null : node;
}

function writeAt(path, value) {
  const keys = seg(path);
  if (!keys.length) { db = value ?? {}; return; }
  let node = db;
  for (const k of keys.slice(0, -1)) {
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {};
    node = node[k];
  }
  const last = keys[keys.length - 1];
  // RTDB 는 null 을 쓰면 그 자리를 지운다. 빈 객체를 남기지 않는 것도 같다.
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
}

/** 변경을 듣고 있는 사람들에게 각자의 기준으로 경로를 바꿔 보낸다 */
function broadcast(changed, value) {
  for (const l of listeners) {
    const a = seg(l.path).join('/');
    const b = seg(changed).join('/');
    if (b === a) send(l.res, 'put', { path: '/', data: value });
    else if (b.startsWith(a + '/')) send(l.res, 'put', { path: '/' + b.slice(a.length + 1), data: value });
    else if (a.startsWith(b + '/')) send(l.res, 'put', { path: '/', data: readAt(l.path) });
  }
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname).replace(/\.json$/, '');
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  if (req.method === 'GET' && (req.headers.accept ?? '').includes('text/event-stream')) {
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const l = { res, path };
    listeners.add(l);
    send(res, 'put', { path: '/', data: readAt(path) });
    const beat = setInterval(() => send(res, 'keep-alive', null), 30000);
    req.on('close', () => { clearInterval(beat); listeners.delete(l); });
    return;
  }

  const body = await new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => resolve(s));
  });

  if (req.method === 'GET') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readAt(path)));
    return;
  }
  if (req.method === 'PUT') {
    const value = body ? JSON.parse(body) : null;
    writeAt(path, value);
    broadcast(path, value);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
    return;
  }
  if (req.method === 'PATCH') {
    const patch = body ? JSON.parse(body) : {};
    for (const [k, v] of Object.entries(patch)) {
      const child = `${path}/${k}`;
      writeAt(child, v);
      broadcast(child, v);
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(patch));
    return;
  }
  if (req.method === 'DELETE') {
    writeAt(path, null);
    broadcast(path, null);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end('null');
    return;
  }
  res.writeHead(405, cors); res.end();
});

server.listen(PORT, () => console.log(`가짜 RTDB — http://localhost:${PORT}  (검증 전용)`));
