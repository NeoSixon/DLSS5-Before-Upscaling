'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { createRequire } = require('module');

const mainPath = path.resolve(__dirname, '../standalone/main.js');
const source = fs.readFileSync(mainPath, 'utf8');

function harness(t, existingRoot) {
  const root = existingRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'nr-library-actions-'));
  if (!existingRoot) t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const exeA = path.join(root, 'game-a', 'GameA.exe');
  const exeB = path.join(root, 'game-b', 'GameB.exe');
  if (!existingRoot) {
    for (const file of [exeA, exeB]) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'fixture'); }
  }
  const handlers = new Map();
  const scans = [];
  const dialogs = [];
  let template = [];
  let chooseMenu = null;
  const discovered = [
    { exePath: exeA, displayName: 'Game A', launcher: 'Steam', storeId: '123' },
    { exePath: exeB, displayName: 'Game B', launcher: 'Manual' }
  ];
  const electron = {
    app: { getPath: () => root, getFileIcon: async () => null, whenReady: () => ({ then() {} }), on() {} },
    BrowserWindow: {}, ipcMain: { handle: (key, fn) => handlers.set(key, fn), on() {} },
    dialog: { showOpenDialog: async () => dialogs.shift() || { canceled: true, filePaths: [] } },
    shell: { openPath: async () => '', openExternal: async () => {} },
    Menu: { buildFromTemplate: items => {
      template = items;
      return { popup: ({ callback }) => { if (chooseMenu !== null) items[chooseMenu].click(); callback(); } };
    } }
  };
  const actualRequire = createRequire(mainPath);
  const mock = {
    electron,
    './core/game-scan': { inspect: async exePath => {
      scans.push(exePath);
      return { chosen: { path: exePath, bitness: 64, api: 'dxgi' }, dlss: { version: 'fixture' }, installed: false };
    } },
    './core/file-state': { hasBackup: () => false },
    './core/runtime': { detect: () => null },
    './core/optiscaler': {},
    './core/nr-settings': { read: (_file, settings) => settings },
    './core/discovery': {
      discoverGames: async () => discovered,
      candidatesFor: async () => ({ candidates: [{ path: exeB, name: 'GameB.exe', relativePath: 'game-b/GameB.exe', reasons: ['x64'], supported: true }], maxDepth: 8, truncated: false })
    }
  };
  vm.runInNewContext(source, { require: name => mock[name] || actualRequire(name), __dirname: path.dirname(mainPath), process, console });
  const call = async (key, ...args) => {
    const result = await handlers.get(key)(null, ...args);
    assert.equal(result.ok, true, result.message);
    return result.value;
  };
  return { root, exeA, exeB, scans, dialogs, electron, call, handlers, discovered,
    get menu() { return template; }, set menuIndex(value) { chooseMenu = value; } };
}

test('selecting a card refreshes only that game, not the entire library', async t => {
  const app = harness(t);
  const state = await app.call('app:get-state');
  const before = app.scans.length;
  const next = await app.call('games:select', state.games[1].id);
  assert.equal(next.selectedGameId, state.games[1].id);
  assert.deepEqual(app.scans.slice(before), [app.exeB]);
  await app.call('games:set-favorite', state.games[1].id, true);
  assert.equal(app.scans.length, before + 1, 'metadata-only actions do not rescan binaries');
});

test('hide and favorite survive rescan/restart and never touch game files or backups', async t => {
  const app = harness(t);
  const config = path.join(path.dirname(app.exeA), 'OptiScaler.ini');
  const backup = path.join(path.dirname(app.exeA), '_dlss5_backup', 'original.dll');
  fs.mkdirSync(path.dirname(backup));
  fs.writeFileSync(config, 'keep config byte-for-byte');
  fs.writeFileSync(backup, 'keep original backup');
  const state = await app.call('app:get-state');
  const id = state.games[0].id;
  await app.call('games:set-favorite', id, true);
  const hidden = await app.call('games:set-hidden', id, true);
  assert.notEqual(hidden.selectedGameId, id);
  assert.equal(hidden.games.length, 2);
  app.discovered[0].displayName = 'Refreshed name';
  const rescanned = await app.call('games:rescan');
  const record = rescanned.state.games.find(game => game.id === id);
  assert.equal(record.hidden, true);
  assert.equal(record.favorite, true);
  assert.equal(rescanned.added, 0);
  const restarted = harness(t, app.root);
  const reloaded = await restarted.call('app:get-state');
  assert.equal(reloaded.games.find(game => game.id === id).hidden, true);
  assert.equal(reloaded.games.find(game => game.id === id).favorite, true);
  const restored = await restarted.call('games:set-hidden', id, false);
  assert.equal(restored.games.find(game => game.id === id).hidden, false);
  assert.equal(fs.readFileSync(app.exeA, 'utf8'), 'fixture');
  assert.equal(fs.readFileSync(config, 'utf8'), 'keep config byte-for-byte');
  assert.equal(fs.readFileSync(backup, 'utf8'), 'keep original backup');
});

test('remove clears only the library entry, keeps files, and blocks automatic rediscovery', async t => {
  const app = harness(t);
  const config = path.join(path.dirname(app.exeA), 'OptiScaler.ini');
  const backup = path.join(path.dirname(app.exeA), '_dlss5_backup', 'original.dll');
  fs.mkdirSync(path.dirname(backup));
  fs.writeFileSync(config, 'keep config byte-for-byte');
  fs.writeFileSync(backup, 'keep original backup');
  const state = await app.call('app:get-state');
  const id = state.games[0].id;
  await app.call('games:set-favorite', id, true);
  const removed = await app.call('games:remove', id);
  assert.equal(removed.games.length, 1);
  assert.equal(removed.games.some(game => game.id === id), false);
  assert.equal(fs.readFileSync(app.exeA, 'utf8'), 'fixture');
  assert.equal(fs.readFileSync(config, 'utf8'), 'keep config byte-for-byte');
  assert.equal(fs.readFileSync(backup, 'utf8'), 'keep original backup');
  const rescanned = await app.call('games:rescan');
  assert.equal(rescanned.added, 0);
  assert.equal(rescanned.state.games.length, 1);
  app.dialogs.push({ canceled: false, filePaths: [app.exeA] });
  const next = await app.call('games:add');
  const record = next.games.find(game => game.id === id);
  assert.equal(next.games.length, 2);
  assert.equal(record.favorite, false);
  assert.equal(record.hidden, false);
  assert.equal(record.launcher, 'Manual');
  const cancelled = await app.call('games:add');
  assert.equal(cancelled.cancelled, true);
});

test('folder selection accepts only an offered candidate and expires after use', async t => {
  const app = harness(t);
  await app.call('app:get-state');
  app.dialogs.push({ canceled: false, filePaths: [app.root] });
  const result = await app.call('games:choose-folder');
  assert.equal(result.candidates[0].path, undefined, 'renderer receives an index, not write authority over arbitrary paths');
  assert.equal((await app.handlers.get('games:add-candidate')(null, 'forged', 0)).ok, false);
  assert.equal((await app.handlers.get('games:add-candidate')(null, result.token, -1)).ok, false);
  const next = await app.call('games:add-candidate', result.token, 0);
  assert.equal(next.games.find(game => game.id === next.selectedGameId).exePath, app.exeB);
  assert.equal((await app.handlers.get('games:add-candidate')(null, result.token, 0)).ok, false);
});

test('context menu is localized, reversible and dismissing it performs no action', async t => {
  const app = harness(t);
  const state = await app.call('app:get-state');
  const id = state.games[0].id;
  await app.call('app:set-language', 'zh-CN');
  assert.equal(await app.call('games:context-menu', id), null);
  assert.deepEqual(Array.from(app.menu.filter(item => item.label), item => item.label), ['开始游戏', '添加至收藏夹', '浏览本地文件', '隐藏（不删除游戏文件）', '从游戏库移除（保留游戏文件）']);
  await app.call('games:set-favorite', id, true);
  await app.call('games:set-hidden', id, true);
  app.menuIndex = 1;
  assert.equal(await app.call('games:context-menu', id), 'favorite');
  assert.equal(app.menu[1].label, '取消收藏');
  assert.equal(app.menu[4].label, '取消隐藏');
  assert.equal(app.menu[5].label, '从游戏库移除（保留游戏文件）');
  app.electron.shell.openPath = async () => 'Folder unavailable';
  const error = await app.handlers.get('game:open-folder')(null, id);
  assert.equal(error.ok, false);
  assert.equal(error.message, 'Folder unavailable');
});
