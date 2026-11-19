const webext = globalThis.browser || globalThis.chrome;
const isFirefox = /Firefox\//.test(navigator.userAgent);
const $ = selector => document.querySelector(selector);

const connectForm = $('#connect-form');
const cardForm = $('#card-form');
const rootInput = $('#boardy-url');
const boardSelect = $('#board-select');
const listSelect = $('#list-select');
const message = $('#message');
const statusBadge = $('#statusBadge');
const pageTitleEl = $('#pageTitle');
const domainLabel = $('#domainLabel');
const faviconImg = $('#faviconImg');
const coverImg = $('#coverImg');
const addButton = $('#add-button');
const toggleSettings = $('#toggleSettings');
const settingsPanel = $('#settingsPanel');
const openBoardyBtn = $('#open-boardy');

let activeTab = null;
let pageUrl = '';
let pageTitle = '';
let appRoot = '';
let workspace = null;

function call(api, method, ...args) {
  if (isFirefox) return api[method](...args);
  return new Promise((resolve, reject) => {
    api[method](...args, result => {
      const error = webext.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

function setStatus(text, type = '') {
  statusBadge.textContent = text;
  statusBadge.className = 'status-badge' + (type ? ` ${type}` : '');
}

function showMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle('success', success);
  message.hidden = false;
}

function hideMessage() {
  message.hidden = true;
  message.textContent = '';
  message.classList.remove('success');
}

function normalizeRoot(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Enter a valid http or https Boardy address.');
  }
  parsed.search = '';
  parsed.hash = '';
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed.toString();
}

function apiUrl(path) { return `${appRoot}api/${path}`; }

function getYouTubeThumbnail(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;
    } else if (parsed.hostname === 'youtu.be') {
      const v = parsed.pathname.slice(1);
      if (v) return `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;
    }
  } catch {}
  return null;
}

async function waitForTab(tabId) {
  const tab = await call(webext.tabs, 'get', tabId);
  if (tab.status === 'complete') return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      webext.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Boardy took too long to open.'));
    }, 20_000);
    function onUpdated(changedId, info) {
      if (changedId === tabId && info.status === 'complete') {
        clearTimeout(timer);
        webext.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }
    webext.tabs.onUpdated.addListener(onUpdated);
  });
}

async function withBoardyPage(operation) {
  const allTabs = await call(webext.tabs, 'query', {});
  const root = new URL(appRoot);
  const existing = allTabs.find(tab => {
    try {
      const candidate = new URL(tab.url);
      return candidate.origin === root.origin && candidate.pathname.startsWith(root.pathname);
    } catch { return false; }
  });
  let tab = existing;
  let created = false;
  if (!tab) {
    tab = await call(webext.tabs, 'create', { url: appRoot, active: false });
    created = true;
  }
  try {
    await waitForTab(tab.id);
    const injections = await call(webext.scripting, 'executeScript', {
      target: { tabId: tab.id },
      func: async request => {
        const response = await fetch(request.endpoint, {
          method: request.method,
          credentials: 'same-origin',
          headers: request.payload ? { 'content-type': 'application/json' } : {},
          body: request.payload ? JSON.stringify(request.payload) : undefined
        });
        let result = {};
        try { result = await response.json(); } catch {}
        return { status: response.status, body: result };
      },
      args: [operation]
    });
    return injections?.[0]?.result || injections?.[0];
  } finally {
    if (created) await call(webext.tabs, 'remove', tab.id).catch(() => {});
  }
}

function setBoardOptions(boards, previousBoard, previousList) {
  boardSelect.replaceChildren();
  const writable = boards.filter(board => !board.archived && board.accessRole !== 'viewer');
  for (const board of writable) {
    const option = document.createElement('option');
    option.value = board.id;
    option.textContent = `${board.title || 'Untitled board'}${board.accessRole && board.accessRole !== 'owner' ? ' · Shared' : ''}`;
    boardSelect.append(option);
  }
  if (!writable.length) throw new Error('There are no writable boards available. Ask a board owner for editor access.');
  if (writable.some(board => board.id === previousBoard)) boardSelect.value = previousBoard;
  updateLists(previousList);
}

function updateLists(preferredList = '') {
  const board = workspace?.data?.boards?.find(item => item.id === boardSelect.value);
  listSelect.replaceChildren();
  for (const list of board?.lists || []) {
    const option = document.createElement('option');
    option.value = list.id;
    option.textContent = list.title || 'Untitled column';
    listSelect.append(option);
  }
  if (board?.lists?.some(list => list.id === preferredList)) listSelect.value = preferredList;
  listSelect.disabled = !listSelect.options.length;
}

async function loadWorkspace(previousBoard = '', previousList = '') {
  setStatus('Checking...');
  const response = await withBoardyPage({ endpoint: apiUrl('session'), method: 'GET' });
  if (response?.status !== 200) throw new Error(response?.body?.error || 'Could not connect to Boardy.');
  if (!response.body?.user) {
    settingsPanel.style.display = 'block';
    cardForm.hidden = true;
    addButton.hidden = true;
    openBoardyBtn.hidden = false;
    setStatus('Sign in needed', 'error');
    showMessage('Sign in to Boardy in your browser, then open this extension again. The extension never handles your password.');
    return;
  }
  workspace = response.body;
  const boards = workspace.data?.boards || [];
  setBoardOptions(boards, previousBoard, previousList);
  settingsPanel.style.display = 'none';
  cardForm.hidden = false;
  addButton.hidden = false;
  addButton.disabled = false;
  openBoardyBtn.hidden = true;
  setStatus('Connected', 'connected');
  hideMessage();
}

async function init() {
  try {
    const tabs = await call(webext.tabs, 'query', { active: true, currentWindow: true });
    activeTab = tabs[0] || null;
    pageUrl = activeTab?.url || '';
    pageTitle = activeTab?.title || '';

    // Populate tab preview
    pageTitleEl.textContent = pageTitle || 'Current browser page';
    try {
      const parsed = new URL(pageUrl);
      domainLabel.textContent = parsed.hostname;
    } catch {
      domainLabel.textContent = 'browser';
    }

    if (activeTab?.favIconUrl) {
      faviconImg.src = activeTab.favIconUrl;
      faviconImg.style.display = 'inline-block';
    } else {
      faviconImg.style.display = 'none';
    }

    const ytThumb = getYouTubeThumbnail(pageUrl);
    if (ytThumb) {
      coverImg.src = ytThumb;
      coverImg.style.display = 'block';
    } else {
      coverImg.style.display = 'none';
    }

    if (!/^https?:\/\//i.test(pageUrl)) {
      setStatus('Invalid URL', 'error');
      showMessage('This page does not have a web URL. Switch to an http or https page to add it to a card.');
      settingsPanel.style.display = 'none';
      cardForm.hidden = true;
      addButton.hidden = true;
      return;
    }

    $('#card-title').value = pageTitle.slice(0, 300);

    const saved = await call(webext.storage.local, 'get', ['boardyRoot', 'lastBoardId', 'lastListId']);
    if (saved.boardyRoot) {
      appRoot = normalizeRoot(saved.boardyRoot);
      rootInput.value = appRoot;
      try {
        await loadWorkspace(saved.lastBoardId, saved.lastListId);
      } catch (error) {
        settingsPanel.style.display = 'block';
        cardForm.hidden = true;
        addButton.hidden = true;
        openBoardyBtn.hidden = false;
        setStatus('Not connected', 'error');
        showMessage(error.message);
      }
    } else {
      settingsPanel.style.display = 'block';
      cardForm.hidden = true;
      addButton.hidden = true;
      setStatus('Not connected');
    }
  } catch (error) {
    setStatus('Error', 'error');
    showMessage(error.message || 'Could not read the current page.');
  }
}

toggleSettings.addEventListener('click', () => {
  const isShown = settingsPanel.style.display === 'block';
  settingsPanel.style.display = isShown ? 'none' : 'block';
});

toggleSettings.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleSettings.click();
  }
});

connectForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    appRoot = normalizeRoot(rootInput.value.trim());
    const origin = new URL(appRoot).origin;
    const granted = await call(webext.permissions, 'request', { origins: [`${origin}/*`] });
    if (!granted) throw new Error('Boardy site access was not granted. You can allow it and try again.');
    await call(webext.storage.local, 'set', { boardyRoot: appRoot });
    await loadWorkspace();
  } catch (error) {
    setStatus('Error', 'error');
    showMessage(error.message || 'Could not connect to Boardy.');
  }
});

openBoardyBtn.addEventListener('click', async () => {
  try {
    appRoot = normalizeRoot(rootInput.value.trim());
    await call(webext.storage.local, 'set', { boardyRoot: appRoot });
    await call(webext.tabs, 'create', { url: appRoot, active: true });
  } catch (error) {
    showMessage(error.message || 'Enter your Boardy address first.');
  }
});

boardSelect.addEventListener('change', () => updateLists());

cardForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!pageUrl || !boardSelect.value || !listSelect.value) return;
  addButton.disabled = true;
  addButton.textContent = 'Adding…';
  try {
    const response = await withBoardyPage({
      endpoint: apiUrl('cards'),
      method: 'POST',
      payload: { boardId: boardSelect.value, listId: listSelect.value, title: $('#card-title').value.trim(), url: pageUrl }
    });
    if (response?.status !== 201) throw new Error(response?.body?.error || 'The card could not be added.');
    await call(webext.storage.local, 'set', { lastBoardId: boardSelect.value, lastListId: listSelect.value });
    setStatus('Saved ✓', 'saved');
    addButton.textContent = 'Added ✓';
    showMessage(`“${response.body.card.title}” was added to ${listSelect.options[listSelect.selectedIndex]?.textContent}.`, true);
    setTimeout(() => window.close(), 950);
  } catch (error) {
    setStatus('Error', 'error');
    showMessage(error.message || 'The card could not be added.');
    addButton.disabled = false;
    addButton.textContent = 'Add card';
  }
});

init();
