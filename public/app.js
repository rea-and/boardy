const $ = (selector, root = document) => root.querySelector(selector);
const appScriptPath = new URL('app.js', document.baseURI).pathname;
const appRoot = appScriptPath.replace(/\/app\.js$/, '');
const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const urlPattern = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/g;
const normalizeUrl = raw => {
  const trailing = (raw.match(/[.,!?;:)\]]+$/) || [''])[0];
  const url = trailing ? raw.slice(0, -trailing.length) : raw;
  return { href: url.startsWith('www.') ? 'https://' + url : url, trailing };
};
const extractUrls = (value = '') => Array.from(String(value).matchAll(urlPattern), match => normalizeUrl(match[0])).filter((link, index, links) => links.findIndex(item => item.href === link.href) === index).slice(0, 5);
const linkify = (value = '') => esc(value).replace(urlPattern, raw => {
  const { href, trailing } = normalizeUrl(raw);
  return '<a class="text-link" href="' + href + '" target="_blank" rel="noopener noreferrer">' + href + '</a>' + trailing;
});
const linkifyPreview = (value = '') => esc(value).replace(urlPattern, raw => {
  const { href, trailing } = normalizeUrl(raw);
  const display = href.length > 48 ? href.slice(0, 45) + '…' : href;
  return '<a class="text-link" href="' + href + '" target="_blank" rel="noopener noreferrer" title="' + href + '">' + display + '</a>' + trailing;
});
const isImageData = value => typeof value === 'string' && value.startsWith('data:image/');
const uid = prefix => prefix + '_' + Math.random().toString(36).slice(2, 9);
const initials = name => String(name || '').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'YO';
const formatDate = value => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value)) : '';
const isOverdue = value => value && new Date(value) < new Date();
const isDueSoon = value => {
  if (!value) return false;
  const delta = new Date(value).getTime() - Date.now();
  return delta >= -86400000 && delta <= 7 * 86400000;
};
const searchableCard = card => [card.title, card.description, ...(card.labels || []).map(label => label.name), ...(card.comments || []).map(comment => comment.text)].join(' ').toLowerCase();
const wallpaperMap = {
  aurora: '#14383a',
  night: '#1b2444',
  sand: '#58433a'
};
const themeOptions = [
  { id: 'dark', name: 'Midnight', preview: 'midnight' },
  { id: 'light', name: 'Daylight', preview: 'daylight' },
  { id: 'violet', name: 'Violet hour', preview: 'violet' },
  { id: 'ember', name: 'Ember', preview: 'ember' },
  { id: 'forest', name: 'Forest', preview: 'forest' },
  { id: 'contrast', name: 'High contrast', preview: 'contrast' },
  { id: 'paper', name: 'Paper', preview: 'paper' },
  { id: 'mint', name: 'Mint', preview: 'mint' }
];
const themeColors = { dark: '#0e1524', light: '#eef3f8', violet: '#18152f', ember: '#211512', forest: '#10221e', contrast: '#06080c', paper: '#f5f1e8', mint: '#edf7f3' };
const lightThemeBackgrounds = { light: '#eef3f8', paper: '#f5f1e8', mint: '#edf7f3' };
const boardColorOptions = [
  { color: '#17b897', name: 'Teal' },
  { color: '#8f7aea', name: 'Violet' },
  { color: '#5494f5', name: 'Blue' },
  { color: '#f0ba41', name: 'Amber' },
  { color: '#4ac67a', name: 'Green' },
  { color: '#ef8354', name: 'Coral' },
  { color: '#d05a9d', name: 'Pink' },
  { color: '#64748b', name: 'Slate' }
];
const backupFormat = 'boardy-backup';
const backupVersion = 1;
const maxBackupBytes = 7_000_000;
let state = { user: null, boards: [], theme: 'dark', wallpaper: 'aurora', sidebarCollapsed: false, boardId: null, view: 'home', query: '', onlyDue: false, onlyStarred: false };
let modal = null;
let cardSaveStatus = 'Saved';
let saveTimer;
let dragState = null;
let columnDragState = null;
let dialogModel = null;
let dialogReturnFocus = null;
let pendingInvitation = null;
let pendingInvitationToken = '';

function slugifyBoardTitle(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'board';
}
function ensureBoardSlugs(boards) {
  const used = new Set();
  let changed = false;
  boards.forEach(board => {
    const base = slugifyBoardTitle(board.slug || board.title);
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) slug = base + '-' + suffix++;
    if (board.slug !== slug) { board.slug = slug; changed = true; }
    used.add(slug);
  });
  return changed;
}
function routeBoardSlug() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const rootSegment = appRoot.slice(1);
  const rootIndex = rootSegment ? segments.indexOf(rootSegment) : -1;
  const raw = segments[rootIndex + 1] || (appRoot ? '' : segments[0] || '');
  try { return decodeURIComponent(raw).toLowerCase(); } catch { return raw.toLowerCase(); }
}
function publicShareToken() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const rootSegment = appRoot.slice(1);
  const rootIndex = rootSegment ? segments.indexOf(rootSegment) : -1;
  const marker = segments[rootIndex + 1] || '';
  if (!marker.startsWith('public-')) return '';
  try { return decodeURIComponent(marker.slice('public-'.length)); } catch { return marker.slice('public-'.length); }
}
function invitationToken() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const rootSegment = appRoot.slice(1);
  const rootIndex = rootSegment ? segments.indexOf(rootSegment) : -1;
  const marker = segments[rootIndex + 1] || '';
  if (!marker.startsWith('invite-')) return '';
  try { return decodeURIComponent(marker.slice('invite-'.length)); } catch { return marker.slice('invite-'.length); }
}
function boardSlug(board) { return board.slug || slugifyBoardTitle(board.title); }
function boardUrl(board) { return (appRoot || '') + '/' + encodeURIComponent(boardSlug(board)); }
function publicBoardUrl(board) { return (appRoot || '') + '/public-' + encodeURIComponent(board.publicShare.token); }
function workspaceUrl() { return appRoot || '/'; }
function updateBoardUrl(board, replace = false) {
  const next = board ? boardUrl(board) : workspaceUrl();
  if (window.location.pathname !== next) window.history[replace ? 'replaceState' : 'pushState']({}, '', next);
}
function rememberBoard(board) {
  if (!board || !state.user) return;
  try { window.localStorage.setItem('boardy:last-board:' + state.user.id, board.id); } catch {}
}
function rememberedBoardId(userId) {
  try { return window.localStorage.getItem('boardy:last-board:' + userId); } catch { return null; }
}

async function api(path, options = {}) {
  const response = await fetch(appRoot + path, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Something went wrong');
  return body;
}
function notify(message) {
  const toast = $('.toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
}
function setCardSaveStatus(status) {
  cardSaveStatus = status;
  const statusElement = $('.card-save-status');
  if (statusElement) {
    statusElement.textContent = status;
    statusElement.dataset.state = status === 'Saved' ? 'saved' : status === 'Not saved' ? 'error' : 'saving';
  }
}
function firstActiveBoard() { return state.boards.find(board => !board.archived); }
function currentBoard() { return state.boards.find(board => board.id === state.boardId && !board.archived) || firstActiveBoard(); }
function boardRole(board = currentBoard()) { return board?.accessRole || 'owner'; }
function canEditBoard(board = currentBoard()) { return boardRole(board) !== 'viewer'; }
function canManageBoard(board = currentBoard()) { return boardRole(board) === 'owner'; }
function allCards(board = currentBoard()) { return (board && board.lists || []).flatMap(list => list.cards.map(card => ({ card, list }))); }
function moveCard(cardId, fromListId, toListId, targetCardId = null, placeAfter = false) {
  const board = currentBoard();
  if (!canEditBoard(board)) return false;
  const from = board.lists.find(list => list.id === fromListId);
  const to = board.lists.find(list => list.id === toListId);
  const index = from && from.cards.findIndex(card => card.id === cardId);
  if (!from || !to || index < 0) return false;
  const card = from.cards.splice(index, 1)[0];
  let targetIndex = targetCardId ? to.cards.findIndex(item => item.id === targetCardId) : -1;
  if (targetIndex < 0) to.cards.push(card);
  else to.cards.splice(targetIndex + (placeAfter ? 1 : 0), 0, card);
  persist();
  renderBoardOnly();
  return true;
}
function cardDropPosition(column, clientY) {
  const cards = [...column.querySelectorAll('.card[draggable="true"]')].filter(card => !dragState || card.dataset.id !== dragState.cardId);
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return { targetCardId: card.dataset.id, placeAfter: false };
  }
  return { targetCardId: cards.length ? cards[cards.length - 1].dataset.id : null, placeAfter: true };
}
function moveList(listId, targetListId, placeAfter = false) {
  const board = currentBoard();
  if (!canEditBoard(board)) return false;
  const sourceIndex = board.lists.findIndex(list => list.id === listId);
  if (sourceIndex < 0 || listId === targetListId) return false;
  const list = board.lists.splice(sourceIndex, 1)[0];
  const targetIndex = board.lists.findIndex(item => item.id === targetListId);
  if (targetIndex < 0) { board.lists.push(list); }
  else board.lists.splice(targetIndex + (placeAfter ? 1 : 0), 0, list);
  persist();
  renderBoardOnly();
  return true;
}
function setPreferences() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name=\"theme-color\"]')?.setAttribute('content', themeColors[state.theme] || themeColors.dark);
  const background = state.wallpaper && state.wallpaper.startsWith('data:') ? 'url(\"' + state.wallpaper + '\")' : (lightThemeBackgrounds[state.theme] || wallpaperMap[state.wallpaper] || wallpaperMap.aurora);
  document.documentElement.style.setProperty('--wallpaper', background);
}
function persist() {
  clearTimeout(saveTimer);
  if (modal?.type === 'card') setCardSaveStatus('Saving…');
  saveTimer = setTimeout(async () => {
    try {
      await api('/api/data', { method: 'PUT', body: JSON.stringify({ boards: state.boards, theme: state.theme, wallpaper: state.wallpaper, sidebarCollapsed: state.sidebarCollapsed }) });
      if (modal?.type === 'card') setCardSaveStatus('Saved');
      notify('Changes saved');
    } catch (error) {
      if (modal?.type === 'card') setCardSaveStatus('Not saved');
      notify(error.message);
    }
  }, 350);
}
function applySession(result) {
  const boards = result.data.boards || [];
  const slugsChanged = ensureBoardSlugs(boards);
  const routeBoard = boards.find(board => !board.archived && boardSlug(board) === routeBoardSlug());
  const remembered = rememberedBoardId(result.user.id);
  const selected = routeBoard || boards.find(board => !board.archived && board.id === remembered) || boards.find(board => !board.archived) || boards[0];
  state = { ...state, ...result.data, boards, user: result.user, boardId: selected?.id || null };
  if (selected && !selected.archived) rememberBoard(selected);
  if (selected && !selected.archived && !pendingInvitationToken && routeBoardSlug() !== boardSlug(selected)) updateBoardUrl(selected, true);
  setPreferences();
  renderApp();
  if (slugsChanged) persist();
}

async function finishAuthentication(result) {
  applySession(result);
  if (!pendingInvitationToken) return;
  try {
    const accepted = await api('/api/invitations/' + encodeURIComponent(pendingInvitationToken), { method: 'POST', body: '{}' });
    const refreshed = await api('/api/session');
    pendingInvitation = null;
    pendingInvitationToken = '';
    applySession(refreshed);
    const invitedBoard = state.boards.find(board => board.id === accepted.boardId);
    if (invitedBoard) { state.boardId = invitedBoard.id; state.view = 'board'; rememberBoard(invitedBoard); updateBoardUrl(invitedBoard, true); renderApp(); }
    notify('You joined ' + (invitedBoard ? invitedBoard.title : 'the board'));
  } catch (error) { notify(error.message); }
}
function renderAuth(mode = 'login', error = '', invitation = pendingInvitation) {
  const register = mode === 'register';
  const nameField = register ? '<div class=\"field\"><label for=\"name\">Your name</label><input id=\"name\" name=\"name\" autocomplete=\"name\" placeholder=\"Alex Morgan\" required /></div>' : '';
  const passwordAutocomplete = register ? 'new-password' : 'current-password';
  $('#app').innerHTML = '<div class=\"auth-shell\"><section class=\"auth-panel\"><div class=\"auth-card\"><div class=\"auth-brand\"><span class=\"brand-mark\"><span></span><span></span></span>Boardy</div><h2>' + (register ? 'Create your workspace' : 'Welcome back') + '</h2><p>' + (register ? 'Your next clear step starts here.' : 'Pick up where your team left off.') + '</p>' + (error ? '<div class=\"form-error\">' + esc(error) + '</div>' : '') + '<form id=\"auth-form\">' + nameField + '<div class=\"field\"><label for=\"email\">Email address</label><input id=\"email\" name=\"email\" type=\"email\" autocomplete=\"email\" placeholder=\"you@company.com\" required /></div><div class=\"field\"><label for=\"password\">Password</label><input id=\"password\" name=\"password\" type=\"password\" autocomplete=\"' + passwordAutocomplete + '\" placeholder=\"At least 8 characters\" required /></div><button class=\"primary-btn auth-submit\" type=\"submit\">' + (register ? 'Create account' : 'Sign in') + '</button></form><div class=\"auth-switch\">' + (register ? 'Already have an account?' : 'New to Boardy?') + ' <button id=\"auth-toggle\">' + (register ? 'Sign in' : 'Create an account') + '</button></div><button class=\"demo-btn\" id=\"demo-login\">Open the demo workspace</button></div></section><section class=\"auth-panel auth-panel--visual\"><div class=\"auth-grid\"><div class=\"auth-copy\"><h1>Make space for good work.</h1><p>A thoughtful kanban workspace for ideas, decisions, and everything that moves between them.</p></div><div class=\"mini-board\"><div class=\"mini-board-head\"><strong>Product launch</strong><div class=\"mini-dots\"><span></span><span></span><span></span></div></div><div class=\"mini-columns\"><div class=\"mini-column\"><strong>Inbox</strong><div class=\"mini-card\"><i></i>Research the sharpest angle</div><div class=\"mini-card\">Write a one-line brief</div></div><div class=\"mini-column\"><strong>In motion</strong><div class=\"mini-card\"><i></i>Prototype the new flow</div><div class=\"mini-card\">Share with the team</div></div><div class=\"mini-column\"><strong>Done</strong><div class=\"mini-card\">Name the thing</div></div></div></div></div></section></div>';
  if (!register) { $('.auth-card h2').textContent = 'Welcome to Boardy'; $('.auth-card>p').textContent = 'Sign in to your workspace or create an account to get started.'; }
  if (invitation) { $('.auth-card>p').textContent = invitation.ownerName + ' invited you to join “' + invitation.boardTitle + '”.'; $('.auth-card>p').insertAdjacentHTML('afterend', '<div class="invite-auth-note"><strong>Board invitation</strong><span>Use ' + esc(invitation.email) + ' to accept this invitation.</span></div>'); $('#email').value = invitation.email; $('#email').readOnly = true; $('#demo-login')?.remove(); }
  $('#auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await finishAuthentication(await api(register ? '/api/register' : '/api/login', { method: 'POST', body: JSON.stringify(values) })); }
    catch (err) { renderAuth(mode, err.message, invitation); }
  });
  $('#auth-toggle').addEventListener('click', () => renderAuth(register ? 'login' : 'register', '', invitation));
  $('#demo-login')?.addEventListener('click', async () => {
    try { await finishAuthentication(await api('/api/demo', { method: 'POST', body: '{}' })); }
    catch (err) { renderAuth(mode, err.message, invitation); }
  });
}

function applyBoardBackground(board = currentBoard()) {
  const shell = $('.main-shell');
  if (!shell) return;
  const image = isImageData(board && board.background) ? 'url("' + board.background + '")' : '';
  shell.style.backgroundImage = image;
  shell.classList.toggle('has-board-background', Boolean(image));
}

function safePublicColor(value) { return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : '#17b897'; }
function renderPublicCard(card) {
  const labels = (card.labels || []).map(label => '<span class="label ' + esc(label.color || '') + '">' + esc(label.name) + '</span>').join('');
  const checklist = card.checklist || [];
  const done = checklist.filter(item => item.done).length;
  const checklistMarkup = checklist.length ? '<div class="public-checklist"><div><strong>Checklist</strong><span>' + done + '/' + checklist.length + '</span></div>' + checklist.map(item => '<div class="public-check-item ' + (item.done ? 'done' : '') + '"><span>' + (item.done ? '✓' : '') + '</span>' + esc(item.text) + '</div>').join('') + '</div>' : '';
  const attachments = (card.attachments || []).filter(item => item.data || item.name).map(item => item.data && item.data.startsWith('data:image/') ? '<a class="public-attachment public-attachment-image" href="' + esc(item.data) + '" target="_blank" rel="noopener noreferrer"><img src="' + esc(item.data) + '" alt="' + esc(item.name) + '" /><span>' + esc(item.name) + '</span></a>' : '<div class="public-attachment"><span>⌕</span><span>' + esc(item.name) + '</span></div>').join('');
  const comments = (card.comments || []).map(comment => '<div class="public-comment"><div><strong>' + esc(comment.author) + '</strong><time>' + esc(formatDate(comment.time)) + '</time></div><p>' + linkify(comment.text) + '</p></div>').join('');
  return '<article class="public-card"><div class="public-card-head"><h3>' + esc(card.title) + '</h3>' + (card.due ? '<span class="public-card-due">◷ ' + esc(formatDate(card.due)) + '</span>' : '') + '</div>' + (labels ? '<div class="labels">' + labels + '</div>' : '') + (card.description ? '<div class="public-card-description">' + linkify(card.description) + '</div>' : '') + (checklistMarkup || '') + (attachments ? '<div class="public-card-section"><strong>Attachments</strong><div class="public-attachments">' + attachments + '</div></div>' : '') + (comments ? '<div class="public-card-section"><strong>Activity</strong>' + comments + '</div>' : '') + '</article>';
}
function renderPublicBoard(board) {
  const lists = (board.lists || []).map(list => '<section class="public-column"><header><h2>' + esc(list.title) + '</h2><span>' + (list.cards || []).length + '</span></header>' + ((list.cards || []).length ? list.cards.map(renderPublicCard).join('') : '<div class="public-empty">Nothing here yet</div>') + '</section>').join('');
  const description = board.description ? '<p class="public-board-description">' + linkify(board.description) + '</p>' : '';
  $('#app').innerHTML = '<div class="public-shell"><header class="public-topbar"><a class="public-brand" href="' + esc(workspaceUrl()) + '"><span class="brand-mark"><span></span><span></span></span><span>Boardy</span></a><span class="public-readonly">Read-only public board</span></header><main class="public-board"><section class="public-board-head"><div><div class="public-title-line"><span class="public-board-color" style="background:' + esc(safePublicColor(board.color)) + '"></span><h1>' + esc(board.title) + '</h1></div>' + description + '</div><span class="public-access-note">Anyone with this link can view this board</span></section><div class="public-columns">' + lists + '</div></main></div>';
  const shell = $('.public-shell');
  if (isImageData(board.background)) {
    shell.style.backgroundImage = 'url("' + board.background + '")';
    shell.classList.add('has-public-background');
  }
  document.title = board.title + ' · Boardy';
}

function syncBoardAccessUI(board) {
  const owner = canManageBoard(board);
  const editable = canEditBoard(board);
  document.querySelectorAll('#board-nav .board-nav[data-id]').forEach(item => {
    const itemBoard = state.boards.find(candidate => candidate.id === item.dataset.id);
    if (!itemBoard || itemBoard.accessRole === 'owner') return;
    const color = item.querySelector('.board-color-button');
    color?.removeAttribute('data-action');
    color?.removeAttribute('role');
    color?.removeAttribute('tabindex');
    if (!item.querySelector('.shared-board-mark')) item.insertAdjacentHTML('beforeend', '<span class="shared-board-mark" title="Shared with you" aria-label="Shared with you">↗</span>');
  });
  const memberNames = (board.members || []).map(member => member.name).filter(Boolean).slice(0, 5);
  const access = '<div class="board-access-summary"><div class="board-member-avatars">' + (board.members || []).slice(0, 5).map(member => '<span class="avatar" title="' + esc(member.name || 'Board member') + '">' + esc(member.initials || initials(member.name)) + '</span>').join('') + '</div><span>' + (memberNames.length ? memberNames.join(', ') : 'No other members yet') + '</span></div>';
  if (!owner || (board.members || []).length > 1) $('.board-subtitle')?.insertAdjacentHTML('afterend', access);
  if (owner) return;
  const colorButton = document.querySelector('.board-title-line [data-action="change-board-color"]');
  if (colorButton) { const colorSwatch = document.createElement('span'); colorSwatch.className = 'board-color board-color-header'; colorSwatch.style.background = safePublicColor(board.color); colorButton.replaceWith(colorSwatch); }
  document.querySelector('.top-actions [data-action="invite"]')?.remove();
  document.querySelector('.board-title-line [data-action="toggle-star"]')?.remove();
  document.querySelector('.board-title-line [data-action="rename-board"]')?.remove();
  document.querySelector('.board-subtitle')?.removeAttribute('data-action');
  document.querySelector('.board-actions [data-action="share"]')?.remove();
  if (!editable) document.querySelector('.board-actions [data-action="add-card-top"]')?.remove();
  const settings = $('.board-toolbar [data-action="board-settings"]');
  if (settings) settings.replaceWith(Object.assign(document.createElement('span'), { className: 'toolbar-btn board-access-note', textContent: boardRole(board) === 'viewer' ? '◉ Read-only access' : '✎ Shared · Can edit' }));
}

function renderApp() {
  setPreferences();
  const board = currentBoard();
  if (!board) return renderEmptyWorkspace();
  const homeActive = state.view === 'home' ? ' active' : '';
  const starredActive = state.view === 'starred' ? ' active' : '';
  const boards = state.boards.map(item => '<button class=\"board-nav' + (state.view === 'board' && item.id === board.id ? ' active' : '') + '\" data-action=\"select-board\" data-id=\"' + item.id + '\" title=\"' + esc(item.title) + '\"><i class=\"board-color board-color-button\" data-action=\"change-board-color\" data-id=\"' + item.id + '\" role=\"button\" tabindex=\"0\" aria-label=\"Change color for ' + esc(item.title) + '\" title=\"Change board color\" style=\"background:' + esc(item.color) + '\"></i><span class=\"nav-label\">' + esc(item.title) + '</span>' + (item.starred ? '<span class=\"board-star\">★</span>' : '') + '</button>').join('');
  $('#app').innerHTML = '<div class=\"app-shell ' + (state.sidebarCollapsed ? 'sidebar-collapsed' : '') + '\"><aside class=\"sidebar\" id=\"sidebar\"><div class=\"brand-row\"><div class=\"brand\"><span class=\"brand-mark\"><span></span><span></span></span><span class=\"brand-name\">Boardy</span></div><button class=\"icon-btn sidebar-collapse\" data-action=\"toggle-sidebar-collapse\" title=\"' + (state.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar') + '\" aria-label=\"' + (state.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar') + '\">' + (state.sidebarCollapsed ? '›' : '‹') + '</button></div><div class=\"workspace-label\">Workspace</div><div class=\"workspace\"><span class=\"workspace-avatar\">' + esc(initials(state.user.name)) + '</span><div><b>' + esc(state.user.name) + '\'s space</b><small>Personal workspace</small></div><span style=\"margin-left:auto;color:var(--muted-2)\">⌄</span></div><div class=\"side-section\"><div class=\"side-heading\">Views</div><button class=\"nav-item' + homeActive + '\" data-action=\"home\" title=\"All cards\"><span>◈</span> All cards</button><button class=\"nav-item' + starredActive + '\" data-action=\"starred\" title=\"Starred cards\"><span>☆</span> Starred cards</button></div><div class=\"side-section\"><div class=\"side-heading\">Your boards</div><div id=\"board-nav\">' + boards + '</div><button class=\"board-nav add-board\" data-action=\"add-board\" title=\"Create a board\"><span style=\"font-size:18px\">＋</span> Create a board</button></div><div class=\"sidebar-bottom\"><button class=\"nav-item\" data-action=\"settings\" title=\"Workspace settings\"><span>⚙</span> Workspace settings</button><div class=\"profile\"><span class=\"avatar\">' + esc(state.user.avatar || initials(state.user.name)) + '</span><div class=\"profile-info\"><b>' + esc(state.user.name) + '</b><span>' + esc(state.user.email) + '</span></div><button class=\"icon-btn\" data-action=\"logout\" aria-label=\"Log out\" title=\"Log out\">↪</button></div></div></aside><main class=\"main-shell\"><header class=\"topbar\"><button class=\"icon-btn mobile-menu\" data-action=\"toggle-sidebar\" aria-label=\"Open navigation\">☰</button><label class=\"search\"><span>⌕</span><input id=\"search\" value=\"' + esc(state.query) + '\" placeholder=\"Search cards in this board\" /><button id=\"search-clear\" class=\"search-clear ' + (state.query ? '' : 'hidden') + '\" data-action=\"clear-search\" aria-label=\"Clear search\">×</button><kbd>⌘ K</kbd></label><div class=\"top-actions\"><button class=\"icon-btn\" data-action=\"shortcuts\" title=\"Keyboard shortcuts (?)\" aria-label=\"Keyboard shortcuts\">?</button><button class=\"icon-btn\" data-action=\"invite\" title=\"Invite people\" aria-label=\"Invite people\">♧</button><button class=\"icon-btn notification\" data-action=\"notifications\" title=\"Notifications\" aria-label=\"Notifications\">♢</button><span class=\"avatar\">' + esc(state.user.avatar || initials(state.user.name)) + '</span></div></header><section class=\"board-head\"><div class=\"board-head-main\"><div class=\"board-title-line\"><button class=\"board-color board-color-button board-color-header\" data-action=\"change-board-color\" aria-label=\"Change board color\" title=\"Change board color\" style=\"background:' + esc(board.color) + '\"></button><h1 class=\"board-title\">' + esc(board.title) + '</h1><button class=\"icon-btn star-btn ' + (board.starred ? 'active' : '') + '\" data-action=\"toggle-star\" title=\"Star board\" aria-label=\"Star board\">★</button><button class=\"icon-btn\" data-action=\"rename-board\" title=\"Rename board\" aria-label=\"Rename board\">✎</button></div><button class=\"board-subtitle board-description-button\" data-action=\"edit-board-description\">' + esc(board.description || 'Add a board description') + '</button></div><div class=\"board-actions\"><button class=\"secondary-btn\" data-action=\"share\">♧ Share</button><button class=\"primary-btn\" data-action=\"add-card-top\">＋ Add card</button></div></section><section class=\"board-content\"><div class=\"board-toolbar\"><button class=\"toolbar-btn ' + (state.onlyDue ? 'active' : '') + '\" data-action=\"due-filter\">◷ Due soon</button><button class=\"toolbar-btn ' + (state.onlyStarred ? 'active' : '') + '\" data-action=\"starred-filter\">☆ Starred</button><button class=\"toolbar-btn\" data-action=\"settings\">⚙ Board Settings</button><span class=\"board-meta\">' + allCards(board).length + ' cards · Drag to reorder</span></div><div class=\"board-scroll\"><div class=\"columns\">' + renderColumns(board) + '<button class=\"add-list\" data-action=\"add-list\">＋ Add another list</button></div></div></section></main></div><div id=\"modal-root\"></div><div class=\"toast\"></div>';
  $('.board-meta').textContent = allCards(board).length + ' cards';
  const mobileMenu = $('[data-action="toggle-sidebar"]');
  mobileMenu?.setAttribute('aria-controls', 'sidebar');
  mobileMenu?.setAttribute('aria-expanded', 'false');
  $('.sidebar-collapse')?.setAttribute('aria-expanded', String(!state.sidebarCollapsed));
  const workspaceSettings = $('.sidebar [data-action="settings"]');
  if (workspaceSettings) { workspaceSettings.title = 'Workspace Settings'; workspaceSettings.lastChild.textContent = ' Workspace Settings'; }
  document.querySelectorAll('#board-nav .board-nav[data-id]').forEach(item => { if (state.boards.find(boardItem => boardItem.id === item.dataset.id)?.archived) item.remove(); });
  const archivedCount = state.boards.filter(item => item.archived).length;
  if (archivedCount) $('#board-nav')?.insertAdjacentHTML('afterend', '<button class="nav-item archived-nav" data-action="archived-boards" title="Archived boards"><span>▣</span> Archived boards <small class="archived-count">' + archivedCount + '</small></button>');
  applyBoardBackground(board);
  $('.board-toolbar [data-action="settings"]')?.setAttribute('data-action', 'board-settings');
  syncBoardAccessUI(board);
  $('#search').addEventListener('input', event => { state.query = event.target.value; $('#search-clear').classList.toggle('hidden', !state.query); renderBoardOnly(); });
  wireDragAndDrop();
  wireColumnDragAndDrop();
  markTruncatedDescriptions();
}
function renderEmptyWorkspace() { const hasArchived = state.boards.some(board => board.archived); $('#app').innerHTML = '<div class=\"empty\" style=\"min-height:100vh;display:grid;place-items:center\"><div><strong>' + (hasArchived ? 'Your active boards are clear.' : 'Your workspace is ready.') + '</strong><span>' + (hasArchived ? 'Restore an archived board or create a new one.' : 'Create your first board to get started.') + '</span><div class=\"empty-actions\"><button class=\"primary-btn\" data-action=\"add-board\">Create a board</button>' + (hasArchived ? '<button class=\"secondary-btn\" data-action=\"archived-boards\">View archived boards</button>' : '') + '</div></div></div><div id=\"modal-root\"></div><div class=\"toast\"></div>'; }
function renderColumns(board) {
  const search = state.query.toLowerCase().trim();
  const editable = canEditBoard(board);
  return (board.lists || []).map((list, listIndex) => {
    const cards = list.cards.filter(card => (!search || searchableCard(card).includes(search)) && (!state.onlyDue || isDueSoon(card.due)) && (!state.onlyStarred || card.starred));
    const title = editable ? '<button class="column-title" data-action="rename-list" data-id="' + list.id + '" title="Rename list" aria-label="Rename ' + esc(list.title) + '">' + esc(list.title) + '</button>' : '<span class="column-title-text">' + esc(list.title) + '</span>';
    const controls = editable ? '<div class="column-move-controls"><button data-action="move-list-left" data-id="' + list.id + '" aria-label="Move ' + esc(list.title) + ' left" title="Move list left" ' + (listIndex === 0 ? 'disabled' : '') + '>←</button><button data-action="move-list-right" data-id="' + list.id + '" aria-label="Move ' + esc(list.title) + ' right" title="Move list right" ' + (listIndex === board.lists.length - 1 ? 'disabled' : '') + '>→</button></div><button class="column-drag" draggable="true" data-list="' + list.id + '" title="Drag to reorder list. When focused, use Left or Right Arrow to move it." aria-label="Reorder ' + esc(list.title) + '" aria-keyshortcuts="ArrowLeft ArrowRight">⠿</button><button class="icon-btn column-menu" data-action="rename-list" data-id="' + list.id + '" title="Rename list" aria-label="Rename list">···</button>' : '';
    return '<section class="column" data-list="' + list.id + '"><div class="column-header"><h3>' + title + '</h3><span class="count">' + cards.length + '</span>' + controls + '</div>' + (cards.length ? cards.map(card => renderCard(card, list)).join('') : '<div class="empty"><strong>' + (search || state.onlyDue ? 'No matching cards' : 'Nothing here yet') + '</strong><span>' + (search || state.onlyDue ? 'Try another filter.' : 'Add a card to get moving.') + '</span></div>') + (editable ? '<button class="add-card" data-action="add-card" data-id="' + list.id + '">＋ Add a card</button>' : '') + '</section>';
  }).join('');
}
function renderCard(card, list) {
  const editable = canEditBoard();
  const cardIndex = list.cards.findIndex(item => item.id === card.id);
  const listIndex = currentBoard().lists.findIndex(item => item.id === list.id);
  const done = (card.checklist || []).filter(item => item.done).length;
  const total = (card.checklist || []).length;
  const people = card.members && card.members.length ? '<span class="avatar">' + esc(state.user.avatar || initials(state.user.name)) + '</span>' : '';
  const labels = card.labels && card.labels.length ? '<div class="labels">' + card.labels.map(label => '<span class="label ' + esc(label.color || '') + '">' + esc(label.name) + '</span>').join('') + '</div>' : '';
  const footer = (card.due ? '<span class="card-stat due ' + (isOverdue(card.due) ? 'overdue' : '') + '">◷ ' + formatDate(card.due) + '</span>' : '') + (total ? '<span class="card-stat progress"><span class="progress-bar"><i style="width:' + Math.round(done / total * 100) + '%"></i></span>' + done + '/' + total + '</span>' : '') + (card.attachments && card.attachments.length ? '<span class="card-stat">⌕ ' + card.attachments.length + '</span>' : '') + '<div class="avatars">' + people + '</div>';
  const cardStar = editable ? '<button class="card-star ' + (card.starred ? 'active' : '') + '" data-action="toggle-card-star" data-id="' + card.id + '" data-list="' + list.id + '" title="Star card" aria-label="' + (card.starred ? 'Unstar card' : 'Star card') + '">★</button>' : '';
  const cardMoves = editable ? '<div class="card-move-controls" aria-label="Move card"><button data-action="move-card-left" data-id="' + card.id + '" data-list="' + list.id + '" aria-label="Move card to previous list" title="Previous list" ' + (listIndex === 0 ? 'disabled' : '') + '>←</button><button data-action="move-card-up" data-id="' + card.id + '" data-list="' + list.id + '" aria-label="Move card up" title="Move up" ' + (cardIndex === 0 ? 'disabled' : '') + '>↑</button><button data-action="move-card-down" data-id="' + card.id + '" data-list="' + list.id + '" aria-label="Move card down" title="Move down" ' + (cardIndex === list.cards.length - 1 ? 'disabled' : '') + '>↓</button><button data-action="move-card-right" data-id="' + card.id + '" data-list="' + list.id + '" aria-label="Move card to next list" title="Next list" ' + (listIndex === currentBoard().lists.length - 1 ? 'disabled' : '') + '>→</button></div>' : '';
  return '<article class="card ' + (editable ? '' : 'card-read-only') + '" ' + (editable ? 'draggable="true" tabindex="0"' : 'tabindex="0"') + ' data-action="open-card" data-id="' + card.id + '" data-list="' + list.id + '">' + labels + '<div class="card-topline"><div class="card-title">' + esc(card.title) + '</div>' + cardStar + '</div>' + (card.description ? '<div class="card-description">' + linkifyPreview(card.description) + '</div>' : '') + '<div class="card-footer">' + footer + cardMoves + '</div></article>';
}
function markTruncatedDescriptions(root = document) { root.querySelectorAll('.card-description').forEach(description => description.classList.toggle('is-truncated', description.scrollHeight > description.clientHeight + 1)); }
function renderBoardOnly() { const board = currentBoard(); const columns = $('.columns'); if (columns) { columns.innerHTML = renderColumns(board) + (canEditBoard(board) ? '<button class="add-list" data-action="add-list">＋ Add another list</button>' : ''); $('.board-meta').textContent = allCards(board).length + ' cards'; wireDragAndDrop(); wireColumnDragAndDrop(); markTruncatedDescriptions(); } }

function openInputModal(config) { modal = { type: 'input', ...config }; renderModal(); }
function openLabelModal() {
  const cardModal = modal;
  modal = { type: 'label', previousModal: cardModal, card: selectedCard().card };
  renderModal();
}
function openCardCreateModal() { modal = { type: 'create-card' }; renderModal(); }
function openShareModal() { modal = { type: 'share' }; renderModal(); }
function openConfirmModal(config) { modal = { type: 'confirm', previousModal: modal, ...config }; renderModal(); }
function dismissModal() {
  const wasCard = modal?.type === 'card';
  modal = modal && modal.previousModal ? modal.previousModal : null;
  renderModal();
  if (wasCard && !modal) renderBoardOnly();
}
function renderInputModal() {
  const inputType = modal.inputType || 'text';
  $('#modal-root').innerHTML = '<div class=\"modal-layer\" data-action=\"close-modal\"><div class=\"modal modal--small\" data-stop><div class=\"modal-head\"><h2>' + esc(modal.heading) + '</h2><button class=\"icon-btn close\" data-action=\"close-modal\">×</button></div><form class=\"modal-form\" id=\"input-modal-form\"><div class=\"modal-body\"><div class=\"field\"><label for=\"input-modal-value\">' + esc(modal.label || 'Name') + '</label><input class=\"inline-input\" id=\"input-modal-value\" type=\"' + inputType + '\" value=\"' + esc(modal.value || '') + '\" placeholder=\"' + esc(modal.placeholder || '') + '\" autocomplete=\"off\" required /></div>' + (modal.hint ? '<p class=\"modal-hint\">' + esc(modal.hint) + '</p>' : '') + '</div><div class=\"modal-form-footer\"><button type=\"button\" class=\"ghost-btn close\" data-action=\"close-modal\">Cancel</button><button type=\"submit\" class=\"primary-btn\">' + esc(modal.submitLabel || 'Save') + '</button></div></form></div></div>';
  const form = $('#input-modal-form');
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = $('#input-modal-value').value.trim();
    if (!value) return;
    const submit = modal.onSubmit;
    modal = null;
    submit(value);
    renderModal();
  });
}
function renderLabelModal() {
  const board = currentBoard();
  const card = modal.card;
  const usedOnCard = new Set((card.labels || []).map(label => label.name.toLowerCase()));
  const labelsByName = new Map();
  board.lists.flatMap(list => list.cards).flatMap(item => item.labels || []).forEach(label => {
    const key = String(label.name || '').trim().toLowerCase();
    if (key && !labelsByName.has(key)) labelsByName.set(key, { name: String(label.name).trim(), color: label.color || 'teal' });
  });
  const existingLabels = [...labelsByName.values()];
  const colors = ['teal', 'violet', 'blue', 'amber', 'green'];
  const applyLabel = (name, color = '') => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    if ((card.labels || []).some(label => label.name.toLowerCase() === trimmed.toLowerCase())) return notify('That label is already on this card');
    card.labels = (card.labels || []).concat([{ name: trimmed, color: color || (existingLabels.find(label => label.name.toLowerCase() === trimmed.toLowerCase()) || {}).color || colors[card.labels.length % colors.length] }]);
    modal = modal.previousModal;
    persist(); renderModal(); renderBoardOnly(); notify('Label added');
  };
  const renderSuggestions = query => {
    const normalized = query.trim().toLowerCase();
    const matches = existingLabels.filter(label => !usedOnCard.has(label.name.toLowerCase()) && (!normalized || label.name.toLowerCase().includes(normalized))).slice(0, 6);
    $('#label-suggestions').innerHTML = matches.length ? '<div class="label-suggestions-title">Existing labels</div>' + matches.map(label => '<button type="button" class="label-suggestion" data-label-name="' + esc(label.name) + '" data-label-color="' + esc(label.color) + '"><span class="label-dot ' + esc(label.color) + '"></span><span>' + esc(label.name) + '</span><span class="label-suggestion-hint">Use</span></button>').join('') : '<div class="label-suggestions-empty">' + (normalized ? 'No matching labels. Press Add label to create it.' : 'No other labels on this board yet.') + '</div>';
    $('#label-suggestions').querySelectorAll('[data-label-name]').forEach(button => button.addEventListener('click', () => applyLabel(button.dataset.labelName, button.dataset.labelColor)));
  };
  $('#modal-root').innerHTML = '<div class="modal-layer" data-action="close-modal"><div class="modal modal--small" data-stop><div class="modal-head"><h2>Add a label</h2><button class="icon-btn close" data-action="close-modal" aria-label="Close">×</button></div><form class="modal-form" id="label-modal-form"><div class="modal-body"><div class="field"><label for="label-modal-value">Label name</label><input class="inline-input" id="label-modal-value" placeholder="e.g. Priority" autocomplete="off" required /></div><div id="label-suggestions"></div></div><div class="modal-form-footer"><button type="button" class="ghost-btn close" data-action="close-modal">Cancel</button><button type="submit" class="primary-btn">Add label</button></div></form></div></div>';
  $('#label-modal-value').addEventListener('input', event => renderSuggestions(event.target.value));
  $('#label-modal-form').addEventListener('submit', event => { event.preventDefault(); applyLabel($('#label-modal-value').value); });
  renderSuggestions('');
}
function openBoardColorModal(board = currentBoard()) {
  modal = { type: 'board-color', previousModal: modal, board };
  renderModal();
}
function renderBoardColorModal() {
  $('#modal-root').innerHTML = '<div class="modal-layer" data-action="close-modal"><div class="modal modal--small" data-stop><div class="modal-head"><h2>Board color</h2><button class="icon-btn close" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><p class="modal-hint">Choose the color used beside this board in the sidebar.</p><div class="board-color-grid">' + boardColorOptions.map(option => '<button class="board-color-choice ' + (modal.board.color === option.color ? 'selected' : '') + '" data-color="' + option.color + '" aria-label="' + option.name + '" aria-pressed="' + (modal.board.color === option.color) + '"><span style="background:' + option.color + '"></span><b>' + option.name + '</b>' + (modal.board.color === option.color ? '<i>✓</i>' : '') + '</button>').join('') + '</div></div></div></div>';
  $('#modal-root').querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => {
    modal.board.color = button.dataset.color;
    const previousModal = modal.previousModal;
    modal = previousModal;
    persist(); renderApp(); notify('Board color updated');
  }));
}
function renderCardCreateModal() {
  const board = currentBoard();
  const options = board.lists.map(list => '<option value=\"' + list.id + '\">' + esc(list.title) + '</option>').join('');
  $('#modal-root').innerHTML = '<div class=\"modal-layer\" data-action=\"close-modal\"><div class=\"modal modal--small\" data-stop><div class=\"modal-head\"><h2>Add a card</h2><button class=\"icon-btn close\" data-action=\"close-modal\" aria-label=\"Close\">×</button></div><form class=\"modal-form\" id=\"create-card-form\"><div class=\"modal-body\"><div class=\"field\"><label for=\"create-card-title\">Card title</label><input class=\"inline-input\" id=\"create-card-title\" placeholder=\"What needs to happen?\" autocomplete=\"off\" required /></div><div class=\"field\" style=\"margin-top:16px\"><label for=\"create-card-list\">Add to list</label><select class=\"inline-input\" id=\"create-card-list\">' + options + '</select></div></div><div class=\"modal-form-footer\"><button type=\"button\" class=\"ghost-btn close\" data-action=\"close-modal\">Cancel</button><button type=\"submit\" class=\"primary-btn\">Create card</button></div></form></div></div>';
  $('#create-card-form').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('#create-card-title').value.trim();
    const list = board.lists.find(item => item.id === $('#create-card-list').value);
    if (!title || !list) return;
    list.cards.push({ id: uid('card'), title, description: '', labels: [], due: '', checklist: [], attachments: [], members: [], comments: [] });
    modal = null;
    persist();
    renderModal();
    renderBoardOnly();
    notify('Card added to ' + list.title);
  });
  $('#create-card-title').focus();
}
function renderConfirmModal() {
  $('#modal-root').innerHTML = '<div class=\"modal-layer\" data-action=\"close-modal\"><div class=\"modal modal--small\" data-stop><div class=\"modal-head\"><h2>' + esc(modal.heading) + '</h2><button class=\"icon-btn close\" data-action=\"close-modal\" aria-label=\"Close\">×</button></div><div class=\"modal-body\"><p class=\"confirm-copy\">' + esc(modal.message) + '</p></div><div class=\"modal-form-footer\"><button type=\"button\" class=\"ghost-btn close\" data-action=\"close-modal\">Cancel</button><button type=\"button\" class=\"danger-btn\" id=\"confirm-action\">' + esc(modal.confirmLabel || 'Continue') + '</button></div></div></div>';
  $('#confirm-action').addEventListener('click', () => {
    const confirm = modal.onConfirm;
    modal = null;
    confirm();
  });
}
function renderShareModal() {
  const board = currentBoard();
  if (!canManageBoard(board)) {
    const role = boardRole(board) === 'viewer' ? 'Read-only' : 'Can edit';
    $('#modal-root').innerHTML = '<div class="modal-layer" data-action="close-modal"><div class="modal modal--small" data-stop><div class="modal-head"><h2>Shared board</h2><button class="icon-btn close" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><div class="share-status is-public"><span>' + esc(role) + '</span><p>You were invited to this board. Only the owner can manage access.</p></div><div class="shared-members-list"><div class="modal-label" style="margin-top:0">People on this board</div>' + (board.members || []).map(member => '<div class="shared-member-row"><span class="avatar">' + esc(member.initials || initials(member.name)) + '</span><span>' + esc(member.name) + '</span>' + (member.role ? '<small>' + esc(member.role === 'editor' ? 'Can edit' : member.role === 'owner' ? 'Owner' : 'Read-only') + '</small>' : '') + '</div>').join('') + '</div></div><div class="modal-form-footer"><button class="primary-btn close" data-action="close-modal">Done</button></div></div></div>';
    return;
  }
  const isPublic = Boolean(board.publicShare?.enabled && board.publicShare?.token);
  const publicLink = isPublic ? window.location.origin + publicBoardUrl(board) : '';
  const invitations = (modal.invitations || []).filter(invitation => invitation.status !== 'revoked');
  const members = (board.members || []).map(member => '<div class="shared-member-row"><span class="avatar">' + esc(member.initials || initials(member.name)) + '</span><span>' + esc(member.name) + '</span><small>' + esc(member.role === 'owner' ? 'Owner' : member.role === 'editor' ? 'Can edit' : 'Read-only') + '</small></div>').join('');
  const inviteRows = invitations.map(invitation => '<div class="invitation-row"><div><strong>' + esc(invitation.email) + '</strong><small>' + (invitation.status === 'accepted' ? 'Joined' : 'Invitation pending') + '</small></div><select class="invite-role-select" data-invitation-id="' + esc(invitation.id) + '" aria-label="Role for ' + esc(invitation.email) + '"><option value="viewer" ' + (invitation.role === 'viewer' ? 'selected' : '') + '>Read-only</option><option value="editor" ' + (invitation.role === 'editor' ? 'selected' : '') + '>Can edit</option></select><button class="ghost-btn invitation-remove" data-action="revoke-invitation" data-invitation-id="' + esc(invitation.id) + '" title="Remove access">Remove</button></div>').join('');
  const fallbackLink = modal.invitationUrl ? '<div class="invite-fallback"><strong>' + (modal.invitationDelivered ? 'Invitation email sent' : 'Invitation link ready') + '</strong><p>' + (modal.invitationDelivered ? 'You can also copy the secure link if you need to share it another way.' : 'Email delivery is not configured on this server yet. Copy this link and send it to the invitee.') + '</p><div class="share-link-row"><input class="inline-input" id="invitation-link" value="' + esc(modal.invitationUrl) + '" readonly /><button class="secondary-btn" data-action="copy-invitation-link">Copy</button></div></div>' : '';
  $('#modal-root').innerHTML = '<div class="modal-layer" data-action="close-modal"><div class="modal modal--small modal--share" data-stop><div class="modal-head"><h2>Share ' + esc(board.title) + '</h2><button class="icon-btn close" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><div class="share-section"><div class="modal-label" style="margin-top:0">Invite people</div><form id="invite-form" class="invite-form"><input class="inline-input" id="invite-email" type="email" placeholder="name@example.com" aria-label="Email address" required /><select class="inline-input" id="invite-role" aria-label="Permission"><option value="viewer">Read-only</option><option value="editor">Can edit</option></select><button class="primary-btn" type="submit">Invite</button></form><p class="modal-hint">They will receive an email with a secure invitation link. They must use this email address to join.</p>' + fallbackLink + '</div><div class="share-section"><div class="modal-label" style="margin-top:0">People with access</div><div class="shared-members-list">' + members + inviteRows + (members || inviteRows ? '' : '<div class="empty">No one else has access yet.</div>') + '</div></div><div class="share-section"><div class="modal-label" style="margin-top:0">Public link</div><div class="share-status ' + (isPublic ? 'is-public' : '') + '"><span>' + (isPublic ? 'Public link enabled' : 'Private board') + '</span><p>' + (isPublic ? 'Anyone with the public link can view this board without an account. They cannot edit it or see your other boards.' : 'This board is private. Public links are read-only and separate from member invitations.') + '</p></div><label class="public-share-toggle"><input id="public-share-toggle" type="checkbox" ' + (isPublic ? 'checked' : '') + ' /><span><strong>Allow public viewing</strong><small>Anyone with the link can view this board without signing in.</small></span></label>' + (isPublic ? '<div class="field"><label for="public-share-link">Public board link</label><div class="share-link-row"><input class="inline-input" id="public-share-link" value="' + esc(publicLink) + '" readonly /><button class="secondary-btn" data-action="copy-public-board-link">Copy</button></div><button class="ghost-btn revoke-public-share" data-action="revoke-public-share">Disable public link</button></div>' : '') + '</div></div><div class="modal-form-footer"><button class="primary-btn close" data-action="close-modal">Done</button></div></div></div>';
  $('#public-share-toggle').addEventListener('change', event => updatePublicShare(event.target.checked));
  $('#invite-form').addEventListener('submit', submitBoardInvitation);
  document.querySelectorAll('.invite-role-select').forEach(select => select.addEventListener('change', event => updateBoardInvitation(event.target.dataset.invitationId, event.target.value)));
  if (!modal.invitationsLoaded) loadBoardInvitations();
}
async function loadBoardInvitations() {
  if (modal?.type !== 'share' || !canManageBoard()) return;
  modal.invitationsLoaded = true;
  try { const result = await api('/api/board-invitations?boardId=' + encodeURIComponent(currentBoard().id)); if (modal?.type !== 'share') return; modal.invitations = result.invitations || []; renderShareModal(); } catch (error) { notify(error.message); }
}
async function submitBoardInvitation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = $('#invite-email').value.trim();
  const role = $('#invite-role').value;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try { const result = await api('/api/board-invitations', { method: 'POST', body: JSON.stringify({ boardId: currentBoard().id, email, role, appUrl: window.location.origin + appRoot }) }); if (modal?.type !== 'share') return; modal.invitationUrl = result.invitationUrl; modal.invitationDelivered = result.emailDelivered; modal.invitationsLoaded = false; renderShareModal(); notify(result.emailDelivered ? 'Invitation email sent' : 'Invitation created'); } catch (error) { button.disabled = false; notify(error.message); }
}
async function updateBoardInvitation(invitationId, role) {
  try { const result = await api('/api/board-invitations/' + encodeURIComponent(invitationId), { method: 'PATCH', body: JSON.stringify({ role }) }); const member = currentBoard().members?.find(item => item.id === result.memberId); if (member) member.role = role; if (modal?.type !== 'share') return; modal.invitationsLoaded = false; renderShareModal(); notify('Permission updated'); } catch (error) { notify(error.message); }
}
async function revokeBoardInvitation(invitationId) {
  try { const result = await api('/api/board-invitations/' + encodeURIComponent(invitationId), { method: 'PATCH', body: JSON.stringify({ revoked: true }) }); if (result.memberId) currentBoard().members = (currentBoard().members || []).filter(member => member.id !== result.memberId); if (modal?.type !== 'share') return; modal.invitationsLoaded = false; renderShareModal(); notify('Board access removed'); } catch (error) { notify(error.message); }
}
async function updatePublicShare(enabled) {
  const board = currentBoard();
  const toggle = $('#public-share-toggle');
  if (toggle) toggle.disabled = true;
  try {
    const result = await api('/api/board-public-share', { method: 'POST', body: JSON.stringify({ boardId: board.id, enabled }) });
    board.publicShare = result.publicShare;
    if (modal?.type === 'share') { modal.invitationsLoaded = false; renderShareModal(); }
    notify(enabled ? 'Public link enabled' : 'Public link disabled');
  } catch (error) {
    if (toggle) { toggle.checked = !enabled; toggle.disabled = false; }
    notify(error.message);
  }
}
function renderShortcutsModal() {
  const rows = [['?', 'Show keyboard shortcuts'], ['⌘ / Ctrl K', 'Focus card search'], ['/', 'Focus card search'], ['N', 'Create a card'], ['L', 'Create a list'], ['S', 'Open workspace settings'], ['Esc', 'Close the current dialog'], ['⌘ / Ctrl Enter', 'Post a card comment']];
  $('#modal-root').innerHTML = '<div class="modal-layer" data-action="close-modal"><div class="modal modal--small" data-stop><div class="modal-head"><h2>Keyboard shortcuts</h2><button class="icon-btn close" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><p class="modal-hint">Shortcuts stay out of the way while you are typing in a field.</p><div class="shortcut-list">' + rows.map(row => '<div class="shortcut-row"><span>' + esc(row[1]) + '</span><kbd>' + esc(row[0]) + '</kbd></div>').join('') + '</div></div><div class="modal-form-footer"><button class="primary-btn close" data-action="close-modal">Done</button></div></div></div>';
}
function wireDragAndDrop() {
  document.querySelectorAll('.card[draggable=\"true\"]').forEach(card => {
    card.addEventListener('dragstart', event => {
      dragState = { cardId: card.dataset.id, listId: card.dataset.list };
      card.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.id);
    });
    card.addEventListener('dragend', () => { dragState = null; card.classList.remove('is-dragging'); document.querySelectorAll('.card').forEach(item => item.classList.remove('is-drop-before', 'is-drop-after')); document.querySelectorAll('.column').forEach(column => column.classList.remove('is-drag-target')); });
    card.addEventListener('dragover', event => {
      if (!dragState || dragState.cardId === card.dataset.id) return;
      event.preventDefault();
      event.stopPropagation();
      const placeAfter = event.clientY > card.getBoundingClientRect().top + card.offsetHeight / 2;
      document.querySelectorAll('.card').forEach(item => { if (item !== card) item.classList.remove('is-drop-before', 'is-drop-after'); });
      card.classList.toggle('is-drop-before', !placeAfter);
      card.classList.toggle('is-drop-after', placeAfter);
    });
    card.addEventListener('dragleave', () => card.classList.remove('is-drop-before', 'is-drop-after'));
    card.addEventListener('drop', event => {
      if (!dragState || dragState.cardId === card.dataset.id) return;
      event.preventDefault();
      event.stopPropagation();
      const placeAfter = event.clientY > card.getBoundingClientRect().top + card.offsetHeight / 2;
      const moved = moveCard(dragState.cardId, dragState.listId, card.dataset.list, card.dataset.id, placeAfter);
      if (moved) notify('Card order updated');
      dragState = null;
    });
  });
  document.querySelectorAll('.column').forEach(column => {
    column.addEventListener('dragover', event => { if (columnDragState) return; event.preventDefault(); column.classList.add('is-drag-target'); });
    column.addEventListener('dragleave', event => { if (columnDragState) return; if (!column.contains(event.relatedTarget)) column.classList.remove('is-drag-target'); });
    column.addEventListener('drop', event => {
      if (columnDragState) return;
      event.preventDefault();
      column.classList.remove('is-drag-target');
      if (!dragState) return;
      const position = cardDropPosition(column, event.clientY);
      const moved = moveCard(dragState.cardId, dragState.listId, column.dataset.list, position.targetCardId, position.placeAfter);
      if (moved) notify('Card moved to ' + currentBoard().lists.find(list => list.id === column.dataset.list).title);
      dragState = null;
    });
  });
}
function wireColumnDragAndDrop() {
  const clearColumnDragStyles = () => document.querySelectorAll('.column').forEach(column => column.classList.remove('is-list-dragging', 'is-list-drop-before', 'is-list-drop-after'));
  document.querySelectorAll('.column-drag[draggable="true"]').forEach(handle => {
    handle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const lists = currentBoard().lists;
      const index = lists.findIndex(list => list.id === handle.dataset.list);
      const offset = event.key === 'ArrowLeft' ? -1 : 1;
      const target = lists[index + offset];
      if (!target) return;
      event.preventDefault();
      const moved = moveList(handle.dataset.list, target.id, offset > 0);
      if (moved) {
        document.querySelectorAll('.column-drag').forEach(nextHandle => { if (nextHandle.dataset.list === handle.dataset.list) nextHandle.focus(); });
        notify('List moved ' + (offset < 0 ? 'left' : 'right'));
      }
    });
    handle.addEventListener('dragstart', event => {
      columnDragState = { listId: handle.dataset.list };
      handle.closest('.column').classList.add('is-list-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'boardy-list');
    });
    handle.addEventListener('dragend', () => { columnDragState = null; clearColumnDragStyles(); });
  });
  document.querySelectorAll('.column').forEach(column => {
    column.addEventListener('dragover', event => {
      if (!columnDragState || column.dataset.list === columnDragState.listId) return;
      event.preventDefault();
      const placeAfter = event.clientX > column.getBoundingClientRect().left + column.offsetWidth / 2;
      column.classList.toggle('is-list-drop-before', !placeAfter);
      column.classList.toggle('is-list-drop-after', placeAfter);
    });
    column.addEventListener('dragleave', event => {
      if (!column.contains(event.relatedTarget)) column.classList.remove('is-list-drop-before', 'is-list-drop-after');
    });
    column.addEventListener('drop', event => {
      if (!columnDragState || column.dataset.list === columnDragState.listId) return;
      event.preventDefault();
      event.stopPropagation();
      const placeAfter = event.clientX > column.getBoundingClientRect().left + column.offsetWidth / 2;
      const moved = moveList(columnDragState.listId, column.dataset.list, placeAfter);
      columnDragState = null;
      if (moved) notify('List order updated');
    });
  });
}
function openCard(cardId, listId) { modal = { type: 'card', cardId, listId }; setCardSaveStatus('Saved'); renderModal(); }
function selectedCard() { const board = currentBoard(); const list = board.lists.find(item => item.id === modal.listId); return { card: list && list.cards.find(item => item.id === modal.cardId), list }; }
function finishModalRender(previousModel, focusRef) {
  const dialog = $('#modal-root .modal');
  if (!dialog) return;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;
  const heading = dialog.querySelector('.modal-head h2');
  if (heading) {
    if (!heading.id) heading.id = 'boardy-dialog-title';
    dialog.setAttribute('aria-labelledby', heading.id);
  } else if ($('#detail-title', dialog)) dialog.setAttribute('aria-label', 'Card details: ' + $('#detail-title', dialog).value);
  if (modal !== previousModel) dialog.focus({ preventScroll: true });
  else if (focusRef) {
    const restored = focusRef.id ? document.getElementById(focusRef.id) : [...dialog.querySelectorAll('[data-action]')].find(item => item.dataset.action === focusRef.action && item.dataset.id === focusRef.idValue && item.dataset.index === focusRef.index);
    restored?.focus({ preventScroll: true });
  }
  dialogModel = modal;
}
function renderModal() {
  const root = $('#modal-root');
  if (!modal) {
    if (root) root.innerHTML = '';
    dialogModel = null;
    const returnTarget = dialogReturnFocus;
    dialogReturnFocus = null;
    if (returnTarget) requestAnimationFrame(() => {
      let target = returnTarget;
      if (!target.isConnected && target.dataset?.action) target = [...document.querySelectorAll('[data-action]')].find(item => item.dataset.action === returnTarget.dataset.action && item.dataset.id === returnTarget.dataset.id && item.dataset.list === returnTarget.dataset.list) || null;
      target?.isConnected && target.focus({ preventScroll: true });
    });
    return;
  }
  if (!dialogModel && !dialogReturnFocus && document.activeElement !== document.body) dialogReturnFocus = document.activeElement;
  const previousModel = dialogModel;
  const active = document.activeElement;
  const focusRef = active && active.closest('#modal-root .modal') ? { id: active.id, action: active.dataset.action, idValue: active.dataset.id, index: active.dataset.index } : null;
  if (modal.type === 'settings') { renderSettings(); finishModalRender(previousModel, focusRef); return; }
  if (modal.type === 'board-settings') { renderBoardSettings(); finishModalRender(previousModel, focusRef); return; }
  if (modal.type === 'archived-boards') { renderArchivedBoards(); finishModalRender(previousModel, focusRef); return; }
  if (modal.type === 'input') { renderInputModal(); finishModalRender(previousModel, focusRef); return; }
  if (modal.type === 'label') { renderLabelModal(); finishModalRender(previousModel, focusRef); return; }
  if (modal.type === 'board-color') { renderBoardColorModal(); finishModalRender(previousModel, focusRef); return; }
  if (modal.type === 'create-card') { renderCardCreateModal(); finishModalRender(previousModel, focusRef); return; }
  if (modal.type === 'confirm') { renderConfirmModal(); finishModalRender(previousModel, focusRef); return; }
  if (modal.type === 'share') { renderShareModal(); finishModalRender(previousModel, focusRef); return; }
  if (modal.type === 'shortcuts') { renderShortcutsModal(); finishModalRender(previousModel, focusRef); return; }
  const board = currentBoard();
  const selected = selectedCard(); const card = selected.card; const list = selected.list;
  if (!card) { modal = null; return renderModal(); }
  const done = (card.checklist || []).filter(item => item.done).length;
  const labels = (card.labels || []).map((label, index) => '<button class=\"label ' + esc(label.color || '') + '\" data-action=\"remove-label\" data-index=\"' + index + '\">' + esc(label.name) + ' ×</button>').join('');
  const checks = (card.checklist || []).map((item, index) => {
    if (modal.editingCheckIndex === index) return '<div class=\"checklist-item checklist-item--editing\"><input class=\"inline-input checklist-edit-input\" id=\"check-edit-' + index + '\" value=\"' + esc(item.text) + '\" aria-label=\"Edit checklist item\"/><div class=\"checklist-item-actions\"><button class=\"checklist-action checklist-action--save\" data-action=\"save-check\" data-index=\"' + index + '\" title=\"Save checklist item\" aria-label=\"Save checklist item\">✓</button><button class=\"checklist-action\" data-action=\"cancel-check\" data-index=\"' + index + '\" title=\"Cancel editing\" aria-label=\"Cancel editing\">×</button></div></div>';
    return '<div class=\"checklist-item ' + (item.done ? 'done' : '') + '\"><label class=\"checklist-check\"><input type=\"checkbox\" data-action=\"toggle-check\" data-index=\"' + index + '\" ' + (item.done ? 'checked' : '') + '/><span>' + esc(item.text) + '</span></label><div class=\"checklist-item-actions\"><button class=\"checklist-action\" data-action=\"edit-check\" data-index=\"' + index + '\" title=\"Edit checklist item\" aria-label=\"Edit checklist item\">✎</button><button class=\"checklist-action\" data-action=\"move-check-up\" data-index=\"' + index + '\" title=\"Move item up\" aria-label=\"Move item up\" ' + (index === 0 ? 'disabled' : '') + '>↑</button><button class=\"checklist-action\" data-action=\"move-check-down\" data-index=\"' + index + '\" title=\"Move item down\" aria-label=\"Move item down\" ' + (index === card.checklist.length - 1 ? 'disabled' : '') + '>↓</button><button class=\"checklist-action checklist-action--delete\" data-action=\"remove-check\" data-index=\"' + index + '\" title=\"Delete checklist item\" aria-label=\"Delete checklist item\">×</button></div></div>';
  }).join('');
  const attachments = (card.attachments || []).map((attachment, index) => '<div class=\"attachment\">' + (attachment.type && attachment.type.startsWith('image/') ? '<img src=\"' + attachment.data + '\" alt=\"' + esc(attachment.name) + '\"/>' : '') + '<span>' + esc(attachment.name) + '</span><button class=\"remove-attachment\" data-action=\"remove-attachment\" data-index=\"' + index + '\">×</button></div>').join('');
  const comments = (card.comments || []).map(comment => '<div class=\"comment\"><span class=\"avatar\">' + esc(initials(comment.author)) + '</span><div class=\"comment-body\"><b>' + esc(comment.author) + '</b>' + linkify(comment.text) + '<time>' + formatDate(comment.time) + '</time></div></div>').join('');
  const availableMembers = board.members && board.members.length ? board.members : [{ id: 'member_you', name: state.user.name, initials: state.user.avatar || initials(state.user.name), color: '#17b897' }];
  const memberPicker = modal.memberPicker ? '<div class=\"member-picker\"><div class=\"member-picker-title\">People on this board</div>' + availableMembers.map(member => { const selected = (card.members || []).includes(member.id); return '<button class=\"member-option ' + (selected ? 'selected' : '') + '\" data-action=\"toggle-member\" data-member-id=\"' + esc(member.id) + '\" aria-pressed=\"' + selected + '\"><span class=\"member-avatar\" style=\"background:' + esc(member.color || '#17b897') + '\">' + esc(member.initials || initials(member.name)) + '</span><span>' + esc(member.name) + '</span><span class=\"member-check\">' + (selected ? '✓' : '') + '</span></button>'; }).join('') + '</div>' : '';
  root.innerHTML = '<div class=\"modal-layer\" data-action=\"close-modal\"><div class=\"modal modal--card\" data-stop><div class=\"modal-head\"><div style=\"flex:1\"><div class=\"modal-label\" style=\"margin-top:0\">' + esc(list.title) + '</div><input class=\"detail-input\" id=\"detail-title\" value=\"' + esc(card.title) + '\" /></div><button class=\"icon-btn close\" data-action=\"close-modal\" aria-label=\"Close\">×</button></div><div class=\"modal-body\"><div class=\"card-layout\"><div><div class=\"modal-label\">Description</div><textarea class=\"detail-input description-input\" id=\"detail-description\" placeholder=\"Add a description to your card...\">' + esc(card.description || '') + '</textarea><div class=\"modal-label\">Labels</div><div class=\"labels\" id=\"detail-labels\">' + labels + '<button class=\"ghost-btn\" style=\"padding:3px 5px;font-size:12px\" data-action=\"add-label\">＋ Add label</button></div><div class=\"modal-label checklist-head\"><span>Checklist</span><span style=\"color:var(--muted-2)\">' + done + '/' + (card.checklist || []).length + '</span></div><div>' + checks + '</div><div class=\"checklist-add\"><input class=\"inline-input\" id=\"check-item\" placeholder=\"Add an item\" /><button class=\"secondary-btn\" data-action=\"add-check\">Add</button></div><div class=\"modal-label\">Attachments</div><div class=\"attachment-grid\">' + attachments + '</div><label class=\"secondary-btn\" style=\"display:inline-flex;margin-top:10px;font-size:12px;cursor:pointer\">＋ Add attachment<input id=\"attachment-input\" type=\"file\" multiple hidden /></label><div class=\"comments\"><div class=\"modal-label\" style=\"margin-top:0\">Activity</div>' + comments + '<div class=\"comment-compose\"><span class=\"avatar\">' + esc(state.user.avatar || initials(state.user.name)) + '</span><textarea class=\"field input\" id=\"comment-input\" placeholder=\"Write a comment... (⌘ Enter to post)\"></textarea><button class=\"primary-btn\" data-action=\"add-comment\">Post</button></div></div></div><aside class=\"detail-side\"><div class=\"modal-label\" style=\"margin-top:0\">Add to card</div><button class=\"side-action\" data-action=\"set-due\">◷ ' + (card.due ? 'Due ' + formatDate(card.due) : 'Due date') + '</button>' + (card.due ? '<button class=\"side-action compact-action\" data-action=\"clear-due\">Remove due date</button>' : '') + '<button class=\"side-action\" data-action=\"add-label\">▰ Labels</button><button class=\"side-action\" data-action=\"add-member\">♙ Members</button>' + memberPicker + '<div class=\"modal-label\">Card actions</div><button class=\"side-action\" data-action=\"duplicate-card\">▣ Duplicate</button><button class=\"side-action\" data-action=\"archive-card\" style=\"color:#ff9e7a\">⌫ Archive card</button></aside></div></div></div></div>';
  if (!canEditBoard(board)) {
    root.classList.add('card-modal-read-only');
    $('#detail-title', root).readOnly = true;
    $('#detail-description', root).readOnly = true;
    root.querySelectorAll('input[type="checkbox"], .checklist-item-actions, .checklist-add, #detail-labels button, .remove-attachment, .detail-side .side-action, .comment-compose, label[for="attachment-input"]').forEach(element => element.remove());
    $('#attachment-input', root)?.closest('label')?.remove();
    const detailSide = $('.detail-side', root);
    if (detailSide) detailSide.innerHTML = '<div class="modal-label" style="margin-top:0">Access</div><p class="modal-hint">You have read-only access to this board.</p>';
  }
  const closeButton = $('.modal-head .close', root);
  closeButton?.insertAdjacentHTML('beforebegin', '<span class="card-save-status" role="status" aria-live="polite">' + esc(cardSaveStatus) + '</span>');
  setCardSaveStatus(cardSaveStatus);
  const commentComposer = $('.comment-compose', root);
  if (commentComposer) commentComposer.innerHTML = '<span class="avatar">' + esc(state.user.avatar || initials(state.user.name)) + '</span><div class="comment-editor"><textarea id="comment-input" placeholder="Write a comment..." aria-label="Write a comment"></textarea><div class="comment-editor-footer"><span class="comment-hint">⌘ Enter to post</span><button class="primary-btn comment-submit" data-action="add-comment">Post <kbd>⌘↵</kbd></button></div></div>';
  const descriptionLinks = extractUrls(card.description);
  if (descriptionLinks.length) {
    const linkRows = descriptionLinks.map(link => {
      return '<a class="text-link description-link" href="' + esc(link.href) + '" target="_blank" rel="noopener noreferrer" title="Open ' + esc(link.href) + '"><span>↗</span><span>' + esc(link.href) + '</span><b>Open link</b></a>';
    }).join('');
    $('#detail-description', root)?.insertAdjacentHTML('afterend', '<div class="description-links"><div class="description-links-label">Links in description · click to open</div>' + linkRows + '</div>');
  }
  $('#detail-title').addEventListener('input', event => { selectedCard().card.title = event.target.value; persist(); });
  $('#detail-description').addEventListener('input', event => { selectedCard().card.description = event.target.value; persist(); });
  $('#attachment-input')?.addEventListener('change', handleAttachments);
  finishModalRender(previousModel, focusRef);
}
function renderSettings() {
  const themes = themeOptions.map(theme => '<button class=\"theme-choice ' + (state.theme === theme.id ? 'active' : '') + '\" data-action=\"set-theme\" data-theme=\"' + theme.id + '\"><strong>' + theme.name + '</strong><div class=\"theme-preview ' + theme.preview + '\"></div></button>').join('');
  $('#modal-root').innerHTML = '<div class=\"modal-layer\" data-action=\"close-modal\"><div class=\"modal\" data-stop><div class=\"modal-head\"><h2>Customize your space</h2><button class=\"icon-btn close\" data-action=\"close-modal\" aria-label=\"Close\">×</button></div><div class=\"modal-body\"><div class=\"modal-label\" style=\"margin-top:0\">Theme</div><div class=\"settings-grid theme-grid\">' + themes + '</div><div class=\"modal-label\">Wallpaper</div><div class=\"settings-grid\"><button class=\"wallpaper-choice ' + (state.wallpaper === 'aurora' ? 'active' : '') + '\" data-action=\"set-wallpaper\" data-wallpaper=\"aurora\"><div class=\"wallpaper-swatch wallpaper-aurora\"></div><span>Aurora</span></button><button class=\"wallpaper-choice ' + (state.wallpaper === 'night' ? 'active' : '') + '\" data-action=\"set-wallpaper\" data-wallpaper=\"night\"><div class=\"wallpaper-swatch wallpaper-night\"></div><span>Night sky</span></button><button class=\"wallpaper-choice ' + (state.wallpaper === 'sand' ? 'active' : '') + '\" data-action=\"set-wallpaper\" data-wallpaper=\"sand\"><div class=\"wallpaper-swatch wallpaper-sand\"></div><span>Warm sand</span></button><button class=\"wallpaper-choice ' + (state.wallpaper && state.wallpaper.startsWith('data:') ? 'active' : '') + '\" data-action=\"upload-wallpaper\"><div class=\"wallpaper-swatch wallpaper-file\"></div><span>Upload image</span></button></div><div class=\"upload-row\"><span>Choose a custom image from your device. It stays in your Boardy workspace.</span><label class=\"secondary-btn\" style=\"font-size:12px;white-space:nowrap\">Browse<input id=\"wallpaper-input\" type=\"file\" accept=\"image/*\" hidden /></label></div></div></div></div>';
  $('#modal-root .modal-body').insertAdjacentHTML('beforeend', '<div class="modal-label">Backup</div><div class="backup-panel"><div><strong>Portable workspace backup</strong><p>Export every board, card, attachment, theme, wallpaper, and layout preference to one JSON file.</p></div><div class="backup-actions"><button class="secondary-btn" data-action="export-backup">↓ Export</button><label class="secondary-btn">↑ Import<input id="backup-input" type="file" accept="application/json,.json" hidden /></label></div></div>');
  $('#wallpaper-input').addEventListener('change', handleWallpaper);
  $('#backup-input').addEventListener('change', handleBackupImport);
  $('#modal-root .modal-head h2').textContent = 'Workspace Settings';
}
function renderBoardSettings() {
  const board = currentBoard();
  const hasBackground = isImageData(board.background);
  $('#modal-root').innerHTML = '<div class="modal-layer" data-action="close-modal"><div class="modal modal--small" data-stop><div class="modal-head"><h2>Customize board</h2><button class="icon-btn close" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><p class="modal-hint">Choose a background image for this board. Columns and cards will stay layered above it.</p><div class="board-background-preview" id="board-background-preview"><span>' + (hasBackground ? 'Current board background' : 'No board background selected') + '</span></div><div class="board-background-actions"><label class="secondary-btn">＋ Choose image<input id="board-background-input" type="file" accept="image/*" hidden /></label><button class="ghost-btn" data-action="clear-board-background" ' + (hasBackground ? '' : 'disabled') + '>Remove image</button></div><p class="modal-hint board-background-note">Images are kept in this workspace and included in backups. Maximum size: 4 MB.</p></div></div></div>';
  $('#modal-root .modal-head h2').textContent = 'Board Settings';
  if (hasBackground) $('#board-background-preview').style.backgroundImage = 'url("' + board.background + '")';
  $('#board-background-input').addEventListener('change', handleBoardBackground);
  $('#modal-root .modal-body').insertAdjacentHTML('beforeend', '<div class="modal-label">Board actions</div><div class="board-danger-actions"><button class="secondary-btn" data-action="archive-board">Archive board</button><button class="danger-btn" data-action="delete-board">Delete board</button></div>');
}
function renderArchivedBoards() {
  const archived = state.boards.filter(board => board.archived);
  const rows = archived.length ? archived.map(board => '<div class="archived-board-row"><div><strong>' + esc(board.title) + '</strong><span>' + allCards(board).length + ' cards</span></div><div class="archived-board-actions"><button class="secondary-btn" data-action="unarchive-board" data-id="' + board.id + '">Restore</button><button class="ghost-btn archived-delete" data-action="delete-board" data-id="' + board.id + '">Delete</button></div></div>').join('') : '<div class="empty"><strong>No archived boards</strong><span>Archived boards will appear here.</span></div>';
  $('#modal-root').innerHTML = '<div class="modal-layer" data-action="close-modal"><div class="modal modal--small" data-stop><div class="modal-head"><h2>Archived boards</h2><button class="icon-btn close" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><p class="modal-hint">Restore a board to return it to your workspace, or delete it permanently.</p><div class="archived-board-list">' + rows + '</div></div></div></div>';
}
const fileToDataUrl = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
async function handleAttachments(event) {
  const card = selectedCard().card;
  for (const file of Array.from(event.target.files)) {
    if (file.size > 2000000) { notify(file.name + ' is larger than 2 MB'); continue; }
    card.attachments = (card.attachments || []).concat([{ name: file.name, type: file.type, data: await fileToDataUrl(file) }]);
  }
  persist(); renderModal(); renderBoardOnly();
}
function handleWallpaper(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 4000000) return notify('Wallpaper must be smaller than 4 MB');
  fileToDataUrl(file).then(data => { state.wallpaper = data; setPreferences(); persist(); renderSettings(); });
}
function handleBoardBackground(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return notify('Choose an image file');
  if (file.size > 4000000) return notify('Board backgrounds must be smaller than 4 MB');
  fileToDataUrl(file).then(data => { const board = currentBoard(); board.background = data; persist(); applyBoardBackground(board); renderBoardSettings(); notify('Board background updated'); });
}
function workspaceBackup() {
  return { format: backupFormat, version: backupVersion, exportedAt: new Date().toISOString(), data: { boards: state.boards, theme: state.theme, wallpaper: state.wallpaper, sidebarCollapsed: state.sidebarCollapsed } };
}
function exportWorkspaceBackup() {
  const blob = new Blob([JSON.stringify(workspaceBackup(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'boardy-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  notify('Backup downloaded');
}
function parseWorkspaceBackup(raw) {
  if (!raw || raw.format !== backupFormat || raw.version !== backupVersion || !raw.data || !Array.isArray(raw.data.boards)) throw new Error('This is not a supported Boardy backup file.');
  if (!raw.data.boards.every(board => board && typeof board === 'object' && typeof board.title === 'string' && Array.isArray(board.lists) && board.lists.every(list => list && typeof list === 'object' && typeof list.title === 'string' && Array.isArray(list.cards)))) throw new Error('This backup has an invalid board structure.');
  if (typeof raw.data.wallpaper !== 'string' || raw.data.wallpaper.length > 4_000_000) throw new Error('This backup has an invalid wallpaper.');
  return { boards: raw.data.boards, theme: themeOptions.some(theme => theme.id === raw.data.theme) ? raw.data.theme : 'dark', wallpaper: raw.data.wallpaper, sidebarCollapsed: Boolean(raw.data.sidebarCollapsed) };
}
async function handleBackupImport(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > maxBackupBytes) return notify('Backup files must be smaller than 7 MB');
  try {
    const workspace = parseWorkspaceBackup(JSON.parse(await file.text()));
    openConfirmModal({ heading: 'Import this backup?', message: 'This replaces every board and workspace preference in your current account. This cannot be undone unless you export a backup first.', confirmLabel: 'Import backup', onConfirm: () => { ensureBoardSlugs(workspace.boards); const importedBoard = workspace.boards.find(item => !item.archived) || workspace.boards[0]; state = { ...state, ...workspace, boardId: importedBoard ? importedBoard.id : null, query: '', onlyDue: false, onlyStarred: false }; if (importedBoard && !importedBoard.archived) { rememberBoard(importedBoard); updateBoardUrl(importedBoard, true); } else updateBoardUrl(null, true); persist(); renderApp(); notify('Backup imported'); } });
  } catch (error) { notify(error.message || 'Could not import this backup'); }
}

function handleAction(action, target) {
  const board = currentBoard();
  if (!board) return;
  if (!canManageBoard(board) && ['board-settings', 'change-board-color', 'rename-board', 'edit-board-description', 'toggle-star', 'archive-board', 'delete-board', 'share', 'invite', 'clear-board-background'].includes(action)) return notify('Only the board owner can do that');
  if (!canEditBoard(board) && ['toggle-card-star', 'move-card-up', 'move-card-down', 'move-card-left', 'move-card-right', 'move-list-left', 'move-list-right', 'add-list', 'rename-list', 'add-card-top', 'add-card', 'toggle-check', 'add-check', 'edit-check', 'cancel-check', 'save-check', 'move-check-up', 'move-check-down', 'remove-check', 'add-label', 'remove-label', 'set-due', 'clear-due', 'add-member', 'toggle-member', 'duplicate-card', 'archive-card', 'remove-attachment', 'add-comment'].includes(action)) return;
  if (action === 'open-card') return openCard(target.dataset.id, target.dataset.list);
  if (action.startsWith('move-card-')) {
    const listIndex = board.lists.findIndex(list => list.id === target.dataset.list);
    const list = board.lists[listIndex];
    const cardIndex = list?.cards.findIndex(card => card.id === target.dataset.id) ?? -1;
    if (cardIndex < 0) return;
    const direction = action.slice('move-card-'.length);
    if (direction === 'up' || direction === 'down') {
      const neighbor = list.cards[cardIndex + (direction === 'up' ? -1 : 1)];
      if (neighbor && moveCard(target.dataset.id, list.id, list.id, neighbor.id, direction === 'down')) notify('Card order updated');
    } else {
      const destination = board.lists[listIndex + (direction === 'left' ? -1 : 1)];
      if (destination && moveCard(target.dataset.id, list.id, destination.id)) notify('Card moved to ' + destination.title);
    }
    return;
  }
  if (action === 'move-list-left' || action === 'move-list-right') {
    const index = board.lists.findIndex(list => list.id === target.dataset.id);
    const neighbor = board.lists[index + (action === 'move-list-left' ? -1 : 1)];
    if (neighbor && moveList(target.dataset.id, neighbor.id, action === 'move-list-right')) notify('List order updated');
    return;
  }
  if (action === 'toggle-card-star') {
    const item = board.lists.flatMap(list => list.cards).find(card => card.id === target.dataset.id);
    if (item) { item.starred = !item.starred; persist(); renderBoardOnly(); }
    return;
  }
  if (action === 'close-modal') return dismissModal();
  if (action === 'settings') { modal = { type: 'settings' }; return renderModal(); }
  if (action === 'board-settings') { modal = { type: 'board-settings' }; return renderModal(); }
  if (action === 'archived-boards') { modal = { type: 'archived-boards' }; return renderModal(); }
  if (action === 'archive-board') {
    board.archived = true;
    const next = firstActiveBoard();
    state.boardId = next ? next.id : null;
    state.view = next ? 'board' : 'home';
    if (next) { rememberBoard(next); updateBoardUrl(next, true); } else updateBoardUrl(null, true);
    modal = null;
    persist(); renderApp(); notify('Board archived');
    return;
  }
  if (action === 'unarchive-board') {
    const restored = state.boards.find(item => item.id === target.dataset.id);
    if (!restored) return;
    restored.archived = false;
    state.boardId = restored.id;
    state.view = 'board';
    rememberBoard(restored); updateBoardUrl(restored, true);
    modal = null;
    persist(); renderApp(); notify('Board restored');
    return;
  }
  if (action === 'delete-board') {
    const candidate = target.dataset.id ? state.boards.find(item => item.id === target.dataset.id) : board;
    if (!candidate) return;
    return openConfirmModal({ heading: 'Delete this board permanently?', message: 'This removes the board, its lists, cards, attachments, and activity. This cannot be undone unless you have a backup.', confirmLabel: 'Delete board', onConfirm: () => {
      state.boards = state.boards.filter(item => item.id !== candidate.id);
      if (state.boardId === candidate.id) {
        const next = firstActiveBoard();
        state.boardId = next ? next.id : null;
        state.view = next ? 'board' : 'home';
        if (next) { rememberBoard(next); updateBoardUrl(next, true); } else updateBoardUrl(null, true);
      }
      modal = null;
      persist(); renderApp(); notify('Board deleted');
    }});
  }
  if (action === 'clear-board-background') { board.background = ''; persist(); applyBoardBackground(board); return renderBoardSettings(); }
  if (action === 'export-backup') return exportWorkspaceBackup();
  if (action === 'shortcuts') { modal = { type: 'shortcuts' }; return renderModal(); }
  if (action === 'toggle-sidebar') { const sidebar = $('#sidebar'); const isOpen = sidebar.classList.toggle('open'); target.setAttribute('aria-expanded', isOpen); return; }
  if (action === 'toggle-sidebar-collapse') { state.sidebarCollapsed = !state.sidebarCollapsed; persist(); return renderApp(); }
  if (action === 'clear-search') { state.query = ''; renderApp(); $('#search').focus(); return; }
  if (action === 'select-board') { const selectedBoard = state.boards.find(item => item.id === target.dataset.id && !item.archived); if (!selectedBoard) return; state.boardId = selectedBoard.id; state.view = 'board'; state.query = ''; rememberBoard(selectedBoard); updateBoardUrl(selectedBoard); $('#sidebar')?.classList.remove('open'); return renderApp(); }
  if (action === 'change-board-color') return openBoardColorModal(state.boards.find(item => item.id === target.dataset.id) || board);
  if (action === 'home') { $('#sidebar')?.classList.remove('open'); state.view = 'home'; state.onlyStarred = false; state.onlyDue = false; return renderApp(); }
  if (action === 'starred') { $('#sidebar')?.classList.remove('open'); state.view = 'starred'; state.onlyStarred = true; state.onlyDue = false; return renderApp(); }
  if (action === 'due-filter') { state.view = 'board'; state.onlyDue = !state.onlyDue; return renderApp(); }
  if (action === 'starred-filter') { state.view = 'board'; state.onlyStarred = !state.onlyStarred; return renderApp(); }
  if (action === 'add-board') return openInputModal({ heading: 'Create a board', label: 'Board name', placeholder: 'e.g. Product launch', submitLabel: 'Create board', onSubmit: title => {
    const newBoard = { id: uid('board'), title, description: '', color: '#8f7aea', background: 'aurora', starred: false, members: [{ id: state.user.id, name: state.user.name, initials: state.user.avatar || initials(state.user.name), color: '#17b897', role: 'owner' }], lists: [{ id: uid('list'), title: 'To do', cards: [] }, { id: uid('list'), title: 'In progress', cards: [] }, { id: uid('list'), title: 'Done', cards: [] }] };
    state.boards.push(newBoard); ensureBoardSlugs(state.boards); state.boardId = newBoard.id; state.view = 'board'; rememberBoard(newBoard); updateBoardUrl(newBoard); persist(); renderApp();
  }});
  if (action === 'rename-board') return openInputModal({ heading: 'Rename board', label: 'Board name', value: board.title, submitLabel: 'Save changes', onSubmit: title => { board.title = title; persist(); renderApp(); }});
  if (action === 'edit-board-description') return openInputModal({ heading: 'Describe this board', label: 'Board description', value: board.description || '', placeholder: 'What is this board for?', submitLabel: 'Save description', onSubmit: description => { board.description = description; persist(); renderApp(); }});
  if (action === 'toggle-star') { board.starred = !board.starred; persist(); return renderApp(); }
  if (action === 'add-list') return openInputModal({ heading: 'Add a list', label: 'List name', placeholder: 'e.g. Ready for review', submitLabel: 'Add list', onSubmit: title => { board.lists.push({ id: uid('list'), title, cards: [] }); persist(); renderBoardOnly(); }});
  if (action === 'rename-list') { const list = board.lists.find(item => item.id === target.dataset.id); return openInputModal({ heading: 'Rename list', label: 'List name', value: list.title, submitLabel: 'Save changes', onSubmit: title => { list.title = title; persist(); renderBoardOnly(); }}); }
  if (action === 'add-card-top') return openCardCreateModal();
  if (action === 'add-card') {
    const list = board.lists.find(item => item.id === target.dataset.id); if (!list) return;
    return openInputModal({ heading: 'Add a card', label: 'Card title', placeholder: 'What needs to happen?', submitLabel: 'Create card', onSubmit: title => { list.cards.push({ id: uid('card'), title, description: '', labels: [], due: '', checklist: [], attachments: [], members: [], comments: [] }); persist(); renderBoardOnly(); notify('Card added'); }});
  }
  if (action === 'invite' || action === 'share') return openShareModal();
  if (action === 'copy-public-board-link') {
    const link = $('#public-share-link').value;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => notify('Public link copied')).catch(() => notify('Select and copy the public link'));
    else { $('#public-share-link').select(); document.execCommand('copy'); notify('Public link copied'); }
    return;
  }
  if (action === 'revoke-public-share') return updatePublicShare(false);
  if (action === 'copy-invitation-link') {
    const link = $('#invitation-link').value;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => notify('Invitation link copied')).catch(() => notify('Select and copy the invitation link'));
    else { $('#invitation-link').select(); document.execCommand('copy'); notify('Invitation link copied'); }
    return;
  }
  if (action === 'revoke-invitation') return revokeBoardInvitation(target.dataset.invitationId);
  if (action === 'copy-board-link') {
    const link = $('#share-link').value;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => notify('Board link copied')).catch(() => notify('Select and copy the board link'));
    else { $('#share-link').select(); document.execCommand('copy'); notify('Board link copied'); }
    return;
  }
  if (action === 'notifications') return notify('You are all caught up.');
  if (action === 'logout') return api('/api/logout', { method: 'POST', body: '{}' }).then(() => renderAuth());
  if (!modal || modal.type !== 'card') {
    if (action === 'set-theme') { state.theme = target.dataset.theme; setPreferences(); persist(); renderSettings(); }
    if (action === 'set-wallpaper') { state.wallpaper = target.dataset.wallpaper; setPreferences(); persist(); renderSettings(); }
    return;
  }
  const selected = selectedCard(); const card = selected.card; const list = selected.list;
  if (!card) return;
  if (action === 'toggle-check') { card.checklist[Number(target.dataset.index)].done = target.checked; persist(); renderModal(); renderBoardOnly(); }
  if (action === 'add-check') { const input = $('#check-item'); if (input.value.trim()) { card.checklist.push({ text: input.value.trim(), done: false }); persist(); renderModal(); } }
  if (action === 'edit-check') { modal.editingCheckIndex = Number(target.dataset.index); renderModal(); requestAnimationFrame(() => $('#check-edit-' + target.dataset.index)?.focus()); }
  if (action === 'cancel-check') { modal.editingCheckIndex = null; renderModal(); }
  if (action === 'save-check') {
    const index = Number(target.dataset.index);
    const input = $('#check-edit-' + index);
    const text = input && input.value.trim();
    if (!text) return notify('Checklist items need a name');
    card.checklist[index].text = text;
    modal.editingCheckIndex = null;
    persist(); renderModal(); notify('Checklist item updated');
  }
  if (action === 'move-check-up' || action === 'move-check-down') {
    const index = Number(target.dataset.index);
    const nextIndex = action === 'move-check-up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= card.checklist.length) return;
    [card.checklist[index], card.checklist[nextIndex]] = [card.checklist[nextIndex], card.checklist[index]];
    persist(); renderModal();
  }
  if (action === 'remove-check') {
    const index = Number(target.dataset.index);
    const cardModal = modal;
    return openConfirmModal({ heading: 'Delete this checklist item?', message: 'This removes the item and its completion state from the card.', confirmLabel: 'Delete item', onConfirm: () => { card.checklist.splice(index, 1); modal = cardModal; persist(); renderModal(); notify('Checklist item deleted'); } });
  }
  if (action === 'add-label') return openLabelModal();
  if (action === 'remove-label') { card.labels.splice(Number(target.dataset.index), 1); persist(); renderModal(); renderBoardOnly(); }
  if (action === 'set-due') return openInputModal({ heading: 'Set a due date', label: 'Due date', value: card.due ? card.due.slice(0, 10) : '', inputType: 'date', submitLabel: 'Save date', onSubmit: date => { card.due = new Date(date + 'T17:00:00').toISOString(); persist(); renderModal(); renderBoardOnly(); }});
  if (action === 'clear-due') { card.due = ''; persist(); renderModal(); renderBoardOnly(); notify('Due date removed'); }
  if (action === 'add-member') { modal.memberPicker = !modal.memberPicker; return renderModal(); }
  if (action === 'toggle-member') {
    const memberId = target.dataset.memberId;
    card.members = card.members || [];
    card.members = card.members.includes(memberId) ? card.members.filter(id => id !== memberId) : card.members.concat(memberId);
    persist(); renderModal(); renderBoardOnly();
  }
  if (action === 'duplicate-card') { const copy = JSON.parse(JSON.stringify(card)); copy.id = uid('card'); copy.title += ' (copy)'; list.cards.splice(list.cards.findIndex(item => item.id === card.id) + 1, 0, copy); persist(); modal.cardId = copy.id; renderModal(); renderBoardOnly(); }
  if (action === 'archive-card') return openConfirmModal({ heading: 'Archive this card?', message: 'The card will be removed from this board. You can duplicate it first if you might need its details later.', confirmLabel: 'Archive card', onConfirm: () => { list.cards = list.cards.filter(item => item.id !== card.id); persist(); renderModal(); renderBoardOnly(); notify('Card archived'); }});
  if (action === 'remove-attachment') { card.attachments.splice(Number(target.dataset.index), 1); persist(); renderModal(); renderBoardOnly(); }
  if (action === 'add-comment') { const input = $('#comment-input'); if (input.value.trim()) { card.comments = (card.comments || []).concat([{ author: state.user.name, text: input.value.trim(), time: new Date().toISOString() }]); persist(); renderModal(); } }
}

document.addEventListener('click', event => {
  const sidebar = $('#sidebar');
  if (window.innerWidth <= 900 && sidebar?.classList.contains('open') && !event.target.closest('#sidebar') && !event.target.closest('[data-action="toggle-sidebar"]')) sidebar.classList.remove('open');
  if (event.target.closest('a.text-link')) return;
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (target.dataset.action === 'close-modal' && event.target.closest('[data-stop]') && !event.target.classList.contains('close')) return;
  if (window.innerWidth <= 900 && sidebar?.classList.contains('open') && target.closest('#sidebar') && target.dataset.action !== 'toggle-sidebar') { sidebar.classList.remove('open'); $('[data-action="toggle-sidebar"]')?.setAttribute('aria-expanded', 'false'); }
  if (!modal && ['open-card', 'settings', 'board-settings', 'archived-boards', 'add-board', 'change-board-color', 'rename-board', 'edit-board-description', 'add-list', 'rename-list', 'add-card-top', 'add-card', 'share', 'invite', 'shortcuts', 'delete-board'].includes(target.dataset.action)) dialogReturnFocus = target;
  handleAction(target.dataset.action, target);
});
document.addEventListener('keydown', event => {
  if (modal && event.key === 'Tab') {
    const dialog = $('#modal-root .modal');
    const focusable = dialog ? [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(item => item.getClientRects().length) : [];
    if (!focusable.length) { event.preventDefault(); dialog?.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!dialog?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action="change-board-color"]')) { event.preventDefault(); handleAction('change-board-color', event.target); return; }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.card[data-action="open-card"]')) { event.preventDefault(); openCard(event.target.dataset.id, event.target.dataset.list); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#search') && $('#search').focus(); }
  if (event.key === 'Escape' && modal) dismissModal();
  else if (event.key === 'Escape' && $('#sidebar')?.classList.contains('open')) { $('#sidebar').classList.remove('open'); $('[data-action="toggle-sidebar"]')?.setAttribute('aria-expanded', 'false'); $('[data-action="toggle-sidebar"]')?.focus(); }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && modal && modal.type === 'card' && document.activeElement === $('#comment-input')) {
    event.preventDefault();
    handleAction('add-comment', $('#comment-input'));
  }
  const typing = event.target && event.target.matches('input, textarea, select, [contenteditable="true"]');
  if (typing || event.metaKey || event.ctrlKey || event.altKey || modal) return;
  const key = event.key.toLowerCase();
  if (key === '?' ) { event.preventDefault(); modal = { type: 'shortcuts' }; return renderModal(); }
  if (key === '/') { event.preventDefault(); return $('#search') && $('#search').focus(); }
  if (key === 'n') { event.preventDefault(); return openCardCreateModal(); }
  if (key === 'l') return openInputModal({ heading: 'Add a list', label: 'List name', placeholder: 'e.g. Ready for review', submitLabel: 'Add list', onSubmit: title => { currentBoard().lists.push({ id: uid('list'), title, cards: [] }); persist(); renderBoardOnly(); } });
  if (key === 's') { event.preventDefault(); modal = { type: 'settings' }; return renderModal(); }
});
window.addEventListener('popstate', () => {
  if (!state.user) return;
  const routedBoard = state.boards.find(board => !board.archived && boardSlug(board) === routeBoardSlug());
  const fallback = state.boards.find(board => !board.archived && board.id === rememberedBoardId(state.user.id)) || firstActiveBoard();
  const selected = routedBoard || fallback;
  if (selected) {
    state.boardId = selected.id;
    state.view = 'board';
    rememberBoard(selected);
  } else {
    state.boardId = null;
    state.view = 'home';
  }
  renderApp();
});
function renderPublicError(message) {
  $('#app').innerHTML = '<div class="public-error"><div><span class="brand-mark"><span></span><span></span></span><h1>Public board unavailable</h1><p>' + esc(message) + '</p><a class="primary-btn" href="' + esc(workspaceUrl()) + '">Open Boardy</a></div></div>';
}
async function bootPublicBoard(token) {
  try {
    const result = await api('/api/public-board/' + encodeURIComponent(token));
    renderPublicBoard(result.board);
  } catch (error) { renderPublicError(error.message || 'This link may have been disabled or copied incorrectly.'); }
}
async function bootInvitation(token) {
  try {
    pendingInvitationToken = token;
    pendingInvitation = (await api('/api/invitations/' + encodeURIComponent(token))).invitation;
    const session = await api('/api/session');
    if (session.user) await finishAuthentication(session);
    else renderAuth('login', '', pendingInvitation);
  } catch (error) { renderAuth('login', error.message); }
}
(async function boot() {
  const token = publicShareToken();
  if (token) return bootPublicBoard(token);
  const invite = invitationToken();
  if (invite) return bootInvitation(invite);
  try { const result = await api('/api/session'); if (result.user) applySession(result); else renderAuth(); } catch (error) { renderAuth('login', error.message); }
})();
