'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const SUPPORT_URL = 'https://buymeacoffee.com/NeoSixon';
const GITHUB_URL = 'https://github.com/NeoSixon/DLSS5-Before-Upscaling';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const gameScan = require('./core/game-scan');
const fileState = require('./core/file-state');
const runtime = require('./core/runtime');
const srRuntime = require('./core/sr-runtime');
const optiscaler = require('./core/optiscaler');
const nrSettings = require('./core/nr-settings');
const discovery = require('./core/discovery');

const PROFILE_BY_EXE = Object.freeze({
  'yysls.exe': Object.freeze({
    id: 'where-winds-meet',
    names: Object.freeze({ en: 'Where Winds Meet', 'zh-CN': '燕云十六声' }),
    api: 'dxgi',
    apiLabel: 'DirectX 12',
    bitness: 64,
    onlineRisk: true,
    bannerUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/3564740/library_hero.jpg',
    tileUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/3564740/header.jpg',
    coverUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/3564740/library_600x900.jpg'
  })
});

const STYLE_VALUES = new Set(['0', '1', '2']);
const DEFAULT_GAME_SETTINGS = Object.freeze({
  enabled: true,
  runBeforeSR: true,
  passes: 1,
  pass1Style: '0',
  pass2Style: '0',
  pass3Style: '0'
});

let win = null;
let liveState = null;
let discoveryPromise = null;
const iconCache = new Map();
const artworkCache = new Map();
const inspectionCache = new Map();
let folderSelection = null;
let folderSelectionGeneration = 0;

const stateFile = () => path.join(app.getPath('userData'), 'standalone-library.json');
const idFor = exePath => crypto.createHash('sha1').update(path.resolve(exePath).toLowerCase()).digest('hex').slice(0, 16);
const normalizedExePath = exePath => path.resolve(String(exePath)).toLowerCase();
const inferredLibraryName = (exePath, libraryDir) => {
  const exeStem = path.basename(String(exePath || ''), path.extname(String(exePath || '')));
  if (!libraryDir) return exeStem;
  let name = path.basename(path.resolve(String(libraryDir))).trim();
  name = name.replace(/\s+game$/i, '').trim();
  if (!name || /^(game|games|client|bin|bin64|binaries|win64|x64)$/i.test(name)) return exeStem;
  return name;
};
const settingsFor = value => {
  const next = { ...DEFAULT_GAME_SETTINGS, ...(value || {}) };
  const primary = STYLE_VALUES.has(String(next.pass1Style)) ? String(next.pass1Style) : '0';
  next.pass1Style = primary;
  next.pass2Style = STYLE_VALUES.has(String(next.pass2Style)) ? String(next.pass2Style) : primary;
  next.pass3Style = STYLE_VALUES.has(String(next.pass3Style)) ? String(next.pass3Style) : primary;
  return next;
};

function defaultState() {
  return { language: 'en', selectedGameId: null, games: [], ignoredPaths: [] };
}

function loadState() {
  if (liveState) return liveState;
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.games)) {
      liveState = { ...defaultState(), ...parsed };
      const legacyFolder = ['steam', 'grid', 'db'].join('');
      const legacyCache = path.join(app.getPath('userData'), 'artwork-cache', legacyFolder);
      const legacyIdKey = ['steam', 'Grid', 'Db', 'GameId'].join('');
      for (const record of liveState.games) {
        delete record[legacyIdKey];
        for (const key of ['coverPath', 'bannerPath', 'tilePath']) {
          if (record[key] && path.resolve(String(record[key])).toLowerCase().startsWith(path.resolve(legacyCache).toLowerCase() + path.sep)) {
            record[key] = null;
            record.localArtworkScanned = false;
          }
        }
      }
      try { fs.rmSync(path.join(app.getPath('userData'), ['steam', 'grid', 'db-key.bin'].join('')), { force: true }); } catch {}
      try { fs.rmSync(legacyCache, { recursive: true, force: true }); } catch {}
      for (const record of liveState.games) {
        const exeStem = path.basename(String(record?.exePath || ''), path.extname(String(record?.exePath || '')));
        if (!record.displayName || String(record.displayName).toLowerCase() === exeStem.toLowerCase()) {
          record.displayName = inferredLibraryName(record.exePath, record.libraryDir);
        }
      }
      liveState.ignoredPaths = Array.isArray(liveState.ignoredPaths)
        ? [...new Set(liveState.ignoredPaths.map(normalizedExePath))]
        : [];
      return liveState;
    }
  } catch {}
  liveState = defaultState();
  return liveState;
}

function saveState() {
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(loadState(), null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function profileFor(exePath) {
  return PROFILE_BY_EXE[path.basename(String(exePath || '')).toLowerCase()] || null;
}

function normalizeRecord(exePath, meta = {}) {
  const resolved = path.resolve(exePath);
  const profile = profileFor(resolved);
  return {
    id: idFor(resolved),
    dir: path.dirname(resolved),
    exePath: resolved,
    profileId: profile?.id || null,
    displayName: meta.displayName || inferredLibraryName(resolved, meta.libraryDir || path.dirname(resolved)),
    launcher: meta.launcher || 'Manual',
    storeId: meta.storeId || null,
    libraryDir: meta.libraryDir || path.dirname(resolved),
    bannerPath: meta.bannerPath || null,
    bannerUrl: meta.bannerUrl || null,
    tilePath: meta.tilePath || null,
    tileUrl: meta.tileUrl || null,
    coverPath: meta.coverPath || null,
    coverUrl: meta.coverUrl || null,
    favorite: Boolean(meta.favorite),
    hidden: Boolean(meta.hidden),
    localArtworkScanned: Boolean(meta.localArtworkScanned),
    settings: settingsFor(meta.settings)
  };
}

async function iconFor(exePath) {
  const key = path.resolve(exePath).toLowerCase();
  if (iconCache.has(key)) return iconCache.get(key);
  try {
    const image = await app.getFileIcon(exePath, { size: 'large' });
    const value = image && !image.isEmpty() ? image.toDataURL() : null;
    iconCache.set(key, value);
    return value;
  } catch {
    iconCache.set(key, null);
    return null;
  }
}

function localArtwork(file) {
  if (!file || !fs.existsSync(file)) return null;
  const key = path.resolve(file).toLowerCase();
  if (artworkCache.has(key)) return artworkCache.get(key);
  try {
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const value = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
    artworkCache.set(key, value);
    return value;
  } catch {
    artworkCache.set(key, null);
    return null;
  }
}

function bannerFor(record) {
  const profile = profileFor(record.exePath);
  return localArtwork(record.bannerPath) || record.bannerUrl || profile?.bannerUrl || null;
}

function tileFor(record) {
  const profile = profileFor(record.exePath);
  return localArtwork(record.tilePath) || record.tileUrl || profile?.tileUrl || null;
}

function coverFor(record) {
  const profile = profileFor(record.exePath);
  return localArtwork(record.coverPath) || record.coverUrl || profile?.coverUrl || null;
}

function enrichLocalArtwork(record, force = false) {
  if (!record || record.launcher === 'Steam') return false;
  if (record.localArtworkScanned && !force) return false;
  const found = typeof discovery.localArtworkFor === 'function'
    ? discovery.localArtworkFor(record.libraryDir || path.dirname(record.exePath))
    : { coverPath: null, bannerPath: null, tilePath: null };
  let changed = false;
  for (const key of ['coverPath', 'bannerPath', 'tilePath']) {
    if (found[key] && (!record[key] || force)) { record[key] = found[key]; changed = true; }
  }
  if (!record.localArtworkScanned) changed = true;
  record.localArtworkScanned = true;
  if (changed) saveState();
  return changed;
}

function existingNrSetup(exePath, chosen) {
  if (!chosen) return false;
  const exeDir = path.dirname(exePath);
  const hook = chosen.api === 'vulkan' ? 'winmm.dll' : 'dxgi.dll';
  return [path.join(exeDir, hook), path.join(exeDir, 'OptiScaler.ini')]
    .every(file => fs.existsSync(file));
}

async function inspectRecord(record, refresh = false) {
  enrichLocalArtwork(record, refresh);
  const profile = profileFor(record.exePath);
  if (refresh) inspectionCache.delete(record.id);
  if (!inspectionCache.has(record.id)) {
    const pending = gameScan.inspect(record.exePath, profile, record.libraryDir);
    inspectionCache.set(record.id, pending);
    pending.catch(() => {
      if (inspectionCache.get(record.id) === pending) inspectionCache.delete(record.id);
    });
  }
  const result = await inspectionCache.get(record.id);
  const supportedApi = result.chosen && ['dxgi', 'vulkan'].includes(result.chosen.api);
  const route = result.route || null;
  const compatible = Boolean(result.chosen && result.chosen.bitness === 64 && supportedApi && route?.ready);
  const canInstall = Boolean(result.chosen && result.chosen.bitness === 64 && supportedApi && route?.installable);
  return {
    id: record.id,
    dir: record.dir,
    exePath: record.exePath,
    profileId: record.profileId,
    displayName: profile?.names?.[loadState().language] || record.displayName,
    launcher: record.launcher || 'Manual',
    storeId: record.storeId || null,
    favorite: Boolean(record.favorite),
    hidden: Boolean(record.hidden),
    settings: nrSettings.read(record.exePath, settingsFor(record.settings)),
    onlineRisk: Boolean(profile?.onlineRisk),
    chosen: result.chosen,
    dlss: result.dlss,
    upscalerInputs: result.upscalerInputs || [],
    route,
    compatible,
    canInstall,
    installed: Boolean(result.installed),
    existingSetup: existingNrSetup(record.exePath, result.chosen) && !result.hasBackup,
    hasBackup: Boolean(result.hasBackup),
    optiscaler: result.optiscaler,
    runtime: runtime.detect(app, record.exePath),
    iconDataUrl: await iconFor(record.exePath),
    bannerDataUrl: bannerFor(record),
    tileDataUrl: tileFor(record),
    coverDataUrl: coverFor(record)
  };
}

function cachedViewState() {
  const state = loadState();
  const games = state.games.map(record => {
    const profile = profileFor(record.exePath);
    return {
      ...record,
      settings: settingsFor(record.settings),
      onlineRisk: Boolean(profile?.onlineRisk),
      chosen: null,
      dlss: null,
      upscalerInputs: [],
      route: null,
      compatible: null,
      canInstall: null,
      installed: null,
      existingSetup: false,
      hasBackup: false,
      optiscaler: null,
      runtime: null,
      iconDataUrl: null,
      bannerDataUrl: bannerFor(record),
      tileDataUrl: tileFor(record),
      coverDataUrl: coverFor(record),
      cachedOnly: true
    };
  });
  return {
    language: state.language,
    selectedGameId: state.selectedGameId,
    runtimeCache: typeof runtime.detectCached === 'function' ? runtime.detectCached(app) : null,
    srRuntimeCache: typeof srRuntime.detectCached === 'function' ? srRuntime.detectCached(app) : null,
    games
  };
}

async function viewState({ refreshIds = [], refreshAll = false } = {}) {
  const state = loadState();
  const games = [];
  for (const record of state.games) {
    try { games.push(await inspectRecord(record, refreshAll || refreshIds.includes(record.id))); }
    catch (error) {
      games.push({
        ...record,
        settings: nrSettings.read(record.exePath, settingsFor(record.settings)),
        scanError: error.message || String(error),
        chosen: null,
        dlss: null,
        compatible: false,
        installed: false,
        existingSetup: false,
        hasBackup: fileState.hasBackup(record.dir),
        runtime: runtime.detect(app, record.exePath),
        iconDataUrl: await iconFor(record.exePath),
        bannerDataUrl: bannerFor(record),
        tileDataUrl: tileFor(record),
        coverDataUrl: coverFor(record)
      });
    }
  }
  if (!games.some(game => game.id === state.selectedGameId)) {
    state.selectedGameId = games.find(game => !game.hidden)?.id || null;
    saveState();
  }
  return {
    language: state.language,
    selectedGameId: state.selectedGameId,
    runtimeCache: typeof runtime.detectCached === 'function' ? runtime.detectCached(app) : null,
    srRuntimeCache: typeof srRuntime.detectCached === 'function' ? srRuntime.detectCached(app) : null,
    games
  };
}

async function discoverAndMerge(refreshAll = false) {
  const found = await discovery.discoverGames();
  const state = loadState();
  let added = 0;
  for (const game of found) {
    const candidate = normalizeRecord(game.exePath, game);
    if (state.ignoredPaths.includes(normalizedExePath(candidate.exePath))) continue;
    const existing = state.games.find(record => normalizedExePath(record.exePath) === normalizedExePath(candidate.exePath));
    if (existing) {
      existing.displayName = game.displayName || existing.displayName;
      existing.launcher = game.launcher || existing.launcher;
      existing.storeId = game.storeId || existing.storeId;
      existing.libraryDir = game.libraryDir || existing.libraryDir;
      existing.bannerPath = game.bannerPath || existing.bannerPath;
      existing.bannerUrl = game.bannerUrl || existing.bannerUrl;
      existing.tilePath = game.tilePath || existing.tilePath;
      existing.tileUrl = game.tileUrl || existing.tileUrl;
      existing.coverPath = game.coverPath || existing.coverPath;
      existing.coverUrl = game.coverUrl || existing.coverUrl;
      if (typeof game.localArtworkScanned === 'boolean') existing.localArtworkScanned = game.localArtworkScanned;
      continue;
    }
    state.games.push(candidate);
    added += 1;
  }
  if (!state.selectedGameId) state.selectedGameId = state.games.find(game => !game.hidden)?.id || null;
  saveState();
  return { added, state: await viewState({ refreshAll }) };
}

async function ensureAutoDiscovery() {
  if (!discoveryPromise) discoveryPromise = discoverAndMerge().catch(() => ({ added: 0 }));
  await discoveryPromise;
}

function recordFor(id) {
  return loadState().games.find(game => game.id === id) || null;
}

function safeResult(work) {
  return Promise.resolve().then(work).then(value => ({ ok: true, value }))
    .catch(error => ({ ok: false, code: error.code || 'error', message: error.message || String(error) }));
}

async function confirmOnlineRisk(record) {
  const profile = profileFor(record.exePath);
  if (!profile?.onlineRisk) return true;
  const zh = loadState().language === 'zh-CN';
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: zh ? '在线游戏提示' : 'Online game notice',
    message: zh
      ? '该游戏包含在线功能。注入式图形模组可能导致崩溃或触发反作弊风险。此应用不会绕过或关闭反作弊。'
      : 'This game includes online functionality. Injection-based graphics mods can crash or trigger anti-cheat risk. This app does not bypass or disable anti-cheat.',
    detail: zh ? '仅在你理解风险并愿意继续时安装。' : 'Install only if you understand the risk and want to continue.',
    buttons: zh ? ['取消', '继续'] : ['Cancel', 'Continue'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  return result.response === 1;
}

async function confirmExistingMigration() {
  const zh = loadState().language === 'zh-CN';
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: zh ? '检测到现有 OptiScaler 安装' : 'Existing OptiScaler setup detected',
    message: zh
      ? '可以把现有安装迁移到本应用的 DLSS 5 后端。将被替换的文件会先备份，可通过“恢复原文件”还原。'
      : 'The existing setup can be migrated to this app’s DLSS 5 backend. Files that are replaced will be backed up first and can be restored with Restore original.',
    detail: zh
      ? '这不会绕过或关闭任何反作弊功能。请先退出游戏再继续。'
      : 'This does not bypass or disable anti-cheat. Close the game before continuing.',
    buttons: zh ? ['取消', '迁移并安装'] : ['Cancel', 'Migrate and install'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  return result.response === 1;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    show: false,
    icon: path.join(__dirname, 'renderer', 'app-icon.png'),
    backgroundColor: '#0b1117',
    ...(process.platform === 'win32' ? { backgroundMaterial: 'mica' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
}

ipcMain.handle('app:get-cached-state', () => safeResult(async () => cachedViewState()));
ipcMain.handle('app:get-state', () => safeResult(async () => {
  await ensureAutoDiscovery();
  return viewState({ refreshIds: [loadState().selectedGameId] });
}));
ipcMain.handle('app:set-language', (_event, language) => safeResult(async () => {
  if (!['en', 'zh-CN'].includes(language)) throw new Error('Unsupported language');
  loadState().language = language;
  saveState();
  return viewState();
}));
ipcMain.handle('games:rescan', () => safeResult(async () => {
  discoveryPromise = discoverAndMerge(true);
  return discoveryPromise;
}));
function addExecutable(exePath, meta = {}) {
  if (!/\.exe$/i.test(exePath) || !fs.statSync(exePath).isFile()) throw new Error('Choose a valid game executable.');
  const local = typeof discovery.localArtworkFor === 'function'
    ? discovery.localArtworkFor(meta.libraryDir || path.dirname(exePath))
    : { coverPath: null, bannerPath: null, tilePath: null };
  const record = normalizeRecord(exePath, { ...local, ...meta, localArtworkScanned: true });
  const state = loadState();
  const normalizedPath = normalizedExePath(record.exePath);
  state.ignoredPaths = state.ignoredPaths.filter(item => item !== normalizedPath);
  const existing = state.games.find(game => game.id === record.id);
  // Re-adding restores visibility without discarding favorites, launcher IDs or backups.
  if (existing) existing.hidden = false;
  else state.games.push(record);
  state.selectedGameId = record.id;
  saveState();
  return viewState({ refreshIds: [record.id] });
}

ipcMain.handle('games:choose-folder', () => safeResult(async () => {
  const generation = ++folderSelectionGeneration;
  folderSelection = null;
  const picked = await dialog.showOpenDialog(win, {
    title: loadState().language === 'zh-CN' ? '选择游戏安装文件夹' : 'Choose the game installation folder',
    properties: ['openDirectory']
  });
  if (picked.canceled || !picked.filePaths[0]) return { cancelled: true };
  const root = path.resolve(picked.filePaths[0]);
  const result = await discovery.candidatesFor({ dir: root });
  if (generation !== folderSelectionGeneration) return { cancelled: true };
  const token = crypto.randomUUID();
  folderSelection = { token, root, candidates: result.candidates };
  return {
    token, root, truncated: result.truncated, maxDepth: result.maxDepth,
    candidates: result.candidates.map(({ path: _path, score: _score, ...item }, index) => ({ ...item, index }))
  };
}));
ipcMain.handle('games:add-candidate', (_event, token, index) => safeResult(async () => {
  const selection = folderSelection;
  if (!selection || token !== selection.token || !Number.isInteger(index) || !selection.candidates[index]) {
    throw new Error('This selection has expired. Choose the game folder again.');
  }
  folderSelection = null;
  return addExecutable(selection.candidates[index].path, { libraryDir: selection.root });
}));
ipcMain.handle('games:add', () => safeResult(async () => {
  folderSelectionGeneration += 1;
  folderSelection = null;
  const picked = await dialog.showOpenDialog(win, {
    title: loadState().language === 'zh-CN' ? '选择游戏主程序' : 'Choose the game executable',
    properties: ['openFile'],
    filters: [{ name: 'Windows executable', extensions: ['exe'] }]
  });
  if (picked.canceled || !picked.filePaths[0]) return { cancelled: true };
  return addExecutable(picked.filePaths[0]);
}));
ipcMain.handle('games:select', (_event, id) => safeResult(async () => {
  if (!recordFor(id)) throw new Error('Unknown game');
  loadState().selectedGameId = id;
  saveState();
  return viewState({ refreshIds: [id] });
}));
function setHidden(id, hidden) {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  record.hidden = Boolean(hidden);
  const state = loadState();
  if (record.hidden && state.selectedGameId === id) state.selectedGameId = state.games.find(game => !game.hidden)?.id || null;
  saveState();
  return viewState();
}
function removeFromLibrary(id) {
  const state = loadState();
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  state.games = state.games.filter(game => game.id !== id);
  state.ignoredPaths = [...new Set([...state.ignoredPaths, normalizedExePath(record.exePath)])];
  inspectionCache.delete(id);
  if (state.selectedGameId === id) state.selectedGameId = state.games.find(game => !game.hidden)?.id || null;
  saveState();
  return viewState();
}
// Remove only the library entry. The executable and every game-side file stay untouched.
ipcMain.handle('games:remove', (_event, id) => safeResult(() => removeFromLibrary(id)));
ipcMain.handle('games:set-hidden', (_event, id, hidden) => safeResult(() => setHidden(id, hidden)));
ipcMain.handle('games:set-favorite', (_event, id, favorite) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  record.favorite = Boolean(favorite);
  saveState();
  return viewState();
}));
ipcMain.handle('games:context-menu', (_event, id) => safeResult(() => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  const zh = loadState().language === 'zh-CN';
  return new Promise(resolve => {
    const item = (label, action) => ({ label, click: () => resolve(action) });
    Menu.buildFromTemplate([
      item(zh ? '开始游戏' : 'Play', 'launch'),
      item(record.favorite ? (zh ? '取消收藏' : 'Remove from favorites') : (zh ? '添加至收藏夹' : 'Add to favorites'), 'favorite'),
      item(zh ? '浏览本地文件' : 'Browse local files', 'folder'),
      { type: 'separator' },
      item(record.hidden ? (zh ? '取消隐藏' : 'Unhide') : (zh ? '隐藏（不删除游戏文件）' : 'Hide (keep game files)'), 'hidden'),
      item(zh ? '从游戏库移除（保留游戏文件）' : 'Remove from library (keep game files)', 'remove')
    ]).popup({ window: win, callback: () => resolve(null) });
  });
}));
ipcMain.handle('game:open-folder', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  const error = await shell.openPath(path.dirname(record.exePath));
  if (error) throw new Error(error);
  return true;
}));
ipcMain.handle('game:launch', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  if (record.launcher === 'Steam' && record.storeId) {
    await shell.openExternal(`steam://rungameid/${encodeURIComponent(String(record.storeId))}`);
    return true;
  }
  const result = await shell.openPath(record.exePath);
  if (result) throw new Error(result);
  return true;
}));
ipcMain.handle('game:set-settings', (_event, id, settings) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  const next = nrSettings.read(record.exePath, settingsFor(record.settings));
  if (Object.prototype.hasOwnProperty.call(settings || {}, 'enabled')) next.enabled = Boolean(settings.enabled);
  if (Object.prototype.hasOwnProperty.call(settings || {}, 'runBeforeSR')) next.runBeforeSR = Boolean(settings.runBeforeSR);
  if (Object.prototype.hasOwnProperty.call(settings || {}, 'passes')) {
    const passes = Number(settings.passes);
    if (!Number.isInteger(passes) || passes < 1 || passes > 3) throw new Error('Passes must be 1, 2, or 3');
    next.passes = passes;
  }
  for (const key of ['pass1Style', 'pass2Style', 'pass3Style']) {
    if (!Object.prototype.hasOwnProperty.call(settings || {}, key)) continue;
    const value = String(settings[key]).toLowerCase();
    if (!STYLE_VALUES.has(value)) throw new Error('Style must be Standard, Natural, or Cinematic');
    next[key] = value;
  }
  record.settings = next;
  saveState();
  nrSettings.apply(record.exePath, next);
  return viewState({ refreshIds: [id] });
}));
ipcMain.handle('runtime:import', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  await runtime.pickAndCache(app, dialog, record.exePath, loadState().language);
  return viewState();
}));
ipcMain.handle('game:install', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  if (!(await confirmOnlineRisk(record))) return { cancelled: true, state: await viewState() };
  const inspected = await inspectRecord(record, true);
  if (!inspected.chosen) throw Object.assign(new Error('No supported game executable was detected.'), { code: 'noExecutable' });
  if (inspected.chosen.bitness !== 64) throw Object.assign(new Error('This Neural Rendering route requires a 64-bit game.'), { code: 'unsupportedArchitecture' });
  if (!inspected.chosen.api) throw Object.assign(new Error('The rendering API could not be detected.'), { code: 'noRenderingApi' });
  if (!inspected.canInstall) throw Object.assign(new Error('No usable native or temporal upscaler route was detected for this game.'), { code: 'noUpscalerRoute' });
  if (inspected.hasBackup) throw Object.assign(new Error('This game already has a managed installation. Restore originals before reinstalling.'), { code: 'alreadyInstalled' });

  let replaceExisting = false;
  if (inspected.existingSetup) {
    replaceExisting = await confirmExistingMigration();
    if (!replaceExisting) return { cancelled: true, state: await viewState() };
  }

  const currentState = loadState();
  const runtimePath = await runtime.resolve(app, dialog, record.exePath, currentState.language);
  const needsManagedSr = ['temporal-presr', 'auto-probe'].includes(inspected.route?.id);
  const srRuntimePath = needsManagedSr
    ? await srRuntime.resolve(app, dialog, currentState.games, record.exePath, currentState.language)
    : null;
  const packageRoot = await optiscaler.ensurePackage(app.getPath('userData'));
  const logs = [];
  await optiscaler.install({
    gameDir: record.dir,
    exePath: record.exePath,
    api: inspected.chosen.api,
    apiLabel: inspected.chosen.apiLabel,
    packageRoot,
    runtimePath,
    srRuntimePath,
    settings: settingsFor(record.settings),
    route: inspected.route,
    replaceExisting
  }, entry => logs.push(entry));
  nrSettings.apply(record.exePath, settingsFor(record.settings));
  nrSettings.applyOverlay(record.exePath, nrSettings.readOverlayPrefs(app.getPath('userData')));
  return { logs, migrated: replaceExisting, state: await viewState({ refreshIds: [id] }) };
}));
ipcMain.handle('game:restore', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  const logs = [];
  await fileState.restore(record.dir, entry => logs.push(entry));
  return { logs, state: await viewState({ refreshIds: [id] }) };
}));

ipcMain.handle('app:open-support', () => safeResult(async () => {
  await shell.openExternal(SUPPORT_URL);
  return true;
}));
ipcMain.handle('app:open-github', () => safeResult(async () => {
  await shell.openExternal(GITHUB_URL);
  return true;
}));

ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('window:close', () => win?.close());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
