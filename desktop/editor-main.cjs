const { app, BrowserWindow, Menu, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { exportFolder } = require('./export-folder.cjs');
const { atomicWrite, readProject, validateProjectText } = require('./storage.cjs');
const { registerBoard } = require('./board/ipc.cjs');
const { registerNativePlaytest } = require('./playtest/ipc.cjs');
const { installInputDevices } = require('./input-devices.cjs');
const { referenceUrl } = require('./reference-links.cjs');
const { startServer } = require('./automation/session.cjs');
app.setName('LVGL Game Engine 2D');

if (process.env.LGE_PROFILE_DIR) app.setPath('userData', path.resolve(process.env.LGE_PROFILE_DIR));
let inputDevices;
handle('desktop:input-device-select', (kind, id) => inputDevices?.select(kind, id) ?? false);
let window,
  documentPath = null,
  dirty = false,
  rendererReady = false;
let quitting = false;
let closing = false,
  closeApproved = false,
  exportParent = null,
  lastExport = null;
let recent = [],
  pending = new Map(),
  writeQueue = Promise.resolve();
const settingsFile = () => path.join(app.getPath('userData'), 'preferences.json');
const recoveryFile = () => path.join(app.getPath('userData'), 'recovery.json');
let queuedAction = null,
  queuedOpenPath = null;
let agentServer;
const agentPending = new Map();
async function dispatchAgent(method, params) {
  if (!rendererReady || !window || window.isDestroyed())
    throw Object.assign(new Error('Editor window is not ready.'), { code: 'UNAVAILABLE' });
  if (method === 'apply' && (nativePlaytest.session || boardService.phase === 'flashing'))
    throw Object.assign(new Error('Stop native playback or wait for flashing before editing.'), {
      code: 'CONFLICT',
    });
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      agentPending.delete(id);
      reject(
        Object.assign(new Error('Editor did not respond within 25 seconds.'), {
          code: 'UNAVAILABLE',
        }),
      );
    }, 25000);
    agentPending.set(id, { resolve, reject, timer });
    window.webContents.send('desktop:agent-request', { id, method, params });
  });
}
handle('desktop:agent-response', (reply) => {
  const pending = agentPending.get(reply?.id);
  if (!pending) return false;
  clearTimeout(pending.timer);
  agentPending.delete(reply.id);
  if (reply.ok) pending.resolve(reply.data);
  else
    pending.reject(
      Object.assign(new Error(reply.error?.message || 'Editor request failed.'), reply.error),
    );
  return true;
});
function publishAgent() {
  void agentServer
    ?.publish()
    .catch((error) => console.error('Automation metadata:', error.message));
}
function action(type, extra = {}) {
  const message = { type, ...extra };
  if (!window || window.isDestroyed() || !rendererReady) {
    queuedAction = message;
    if (app.isReady() && (!window || window.isDestroyed())) void createWindow();
    return;
  }
  window.webContents.send('desktop:action', message);
}
async function preferences() {
  await atomicWrite(settingsFile(), JSON.stringify({ recent, exportParent }));
}
async function remember(file) {
  recent = [file, ...recent.filter((p) => p !== file)].slice(0, 8);
  await preferences();
  buildMenu();
}
function trusted(event) {
  const url = event.senderFrame?.url;
  if (
    !window ||
    event.sender !== window.webContents ||
    url !== pathToFileURL(path.join(__dirname, '../dist/index.html')).href
  )
    throw new Error('Untrusted application request.');
}
function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    trusted(event);
    return callback(...args);
  });
}
async function pickOpen(file) {
  if (!file) {
    const picked = await dialog.showOpenDialog(window, {
      title: 'Open game project',
      properties: ['openFile'],
      filters: [{ name: 'LVGL Game Project', extensions: ['json'] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;
    file = picked.filePaths[0];
  }
  const text = await readProject(file),
    ticket = randomUUID();
  pending.clear();
  pending.set(ticket, { file, text });
  return { text, ticket, path: file };
}
async function save(text, saveAs) {
  const project = validateProjectText(text);
  let file = documentPath;
  if (!file || saveAs) {
    const suggested = project.name.replace(/[^a-z0-9 _-]/gi, '').trim() || 'Untitled game';
    const picked = await dialog.showSaveDialog(window, {
      title: 'Save game project',
      defaultPath: file || path.join(app.getPath('documents'), `${suggested}.lge.json`),
      filters: [{ name: 'LVGL Game Project', extensions: ['lge.json'] }],
    });
    if (picked.canceled || !picked.filePath) return null;
    file = picked.filePath.endsWith('.lge.json') ? picked.filePath : picked.filePath + '.lge.json';
  }
  await atomicWrite(file, text);
  documentPath = file;
  publishAgent();
  dirty = false;
  window.setRepresentedFilename(file);
  window.setDocumentEdited(false);
  await remember(file);
  await storeRecovery(text, file, false);
  return { path: file, name: path.basename(file) };
}
async function confirmDiscard(text) {
  if (!dirty) return { proceed: true };
  const response = await dialog.showMessageBox(window, {
    type: 'question',
    title: 'Save your changes?',
    message: 'Save changes before continuing?',
    detail:
      'Your recovery copy is kept, but saving a project file makes these changes available to reopen and share.',
    buttons: ['Save', 'Discard Changes', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  if (response.response === 2) return { proceed: false };
  if (response.response === 0) {
    const result = await save(text, false);
    return { proceed: !!result, saved: result };
  }
  return { proceed: true };
}
function buildMenu() {
  const fileMenu = [
    { label: 'New Project…', accelerator: 'CmdOrCtrl+N', click: () => action('new') },
    { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => action('open') },
    {
      label: 'Open Recent',
      submenu: recent.length
        ? recent.map((file, index) => ({
            label: path.basename(file),
            sublabel: file,
            click: () => action('open-recent', { index }),
          }))
        : [{ label: 'No recent projects', enabled: false }],
    },
    { type: 'separator' },
    { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => action('save') },
    { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => action('save-as') },
    { type: 'separator' },
    { label: 'Export LVGL ui Folder…', accelerator: 'CmdOrCtrl+E', click: () => action('export') },
    { type: 'separator' },
    { role: 'close' },
  ];
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: app.name,
              submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
              ],
            },
          ]
        : []),
      { label: 'File', submenu: fileMenu },
      {
        label: 'Edit',
        submenu: [
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => action('undo') },
          { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => action('redo') },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { label: 'Design', accelerator: 'CmdOrCtrl+1', click: () => action('design') },
          { label: 'Code', accelerator: 'CmdOrCtrl+2', click: () => action('code') },
          { label: 'Audio', accelerator: 'CmdOrCtrl+3', click: () => action('audio') },
          { label: 'Game flow', accelerator: 'CmdOrCtrl+4', click: () => action('flow') },
          { label: 'Native LVGL Playtest', accelerator: 'F6', click: () => action('native-play') },
          { label: 'Target guidance…', click: () => action('target-guidance') },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
        ],
      },
      { role: 'windowMenu' },
      {
        label: 'Help',
        submenu: [
          { label: 'Quick Start', click: () => action('help') },
          { label: 'Coding API', click: () => action('api') },
        ],
      },
    ]),
  );
}
function storeRecovery(text, file, unsaved) {
  const contents = JSON.stringify({
    text,
    path: file,
    dirty: !!unsaved,
    updated: new Date().toISOString(),
  });
  const write = writeQueue.catch(() => {}).then(() => atomicWrite(recoveryFile(), contents));
  writeQueue = write;
  return write;
}
handle('desktop:open-reference', async (url) => {
  await shell.openExternal(referenceUrl(url));
  return true;
});
handle('desktop:copy-text', (text) => {
  if (typeof text !== 'string' || text.length > 200000)
    throw new Error('Invalid clipboard content.');
  clipboard.writeText(text);
  return true;
});
handle('desktop:bootstrap', async () => {
  rendererReady = true;
  let recovery = null;
  try {
    recovery = JSON.parse(await fs.readFile(recoveryFile(), 'utf8'));
    validateProjectText(recovery.text);
  } catch {
    recovery = null;
  }
  if (recovery) {
    documentPath = typeof recovery.path === 'string' ? recovery.path : null;
    dirty = !!recovery.dirty;
    if (documentPath) {
      try {
        await fs.access(documentPath);
      } catch {
        documentPath = null;
        dirty = true;
      }
    }
    if (documentPath && !dirty) {
      try {
        recovery.text = await readProject(documentPath);
      } catch {
        dirty = true;
      }
    }
    recovery.dirty = dirty;
    if (documentPath) window.setRepresentedFilename(documentPath);
  }
  const initialAction = queuedAction;
  queuedAction = null;
  return {
    initialAction,
    platform: process.platform,
    version: app.getVersion(),
    recovery,
    documentPath,
    recent: recent.map((file, index) => ({ index, name: path.basename(file), path: file })),
    exportFolder: exportParent ? path.join(exportParent, 'ui') : null,
  };
});
handle('desktop:open-project', () => pickOpen());
handle('desktop:open-pending', () => {
  const file = queuedOpenPath;
  queuedOpenPath = null;
  return file ? pickOpen(file) : null;
});
handle('desktop:open-recent', (index) => {
  if (!Number.isInteger(index) || !recent[index]) throw new Error('Recent project is unavailable.');
  return pickOpen(recent[index]);
});
handle('desktop:accept-project', async (ticket) => {
  const choice = pending.get(ticket);
  if (!choice) throw new Error('Project selection has expired.');
  pending.clear();
  documentPath = choice.file;
  publishAgent();
  dirty = false;
  window.setRepresentedFilename(choice.file);
  await remember(choice.file);
  await storeRecovery(choice.text, choice.file, false);
  return { path: choice.file };
});
handle('desktop:save-project', save);
handle('desktop:confirm-discard', confirmDiscard);
handle('desktop:new-document', () => {
  documentPath = null;
  publishAgent();
  dirty = true;
  window.setRepresentedFilename('');
  return true;
});
handle('desktop:document-state', (state) => {
  if (
    !state ||
    typeof state.name !== 'string' ||
    state.name.length > 128 ||
    typeof state.dirty !== 'boolean'
  )
    throw new Error('Invalid document state.');
  dirty = state.dirty;
  publishAgent();
  window.setDocumentEdited(dirty);
  window.setTitle(`${state.name}${dirty ? ' •' : ''} — LVGL Game Engine 2D`);
  return true;
});
handle('desktop:save-recovery', (text, unsaved) => {
  validateProjectText(text);
  return storeRecovery(text, documentPath, unsaved).then(() => true);
});
handle('desktop:choose-export-folder', async () => {
  const picked = await dialog.showOpenDialog(window, {
    title: 'Choose your firmware project folder',
    message: 'A ui folder will be created inside this folder.',
    defaultPath: exportParent || app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || !picked.filePaths[0]) return null;
  exportParent = picked.filePaths[0];
  await preferences();
  return path.join(exportParent, 'ui');
});
handle('desktop:export-ui', async (entries, id, replaceModified) => {
  if (!exportParent) throw new Error('Choose an export folder first.');
  const result = await exportFolder(exportParent, entries, id, {
    replaceModified: replaceModified === true,
  });
  if (result.ok) lastExport = result.path;
  return result;
});
handle('desktop:save-archive', async (bytes, name) => {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 100 * 1024 * 1024 ||
    typeof name !== 'string' ||
    !/^[a-z0-9_.-]+\.zip$/i.test(name)
  )
    throw new Error('Invalid archive.');
  const picked = await dialog.showSaveDialog(window, {
    title: 'Save LVGL package',
    defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
  });
  if (picked.canceled || !picked.filePath) return null;
  await atomicWrite(picked.filePath, bytes);
  lastExport = picked.filePath;
  return picked.filePath;
});
handle('desktop:reveal-export', () => {
  if (lastExport) shell.showItemInFolder(lastExport);
});
handle('desktop:close-response', async (approved) => {
  closing = false;
  if (approved === true) {
    await writeQueue.catch(() => {});
    closeApproved = true;
    if (quitting) app.quit();
    else window.close();
  } else quitting = false;
});

const boardService = registerBoard({ app, handle, getWindow: () => window });
const nativePlaytest = registerNativePlaytest({ app, handle, getWindow: () => window });

// A flash preflight can precede assignment of the subprocess task. Wait on the
// actual phase instead of an older already-resolved build promise.
let boardClosePending = false,
  boardQuitPending = false;
async function finishBoardFlash() {
  while (boardService.phase === 'flashing')
    await new Promise((resolve) => setTimeout(resolve, 100));
}

async function createWindow() {
  closeApproved = false;
  rendererReady = false;
  window = new BrowserWindow({
    width: 1520,
    height: 1000,
    minWidth: 1050,
    minHeight: 720,
    show: false,
    backgroundColor: '#242528',
    title: 'LVGL Game Engine 2D',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 13, y: 10 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  inputDevices = installInputDevices({ window });
  window.webContents.session.webRequest.onBeforeRequest((details, callback) =>
    callback({
      cancel:
        !details.url.startsWith('file:') &&
        !details.url.startsWith('data:') &&
        !details.url.startsWith('blob:') &&
        !details.url.startsWith('devtools:'),
    }),
  );
  window.on('close', (event) => {
    if (boardService.phase === 'flashing') {
      event.preventDefault();
      if (!boardClosePending) {
        boardClosePending = true;
        void finishBoardFlash().then(() => {
          boardClosePending = false;
          if (window && !window.isDestroyed()) window.close();
        });
      }
      return;
    }
    if (closeApproved || !rendererReady || !dirty) return;
    event.preventDefault();
    if (!closing) {
      closing = true;
      action('close');
    }
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.on('render-process-gone', () => void nativePlaytest.stop());
  window.on('closed', () => {
    void nativePlaytest.stop();
    rendererReady = false;
  });
  await window.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(async () => {
  try {
    const settings = JSON.parse(await fs.readFile(settingsFile(), 'utf8'));
    recent = Array.isArray(settings.recent)
      ? settings.recent.filter((v) => typeof v === 'string').slice(0, 8)
      : [];
    exportParent = typeof settings.exportParent === 'string' ? settings.exportParent : null;
  } catch {}
  buildMenu();
  agentServer = await startServer({
    profile: app.getPath('userData'),
    metadata: () => ({
      projectPath: documentPath,
      dirty,
      ready: rendererReady,
      version: app.getVersion(),
    }),
    dispatch: dispatchAgent,
  });
  await createWindow();
  publishAgent();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  void agentServer?.close();
});

app.on('before-quit', (event) => {
  if (boardService.phase === 'flashing') {
    event.preventDefault();
    if (!boardQuitPending) {
      boardQuitPending = true;
      void finishBoardFlash().then(() => {
        boardQuitPending = false;
        app.quit();
      });
    }
    return;
  }
  quitting = true;
});

app.on('open-file', (event, file) => {
  event.preventDefault();
  queuedOpenPath = file;
  action('open-file');
});
