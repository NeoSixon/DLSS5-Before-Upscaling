'use strict';

const fs = require('fs');
const path = require('path');
const fileState = require('./file-state');
const runtime = require('./runtime');
const srRuntime = require('./sr-runtime');
const gameScan = require('./game-scan');
const optiscaler = require('./optiscaler');
const gameProcess = require('./game-process');

let registered = false;

function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function libraryFile(userData) {
  return path.join(userData, 'standalone-library.json');
}

function readLibrary(userData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(libraryFile(userData), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { language: 'en', games: [] };
  } catch {
    return { language: 'en', games: [] };
  }
}

function managedRecord(userData, id) {
  const state = readLibrary(userData);
  const record = Array.isArray(state.games) ? state.games.find(game => game.id === id) : null;
  if (!record?.exePath) throw fail('unknownGame', 'Unknown game.');
  return { state, record };
}

function isOnlineRisk(record) {
  return record?.profileId === 'where-winds-meet' || path.basename(String(record?.exePath || '')).toLowerCase() === 'yysls.exe';
}

async function confirmUpdateRisk(electron, record, language) {
  if (!isOnlineRisk(record)) return true;
  const zh = language === 'zh-CN';
  const options = {
    type: 'warning',
    title: zh ? '在线游戏提示' : 'Online game notice',
    message: zh
      ? '该游戏包含在线功能。注入式图形模组可能导致崩溃或触发反作弊风险。此应用不会绕过或关闭反作弊。'
      : 'This game includes online functionality. Injection-based graphics mods can crash or trigger anti-cheat risk. This app does not bypass or disable anti-cheat.',
    detail: zh
      ? '更新只会替换本应用已管理的后端文件，并保留最初的原文件备份。仅在你理解风险并愿意继续时更新。'
      : 'The update only replaces backend files already managed by this app and keeps the original-file backup intact. Update only if you understand the risk and want to continue.',
    buttons: zh ? ['取消', '更新后端'] : ['Cancel', 'Update backend'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  };
  const parent = electron.BrowserWindow?.getFocusedWindow?.() || null;
  const result = parent
    ? await electron.dialog.showMessageBox(parent, options)
    : await electron.dialog.showMessageBox(options);
  return result.response === 1;
}

function register({ electron, readSettings, readOverlayPrefs, readManagerLanguage, applyOverlay, applyOverlayLanguage }) {
  if (registered || !electron?.ipcMain?.handle || !electron?.app?.getPath) return false;
  registered = true;

  electron.ipcMain.handle('game:update-backend', async (_event, id) => {
    try {
      const userData = electron.app.getPath('userData');
      const { state, record } = managedRecord(userData, id);
      const language = state.language === 'zh-CN' ? 'zh-CN' : 'en';
      const gameDir = path.dirname(path.resolve(record.exePath));
      const manifest = fileState.loadManifest(gameDir);
      if (!manifest?.optiscaler) throw fail('notManaged', 'This game does not have a managed in-game backend to update.');

      if (manifest.optiscaler.version === optiscaler.RELEASE.packageId) {
        return { ok: true, value: { unchanged: true, version: optiscaler.RELEASE.packageId, logs: [] } };
      }

      await gameProcess.assertNotRunning(record.exePath, language);
      if (!(await confirmUpdateRisk(electron, record, language))) {
        return { ok: true, value: { cancelled: true, version: manifest.optiscaler.version, logs: [] } };
      }

      const inspected = await gameScan.inspect(record.exePath);
      const route = inspected.route || null;
      if (!route?.installable) {
        throw fail('noUpscalerRoute', 'No usable native or temporal upscaler route was detected for this game.');
      }

      const runtimePath = await runtime.resolve(electron.app, electron.dialog, record.exePath, language);
      const needsManagedSr = ['temporal-presr', 'auto-probe'].includes(route.id);
      const srRuntimePath = needsManagedSr
        ? await srRuntime.resolve(electron.app, electron.dialog, state.games || [], record.exePath, language)
        : null;
      const packageRoot = await optiscaler.ensurePackage(userData);
      const settings = readSettings(record.exePath, record.settings || {});
      const logs = [];
      const updated = await optiscaler.upgradeManaged({
        gameDir,
        exePath: record.exePath,
        packageRoot,
        runtimePath,
        srRuntimePath,
        settings,
        route,
        language
      }, entry => logs.push(entry));

      applyOverlay(record.exePath, readOverlayPrefs(userData));
      applyOverlayLanguage(record.exePath, readManagerLanguage(userData));

      return {
        ok: true,
        value: {
          cancelled: false,
          unchanged: false,
          fromVersion: manifest.optiscaler.version,
          version: updated.optiscaler.version,
          logs
        }
      };
    } catch (error) {
      return { ok: false, code: error.code || 'backendUpdateError', message: error.message || String(error) };
    }
  });
  return true;
}

module.exports = { libraryFile, readLibrary, managedRecord, isOnlineRisk, confirmUpdateRisk, register };
