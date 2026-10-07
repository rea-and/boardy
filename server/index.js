import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const dataDir = process.env.BOARDY_DATA_DIR || path.join(root, 'data');
const dataFile = path.join(dataDir, 'boardy.json');
const port = Number(process.env.PORT || 4173);
const authAttempts = new Map();
const validThemes = new Set(['dark', 'light', 'violet', 'ember', 'forest', 'contrast', 'paper', 'mint']);

fs.mkdirSync(dataDir, { recursive: true });

const now = () => new Date().toISOString();
const id = (prefix = 'id') => `${prefix}_${crypto.randomBytes(7).toString('hex')}`;
const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email, avatar: user.avatar });
const normalizeRole = role => role === 'editor' ? 'editor' : 'viewer';
const clone = value => JSON.parse(JSON.stringify(value));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function membershipsFor(user) {
  return Array.isArray(user.data?.memberships) ? user.data.memberships : [];
}

function findOwnedBoard(user, boardId) {
  return (user.data?.boards || []).find(board => board.id === boardId && !board.archived);
}

function findInvitation(store, token) {
  const hash = sha256(token || '');
  return (store.invitations || []).find(invitation => invitation.tokenHash === hash && invitation.status === 'pending' && (!invitation.expiresAt || invitation.expiresAt > Date.now())) || null;
}

function invitationView(store, invitation) {
  const owner = store.users.find(user => user.id === invitation.ownerId);
  const board = owner && findOwnedBoard(owner, invitation.boardId);
  if (!owner || !board) return null;
  return { id: invitation.id, email: invitation.email, role: normalizeRole(invitation.role), boardId: invitation.boardId, boardTitle: board.title, ownerName: owner.name, invitedAt: invitation.invitedAt, expiresAt: invitation.expiresAt, status: invitation.status };
}

function memberProfile(user, role) {
  return { id: user.id, name: user.name, initials: user.avatar || String(user.name || '').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(), color: '#17b897', role: role === 'owner' ? 'owner' : normalizeRole(role) };
}

function boardForClient(board, owner, role) {
  const copy = clone(board);
  copy.accessRole = role;
  copy.ownerId = owner.id;
  if (role !== 'owner') delete copy.publicShare;
  return copy;
}

function workspaceData(store, user) {
  const owned = (user.data?.boards || []).map(board => {
    const copy = boardForClient(board, user, 'owner');
    ensureBoardMember(copy, user, 'owner');
    return copy;
  });
  const shared = membershipsFor(user).flatMap(membership => {
    const owner = store.users.find(candidate => candidate.id === membership.ownerId);
    const board = owner && findOwnedBoard(owner, membership.boardId);
    if (!board) return [];
    const copy = boardForClient(board, owner, normalizeRole(membership.role));
    ensureBoardMember(copy, owner, 'owner');
    return [copy];
  });
  const { memberships, ...settings } = user.data || {};
  return { ...settings, boards: owned.concat(shared) };
}

function stripClientBoard(board) {
  const copy = clone(board);
  delete copy.accessRole;
  delete copy.ownerId;
  return copy;
}

function ensureBoardMember(board, user, role) {
  const members = Array.isArray(board.members) ? board.members.filter(member => member && member.id !== user.id && !(role === 'owner' && member.id === 'member_you')) : [];
  board.members = members.concat(memberProfile(user, role));
}

function publicOrigin(req, requestedBase = '') {
  const configured = process.env.BOARDY_PUBLIC_URL || requestedBase;
  if (configured) {
    try { const parsed = new URL(configured); if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return configured.replace(/\/+$/, ''); } catch {}
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return `${protocol}://${req.headers.host || 'localhost:' + port}`;
}

function sendInvitationEmail(to, ownerName, boardTitle, invitationUrl) {
  const sendmailPath = process.env.BOARDY_SENDMAIL_PATH || '/usr/sbin/sendmail';
  const clean = value => String(value || '').replace(/[\r\n]+/g, ' ').trim();
  const maskEmail = value => {
    const email = clean(value);
    const at = email.indexOf('@');
    if (at < 1) return '[redacted email]';
    return `${email[0]}***${email.slice(at)}`;
  };
  try { fs.accessSync(sendmailPath, fs.constants.X_OK); } catch {
    console.warn(`Boardy invitation email not sent: ${sendmailPath} is missing or not executable. Configure a local sendmail service or BOARDY_SENDMAIL_PATH.`);
    return Promise.resolve(false);
  }
  const from = clean(process.env.BOARDY_MAIL_FROM || `Boardy <boardy@${reqHostName()}>`);
  const fromAddress = (from.match(/<([^<>@\s]+@[^<>@\s]+)>/) || from.match(/\b[^<>@\s]+@[^<>@\s]+\b/) || [])[1] || '';
  const sendmailArgs = ['-t', '-i'];
  if (fromAddress) sendmailArgs.push('-f', fromAddress);
  const subject = `${clean(ownerName)} invited you to join ${clean(boardTitle)} on Boardy`;
  const message = [
    `From: ${from}`,
    `To: ${clean(to)}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    `${clean(ownerName)} invited you to join the Boardy board "${clean(boardTitle)}".`,
    '',
    'Open this invitation to create an account or sign in:',
    invitationUrl,
    '',
    'You can view the board after accepting the invitation.',
    ''
  ].join('\r\n');
  console.info(`Boardy invitation email: sending via ${sendmailPath} to ${maskEmail(to)}`);
  return new Promise(resolve => {
    const child = spawn(sendmailPath, sendmailArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
    let errorOutput = '';
    let settled = false;
    const timer = setTimeout(() => {
      console.warn(`Boardy invitation email timed out after 15 seconds via ${sendmailPath} to ${maskEmail(to)}`);
      child.kill();
      finish(false);
    }, 15_000);
    const finish = delivered => { if (!settled) { settled = true; clearTimeout(timer); resolve(delivered); } };
    child.stderr?.on('data', chunk => { errorOutput = (errorOutput + chunk.toString()).slice(-2_000); });
    child.on('error', error => {
      console.warn(`Boardy invitation email failed to start for ${maskEmail(to)}: ${error.message}`);
      finish(false);
    });
    child.on('close', (code, signal) => {
      if (code !== 0) {
        const detail = errorOutput.trim().replace(/[\r\n]+/g, ' ');
        console.warn(`Boardy invitation email was rejected by ${sendmailPath} for ${maskEmail(to)} (exit ${code ?? 'unknown'}${signal ? `, signal ${signal}` : ''})${detail ? `: ${detail}` : ''}`);
      } else {
        console.info(`Boardy invitation email accepted by ${sendmailPath} for ${maskEmail(to)}; check the mail service log for final delivery.`);
      }
      finish(code === 0);
    });
    child.stdin.on('error', error => {
      console.warn(`Boardy invitation email input failed for ${maskEmail(to)}: ${error.message}`);
      finish(false);
    });
    child.stdin.end(message);
  });
}

function reqHostName() {
  return process.env.BOARDY_MAIL_HOST || 'localhost';
}

function publicShareTokenExists(store, token) {
  return store.users.some(user => (user.data?.boards || []).some(board => board.publicShare?.token === token));
}

function publicBoardView(board) {
  return {
    id: board.id,
    title: String(board.title || '').slice(0, 160),
    description: String(board.description || '').slice(0, 2_000),
    color: String(board.color || '#17b897').slice(0, 20),
    background: typeof board.background === 'string' && board.background.startsWith('data:image/') ? board.background.slice(0, 6_000_000) : '',
    lists: (Array.isArray(board.lists) ? board.lists : []).filter(list => list && typeof list === 'object').map(list => ({
      id: list.id,
      title: String(list.title || '').slice(0, 160),
      cards: (Array.isArray(list.cards) ? list.cards : []).filter(card => card && typeof card === 'object').map(card => ({
        id: card.id,
        title: String(card.title || '').slice(0, 300),
        description: String(card.description || '').slice(0, 20_000),
        labels: Array.isArray(card.labels) ? card.labels.filter(label => label && typeof label === 'object').map(label => ({ name: String(label.name || '').slice(0, 80), color: String(label.color || '').slice(0, 20) })).slice(0, 30) : [],
        due: typeof card.due === 'string' ? card.due : '',
        checklist: Array.isArray(card.checklist) ? card.checklist.filter(item => item && typeof item === 'object').map(item => ({ text: String(item.text || '').slice(0, 300), done: Boolean(item.done) })).slice(0, 100) : [],
        attachments: Array.isArray(card.attachments) ? card.attachments.filter(attachment => attachment && typeof attachment === 'object').map(attachment => ({ name: String(attachment.name || 'Attachment').slice(0, 160), type: String(attachment.type || '').slice(0, 100), data: typeof attachment.data === 'string' && (attachment.data.startsWith('data:image/') || attachment.data.startsWith('data:application/pdf')) ? attachment.data.slice(0, 2_500_000) : '' })).slice(0, 30) : [],
        comments: Array.isArray(card.comments) ? card.comments.filter(comment => comment && typeof comment === 'object').map(comment => ({ author: String(comment.author || 'A Boardy user').slice(0, 100), text: String(comment.text || '').slice(0, 2_000), time: typeof comment.time === 'string' ? comment.time : '' })).slice(0, 100) : []
      }))
    }))
  };
}

function findPublicBoard(store, token) {
  if (!token || token.length < 20 || token.length > 100) return null;
  for (const user of store.users) {
    const board = (user.data?.boards || []).find(item => !item.archived && item.publicShare?.enabled && item.publicShare?.token === token);
    if (board) return board;
  }
  return null;
}

function readStore() {
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch { return { users: [], sessions: {} }; }
}
function writeStore(store) {
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, dataFile);
}
function seedBoard(name = 'My workspace') {
  const due = new Date(Date.now() + 1000 * 60 * 60 * 24 * 4).toISOString();
  return {
    id: id('board'), title: name, description: 'A calm place to turn ideas into momentum.',
    color: '#17b897', background: 'aurora', starred: true,
    members: [{ id: 'member_you', name: 'You', initials: 'YO', color: '#ef8354' }],
    lists: [
      { id: id('list'), title: 'Inbox', cards: [
        { id: id('card'), title: 'Shape the next release', description: 'Capture the smallest useful version, then make it delightful.', labels: [{ name: 'Product', color: 'teal' }], due, checklist: [{ text: 'Define the happy path', done: true }, { text: 'Share a first pass', done: false }], attachments: [], members: ['member_you'], comments: [{ author: 'You', text: 'Let’s keep the scope sharp.', time: now() }] },
        { id: id('card'), title: 'Collect team feedback', description: '', labels: [{ name: 'Research', color: 'violet' }], checklist: [], attachments: [], members: [], comments: [] }
      ] },
      { id: id('list'), title: 'In progress', cards: [
        { id: id('card'), title: 'Design the board view', description: 'Give the workspace enough breathing room for focused work.', labels: [{ name: 'Design', color: 'blue' }], checklist: [{ text: 'Grid and spacing', done: true }, { text: 'Responsive behavior', done: true }, { text: 'Empty states', done: false }], attachments: [{ name: 'boardy-direction.png', type: 'image/png', data: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22100%22%3E%3Crect width=%22160%22 height=%22100%22 rx=%2212%22 fill=%22%23131b2b%22/%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2224%22 fill=%22%2317b897%22/%3E%3Cpath d=%22M90 32h42v8H90zm0 16h32v8H90zm0 16h22v8H90z%22 fill=%22white%22 opacity=%22.8%22/%3E%3C/svg%3E' }], members: ['member_you'], comments: [] }
      ] },
      { id: id('list'), title: 'Ready for review', cards: [
        { id: id('card'), title: 'Write the launch notes', description: '', labels: [{ name: 'Launch', color: 'amber' }], checklist: [], attachments: [], members: [], comments: [] }
      ] },
      { id: id('list'), title: 'Done', cards: [
        { id: id('card'), title: 'Choose a name', description: 'Boardy felt right from the start.', labels: [{ name: 'Shipped', color: 'green' }], checklist: [], attachments: [], members: [], comments: [] }
      ] }
    ]
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function passwordMatches(password, user) {
  const actual = crypto.scryptSync(password, user.passwordSalt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const [key, ...rest] = part.trim().split('='); return [key, decodeURIComponent(rest.join('='))];
  }));
}
function currentUser(req, store) {
  const token = parseCookies(req).boardy_session;
  const session = token && store.sessions[token];
  if (!session || session.expires < Date.now()) return null;
  return store.users.find(user => user.id === session.userId) || null;
}
function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
  res.end(payload);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 8_000_000) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function sessionCookie(token, maxAge = 60 * 60 * 24 * 14) {
  return `boardy_session=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
function authBlocked(address) {
  const entry = authAttempts.get(address);
  if (!entry) return false;
  if (Date.now() - entry.started > 15 * 60 * 1000) { authAttempts.delete(address); return false; }
  return entry.count >= 10;
}
function recordAuthFailure(address) {
  const entry = authAttempts.get(address) || { started: Date.now(), count: 0 };
  if (Date.now() - entry.started > 15 * 60 * 1000) { entry.started = Date.now(); entry.count = 0; }
  entry.count += 1;
  authAttempts.set(address, entry);
}
function clearAuthFailures(address) {
  authAttempts.delete(address);
}
function respondApp(res) {
  const file = path.join(publicDir, 'index.html');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader('referrer-policy', 'same-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  const store = readStore();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'boardy', time: now() });
    if (url.pathname.startsWith('/api/public-board/') && req.method === 'GET') {
      const token = decodeURIComponent(url.pathname.slice('/api/public-board/'.length));
      const board = findPublicBoard(store, token);
      return board ? sendJson(res, 200, { board: publicBoardView(board) }) : sendJson(res, 404, { error: 'This public board link is no longer available.' });
    }
    if (url.pathname.startsWith('/api/invitations/') && req.method === 'GET') {
      const token = decodeURIComponent(url.pathname.slice('/api/invitations/'.length));
      const invitation = findInvitation(store, token);
      const view = invitation && invitationView(store, invitation);
      return view ? sendJson(res, 200, { invitation: view }) : sendJson(res, 404, { error: 'This invitation is no longer available.' });
    }
    if (url.pathname === '/api/session' && req.method === 'GET') {
      const user = currentUser(req, store);
      return sendJson(res, 200, user ? { user: safeUser(user), data: workspaceData(store, user) } : { user: null });
    }
    if (url.pathname === '/api/register' && req.method === 'POST') {
      if (authBlocked(req.socket.remoteAddress || 'unknown')) return sendJson(res, 429, { error: 'Too many authentication attempts. Try again in a few minutes.' });
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 80);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
      const password = String(body.password || '');
      if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) { recordAuthFailure(req.socket.remoteAddress || 'unknown'); return sendJson(res, 400, { error: 'Use a name, a valid email, and a password of at least 8 characters.' }); }
      if (store.users.some(user => user.email === email)) { recordAuthFailure(req.socket.remoteAddress || 'unknown'); return sendJson(res, 409, { error: 'That email is already registered.' }); }
      const credentials = hashPassword(password);
      const user = { id: id('user'), name, email, avatar: name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(), passwordSalt: credentials.salt, passwordHash: credentials.hash, data: { boards: [seedBoard(`${name.split(' ')[0]}'s workspace`)], theme: 'dark', wallpaper: 'aurora', sidebarCollapsed: false }, createdAt: now() };
      store.users.push(user);
      const token = crypto.randomBytes(32).toString('hex');
      store.sessions[token] = { userId: user.id, expires: Date.now() + 1000 * 60 * 60 * 24 * 14 };
      writeStore(store);
      clearAuthFailures(req.socket.remoteAddress || 'unknown');
      return sendJson(res, 201, { user: safeUser(user), data: workspaceData(store, user) }, { 'set-cookie': sessionCookie(token) });
    }
    if (url.pathname === '/api/login' && req.method === 'POST') {
      if (authBlocked(req.socket.remoteAddress || 'unknown')) return sendJson(res, 429, { error: 'Too many authentication attempts. Try again in a few minutes.' });
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const user = store.users.find(item => item.email === email);
      if (!user || !passwordMatches(String(body.password || ''), user)) { recordAuthFailure(req.socket.remoteAddress || 'unknown'); return sendJson(res, 401, { error: 'Email or password is incorrect.' }); }
      const token = crypto.randomBytes(32).toString('hex');
      store.sessions[token] = { userId: user.id, expires: Date.now() + 1000 * 60 * 60 * 24 * 14 };
      writeStore(store);
      clearAuthFailures(req.socket.remoteAddress || 'unknown');
      return sendJson(res, 200, { user: safeUser(user), data: workspaceData(store, user) }, { 'set-cookie': sessionCookie(token) });
    }
    if (url.pathname === '/api/demo' && req.method === 'POST') {
      let user = store.users.find(item => item.email === 'demo@boardy.local');
      if (!user) { const credentials = hashPassword('boardy-demo'); user = { id: id('user'), name: 'Alex Morgan', email: 'demo@boardy.local', avatar: 'AM', passwordSalt: credentials.salt, passwordHash: credentials.hash, data: { boards: [seedBoard('Alex’s workspace')], theme: 'dark', wallpaper: 'aurora', sidebarCollapsed: false }, createdAt: now() }; store.users.push(user); }
      const token = crypto.randomBytes(32).toString('hex'); store.sessions[token] = { userId: user.id, expires: Date.now() + 1000 * 60 * 60 * 24 * 14 }; writeStore(store);
      return sendJson(res, 200, { user: safeUser(user), data: workspaceData(store, user) }, { 'set-cookie': sessionCookie(token) });
    }
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      const token = parseCookies(req).boardy_session; if (token) delete store.sessions[token]; writeStore(store);
      return sendJson(res, 200, { ok: true }, { 'set-cookie': sessionCookie('', 0) });
    }
    if (url.pathname === '/api/data' && req.method === 'PUT') {
      const user = currentUser(req, store); if (!user) return sendJson(res, 401, { error: 'Please sign in again.' });
      const body = await readBody(req); if (!body || !Array.isArray(body.boards)) return sendJson(res, 400, { error: 'Invalid workspace data.' });
      const existingOwned = user.data?.boards || [];
      const ownedIds = new Set(existingOwned.map(board => board.id));
      const memberships = membershipsFor(user);
      const membershipByBoard = new Map(memberships.map(membership => [membership.boardId, membership]));
      const knownBoardIds = new Set(store.users.flatMap(candidate => (candidate.data?.boards || []).map(board => board.id)));
      const nextOwned = [];
      for (const incoming of body.boards) {
        if (!incoming || typeof incoming !== 'object' || !incoming.id) continue;
        const membership = membershipByBoard.get(incoming.id);
        if (membership) {
          if (normalizeRole(membership.role) !== 'editor') continue;
          const owner = store.users.find(candidate => candidate.id === membership.ownerId);
          const ownerBoard = owner && (owner.data?.boards || []).find(board => board.id === membership.boardId);
          if (!ownerBoard) continue;
          const updated = stripClientBoard(incoming);
          if (ownerBoard.publicShare && !updated.publicShare) updated.publicShare = ownerBoard.publicShare;
          owner.data.boards = (owner.data.boards || []).map(board => board.id === ownerBoard.id ? updated : board);
          continue;
        }
        if (!ownedIds.has(incoming.id) && knownBoardIds.has(incoming.id)) continue;
        nextOwned.push(stripClientBoard(incoming));
      }
      user.data = { ...user.data, boards: nextOwned, memberships, theme: validThemes.has(body.theme) ? body.theme : 'dark', wallpaper: String(body.wallpaper || 'aurora').slice(0, 2_000_000), sidebarCollapsed: Boolean(body.sidebarCollapsed) };
      writeStore(store);
      return sendJson(res, 200, { ok: true });
    }
    if (url.pathname === '/api/board-invitations' && req.method === 'GET') {
      const user = currentUser(req, store); if (!user) return sendJson(res, 401, { error: 'Please sign in again.' });
      const board = findOwnedBoard(user, url.searchParams.get('boardId') || '');
      if (!board) return sendJson(res, 403, { error: 'Only the board owner can manage invitations.' });
      const invitations = (store.invitations || []).filter(invitation => invitation.ownerId === user.id && invitation.boardId === board.id).map(invitation => invitationView(store, invitation)).filter(Boolean);
      return sendJson(res, 200, { invitations });
    }
    if (url.pathname === '/api/board-invitations' && req.method === 'POST') {
      const user = currentUser(req, store); if (!user) return sendJson(res, 401, { error: 'Please sign in again.' });
      const body = await readBody(req);
      const board = findOwnedBoard(user, String(body.boardId || ''));
      if (!board) return sendJson(res, 403, { error: 'Only the board owner can invite people to this board.' });
      const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
      const role = normalizeRole(body.role);
      if (!/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: 'Enter a valid email address.' });
      if (email === user.email) return sendJson(res, 400, { error: 'You already own this board.' });
      const existingMember = store.users.find(candidate => candidate.email === email && membershipsFor(candidate).some(membership => membership.ownerId === user.id && membership.boardId === board.id));
      if (existingMember) return sendJson(res, 409, { error: 'That person is already a member of this board.' });
      store.invitations = (store.invitations || []).map(invitation => invitation.ownerId === user.id && invitation.boardId === board.id && invitation.email === email && invitation.status === 'pending' ? { ...invitation, status: 'revoked', revokedAt: Date.now() } : invitation);
      const token = crypto.randomBytes(32).toString('base64url');
      const invitation = { id: id('invite'), tokenHash: sha256(token), ownerId: user.id, boardId: board.id, email, role, status: 'pending', invitedAt: now(), expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 };
      store.invitations.push(invitation);
      writeStore(store);
      const invitationUrl = `${publicOrigin(req, body.appUrl)}/invite-${token}`;
      const emailDelivered = await sendInvitationEmail(email, user.name, board.title, invitationUrl);
      return sendJson(res, 201, { invitation: invitationView(store, invitation), invitationUrl, emailDelivered });
    }
    if (url.pathname.startsWith('/api/board-invitations/') && req.method === 'PATCH') {
      const user = currentUser(req, store); if (!user) return sendJson(res, 401, { error: 'Please sign in again.' });
      const invitationId = decodeURIComponent(url.pathname.slice('/api/board-invitations/'.length));
      const invitation = (store.invitations || []).find(item => item.id === invitationId && item.ownerId === user.id);
      if (!invitation) return sendJson(res, 404, { error: 'Invitation not found.' });
      const board = findOwnedBoard(user, invitation.boardId);
      if (!board) return sendJson(res, 403, { error: 'Only the board owner can manage invitations.' });
      const body = await readBody(req);
      const member = invitation.acceptedBy && store.users.find(candidate => candidate.id === invitation.acceptedBy);
      const memberId = member?.id || null;
      if (body.revoked) {
        invitation.status = 'revoked'; invitation.revokedAt = Date.now();
        if (member) {
          member.data.memberships = membershipsFor(member).filter(membership => !(membership.ownerId === user.id && membership.boardId === board.id));
          board.members = (board.members || []).filter(item => item.id !== member.id);
        }
      } else {
        invitation.role = normalizeRole(body.role);
        if (member) {
          const membership = membershipsFor(member).find(item => item.ownerId === user.id && item.boardId === board.id);
          if (membership) membership.role = invitation.role;
          ensureBoardMember(board, member, invitation.role);
        }
      }
      writeStore(store);
      return sendJson(res, 200, { invitation: invitationView(store, invitation), memberId });
    }
    if (url.pathname.startsWith('/api/invitations/') && req.method === 'POST') {
      const user = currentUser(req, store); if (!user) return sendJson(res, 401, { error: 'Please sign in or create an account first.' });
      const token = decodeURIComponent(url.pathname.slice('/api/invitations/'.length));
      const invitation = findInvitation(store, token);
      if (!invitation) return sendJson(res, 404, { error: 'This invitation is no longer available.' });
      if (user.email !== invitation.email) return sendJson(res, 403, { error: 'Sign in with the email address that received this invitation.' });
      const owner = store.users.find(candidate => candidate.id === invitation.ownerId);
      const board = owner && findOwnedBoard(owner, invitation.boardId);
      if (!owner || !board || owner.id === user.id) return sendJson(res, 404, { error: 'This invitation is no longer available.' });
      user.data.memberships = membershipsFor(user).filter(membership => !(membership.ownerId === owner.id && membership.boardId === board.id)).concat({ ownerId: owner.id, boardId: board.id, role: normalizeRole(invitation.role), acceptedAt: now() });
      ensureBoardMember(board, user, invitation.role);
      invitation.status = 'accepted'; invitation.acceptedBy = user.id; invitation.acceptedAt = now();
      writeStore(store);
      return sendJson(res, 200, { boardId: board.id, role: normalizeRole(invitation.role) });
    }
    if (url.pathname === '/api/board-public-share' && req.method === 'POST') {
      const user = currentUser(req, store); if (!user) return sendJson(res, 401, { error: 'Please sign in again.' });
      const body = await readBody(req);
      const board = (user.data?.boards || []).find(item => item.id === body.boardId && !item.archived);
      if (!board) return sendJson(res, 404, { error: 'Board not found.' });
      if (Boolean(body.enabled)) {
        if (!board.publicShare?.token) {
          let token;
          do { token = crypto.randomBytes(32).toString('base64url'); } while (publicShareTokenExists(store, token));
          board.publicShare = { token, enabled: true, createdAt: now() };
        } else board.publicShare = { ...board.publicShare, enabled: true };
      } else if (board.publicShare) board.publicShare = { ...board.publicShare, enabled: false };
      writeStore(store);
      return sendJson(res, 200, { publicShare: board.publicShare || { enabled: false } });
    }
    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const safePath = path.normalize(path.join(publicDir, requested));
    if (!safePath.startsWith(publicDir)) return sendJson(res, 403, { error: 'Forbidden' });
    const ext = path.extname(safePath); const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
    if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) { res.writeHead(200, { 'content-type': `${types[ext] || 'application/octet-stream'}; charset=utf-8` }); return fs.createReadStream(safePath).pipe(res); }
    return respondApp(res);
  } catch (error) { console.error(error); return sendJson(res, 500, { error: 'Something went wrong. Please try again.' }); }
});

server.listen(port, () => console.log(`Boardy listening on http://localhost:${port}`));
