// Dependency-free API smoke test. Starts Boardy on a temporary data directory and port,
// exercises sessions, board revisions, conflicts, the extension card endpoint, explicit
// board deletion, body limits and the static path guard, then shuts the server down.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4300 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boardy-test-'));
const server = spawn(process.execPath, [path.join(root, 'server/index.js')], { env: { ...process.env, PORT: String(port), BOARDY_DATA_DIR: dataDir }, stdio: 'ignore' });
let cookie = '';
let failures = 0;

async function call(route, method = 'GET', body) {
  const res = await fetch(base + route, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}

try {
  for (let i = 0; i < 50; i += 1) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  check('health', (await call('/api/health')).status === 200);
  const reg = await call('/api/register', 'POST', { name: 'Test User', email: 'test@example.com', password: 'password123' });
  check('register', reg.status === 201);
  const boards = reg.json.data.boards;
  const board = boards[0];
  board.title = 'Edited by A';
  let put = await call('/api/data', 'PUT', { boards, theme: 'dark', wallpaper: 'aurora' });
  check('first save bumps rev to 1', put.json.revs[board.id] === 1 && put.json.conflicts.length === 0, JSON.stringify(put.json));
  board.rev = 1;
  put = await call('/api/data', 'PUT', { boards, theme: 'dark', wallpaper: 'aurora' });
  check('unchanged save keeps rev', put.json.revs[board.id] === 1 && put.json.conflicts.length === 0);
  const clip = await call('/api/cards', 'POST', { boardId: board.id, listId: board.lists[0].id, title: 'From extension', url: 'https://example.com' });
  check('extension card added', clip.status === 201);
  check('revisions reflect extension card', (await call('/api/revisions')).json.revs[board.id] === 2);
  board.description = 'stale edit';
  put = await call('/api/data', 'PUT', { boards, theme: 'dark', wallpaper: 'aurora' });
  check('stale save reports conflict', put.json.conflicts.includes(board.id));
  let session = await call('/api/session');
  const stored = session.json.data.boards.find(item => item.id === board.id);
  check('extension card survived stale save', stored.lists[0].cards.some(card => card.title === 'From extension'));
  put = await call('/api/data', 'PUT', { boards: [stored, { id: 'board_new1', title: 'New', lists: [] }], theme: 'dark', wallpaper: 'aurora' });
  check('new board saved at rev 1', put.json.revs.board_new1 === 1);
  put = await call('/api/data', 'PUT', { boards: [stored], theme: 'dark', wallpaper: 'aurora' });
  session = await call('/api/session');
  check('omitted board is kept and flagged', session.json.data.boards.some(item => item.id === 'board_new1') && put.json.conflicts.includes('board_new1'));
  put = await call('/api/data', 'PUT', { boards: [stored], deletedBoardIds: ['board_new1'], theme: 'dark', wallpaper: 'aurora' });
  session = await call('/api/session');
  check('explicit deletion removes the board', !session.json.data.boards.some(item => item.id === 'board_new1') && put.json.conflicts.length === 0);
  check('oversized body returns 413', (await call('/api/data', 'PUT', JSON.stringify({ boards: [], pad: 'x'.repeat(8_100_000) }))).status === 413);
  check('invalid JSON returns 400', (await call('/api/data', 'PUT', '{not json')).status === 400);
  check('malformed path returns 400', (await fetch(base + '/%E0%A4%A')).status === 400);
  check('app.js is served', (await fetch(base + '/app.js')).status === 200);
} catch (error) {
  failures += 1;
  console.log('FAIL unexpected error —', error.message);
} finally {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
