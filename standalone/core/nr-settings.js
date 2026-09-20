'use strict';

const fs = require('fs');
const path = require('path');
const ini = require('./ini');

const STYLE_VALUES = new Set(['auto', '0', '1', '2']);
const MANAGER_LANGUAGES = new Set(['en', 'zh-CN']);
const OVERLAY_KEYS = Object.freeze({
  insert: 0x2d,
  f8: 0x77,
  f9: 0x78,
  f10: 0x79,
  home: 0x24
});
const DEFAULT_OVERLAY = Object.freeze({
  enabled: true,
  hotkey: OVERLAY_KEYS.insert,
  scale: 1,
  opacity: 0.82,
  position: 1
});

function configFile(exePath) {
  return path.join(path.dirname(path.resolve(exePath)), 'OptiScaler.ini');
}

function boolValue(raw, fallback) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
  const value = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function styleValue(raw, fallback = 'auto') {
  const value = String(raw ?? fallback).trim().toLowerCase();
  return STYLE_VALUES.has(value) ? value : fallback;
}

function primaryStyleValue(raw, fallback = '0') {
  const value = styleValue(raw, fallback);
  return value === 'auto' ? '0' : value;
}

function concreteStyleValue(raw, fallback = '0') {
  const value = styleValue(raw, fallback);
  return value === 'auto' ? fallback : value;
}

function managerLanguage(value) {
  const normalized = String(value || 'en');
  return MANAGER_LANGUAGES.has(normalized) ? normalized : 'en';
}

function normalizeOverlay(value = {}) {
  const hotkey = Number(value.hotkey);
  const scale = Number(value.scale);
  const opacity = Number(value.opacity);
  const position = Number(value.position);
  return {
    enabled: value.enabled !== false,
    hotkey: Object.values(OVERLAY_KEYS).includes(hotkey) ? hotkey : DEFAULT_OVERLAY.hotkey,
    scale: Number.isFinite(scale) ? Math.min(1.5, Math.max(0.75, scale)) : DEFAULT_OVERLAY.scale,
    opacity: Number.isFinite(opacity) ? Math.min(0.95, Math.max(0.5, opacity)) : DEFAULT_OVERLAY.opacity,
    position: Number.isInteger(position) && position >= 0 && position <= 3 ? position : DEFAULT_OVERLAY.position
  };
}

function overlayPrefsFile(userData) {
  return path.join(userData, 'overlay-preferences.json');
}

function libraryFile(userData) {
  return path.join(userData, 'standalone-library.json');
}

function readOverlayPrefs(userData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(overlayPrefsFile(userData), 'utf8'));
    return normalizeOverlay(parsed);
  } catch {
    return { ...DEFAULT_OVERLAY };
  }
}

function readManagerLanguage(userData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(libraryFile(userData), 'utf8'));
    return managerLanguage(parsed?.language);
  } catch {
    return 'en';
  }
}

function writeOverlayPrefs(userData, value) {
  const next = normalizeOverlay(value);
  fs.mkdirSync(userData, { recursive: true });
  const file = overlayPrefsFile(userData);
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(temp, file);
  return next;
}

function read(exePath, fallback = {}) {
  const basePass1Style = primaryStyleValue(fallback.pass1Style);
  const base = {
    enabled: fallback.enabled !== false,
    runBeforeSR: fallback.runBeforeSR !== false,
    passes: Number.isInteger(Number(fallback.passes)) ? Number(fallback.passes) : 1,
    pass1Style: basePass1Style,
    pass2Style: concreteStyleValue(fallback.pass2Style, basePass1Style),
    pass3Style: concreteStyleValue(fallback.pass3Style, basePass1Style)
  };
  const file = configFile(exePath);
  if (!fs.existsSync(file)) return base;

  const text = ini.read(file) || '';
  const parsedPasses = Number(ini.get(text, 'DlssNr', 'Passes'));
  const pass1Style = primaryStyleValue(ini.get(text, 'DlssNr', 'Style'), base.pass1Style);
  return {
    enabled: boolValue(ini.get(text, 'DlssNr', 'Enabled'), base.enabled),
    runBeforeSR: boolValue(ini.get(text, 'DlssNr', 'RunBeforeSR'), base.runBeforeSR),
    passes: Number.isInteger(parsedPasses) && parsedPasses >= 1 && parsedPasses <= 3 ? parsedPasses : base.passes,
    pass1Style,
    pass2Style: concreteStyleValue(ini.get(text, 'DlssNr', 'Pass2Style'), pass1Style),
    pass3Style: concreteStyleValue(ini.get(text, 'DlssNr', 'Pass3Style'), pass1Style)
  };
}

function applyOverlay(exePath, preferences = DEFAULT_OVERLAY) {
  const file = configFile(exePath);
  if (!fs.existsSync(file)) return false;
  const overlay = normalizeOverlay(preferences);
  let text = ini.read(file) || '';
  const values = [
    ['ShortcutKey', overlay.enabled ? String(overlay.hotkey) : '-1'],
    ['Scale', overlay.scale.toFixed(2)],
    ['BGColorA', overlay.opacity.toFixed(2)],
    ['FpsOverlayAlpha', overlay.opacity.toFixed(2)],
    ['FpsOverlayPos', String(overlay.position)],
    ['DisableSplash', 'true'],
    ['OverlayMenu', 'true']
  ];
  for (const [key, value] of values) text = ini.set(text, 'Menu', key, value);
  fs.writeFileSync(file, text, 'utf8');
  return true;
}

function findCjkFont() {
  const windowsDir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  const fonts = path.join(windowsDir, 'Fonts');
  for (const name of ['msyh.ttc', 'msyhbd.ttc', 'msjh.ttc', 'simsun.ttc', 'simhei.ttf']) {
    const candidate = path.join(fonts, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function applyOverlayLanguage(exePath, language) {
  const file = configFile(exePath);
  if (!fs.existsSync(file)) return false;
  const nextLanguage = managerLanguage(language);
  let text = ini.read(file) || '';
  text = ini.set(text, 'Menu', 'DLSS5ManagerLanguage', nextLanguage);

  // OptiScaler ships TTFFontPath=auto, which resolves to its bundled Hack font.
  // Hack is Latin-only, so "auto" must be treated like no custom font for Chinese.
  const configuredFont = String(ini.get(text, 'Menu', 'TTFFontPath') || '').trim();
  if (nextLanguage === 'zh-CN' && (!configuredFont || /^auto$/i.test(configuredFont))) {
    const cjkFont = findCjkFont();
    if (cjkFont) text = ini.set(text, 'Menu', 'TTFFontPath', cjkFont);
  }

  fs.writeFileSync(file, text, 'utf8');
  return true;
}

function apply(exePath, settings = {}) {
  const file = configFile(exePath);
  if (!fs.existsSync(file)) return false;
  const passes = Number(settings.passes || 1);
  if (!Number.isInteger(passes) || passes < 1 || passes > 3) throw new Error('Passes must be 1, 2, or 3');

  let text = ini.read(file) || '';
  const pass1Style = primaryStyleValue(settings.pass1Style);
  const values = [
    ['Enabled', settings.enabled === false ? 'false' : 'true'],
    ['RunBeforeSR', settings.runBeforeSR === false ? 'false' : 'true'],
    ['Passes', String(passes)],
    ['Style', pass1Style],
    ['Pass2Style', concreteStyleValue(settings.pass2Style, pass1Style)],
    ['Pass3Style', concreteStyleValue(settings.pass3Style, pass1Style)]
  ];
  for (const [key, value] of values) text = ini.set(text, 'DlssNr', key, value);
  fs.writeFileSync(file, text, 'utf8');

  // The Electron app stores overlay preferences/language globally. Re-apply both whenever
  // NR settings are written, including immediately after a fresh backend install/update.
  try {
    const electron = require('electron');
    if (electron?.app?.getPath) {
      const userData = electron.app.getPath('userData');
      applyOverlay(exePath, readOverlayPrefs(userData));
      applyOverlayLanguage(exePath, readManagerLanguage(userData));
    }
  } catch {}
  return true;
}

function readLibraryGames(userData) {
  try { return JSON.parse(fs.readFileSync(libraryFile(userData), 'utf8'))?.games || []; }
  catch { return []; }
}

function applyOverlayToLibrary(userData, preferences) {
  let updated = 0;
  for (const game of readLibraryGames(userData)) {
    try { if (applyOverlay(game.exePath, preferences)) updated += 1; } catch {}
  }
  return updated;
}

function applyOverlayLanguageToLibrary(userData, language) {
  const nextLanguage = managerLanguage(language);
  let updated = 0;
  for (const game of readLibraryGames(userData)) {
    try { if (applyOverlayLanguage(game.exePath, nextLanguage)) updated += 1; } catch {}
  }
  return updated;
}

// Register tiny global-preferences IPC here because this module is already loaded by standalone/main.js.
// Guard it so node-only unit tests can require this file safely.
try {
  const electron = require('electron');
  if (electron?.ipcMain?.handle && electron?.app?.getPath) {
    electron.ipcMain.handle('app:get-overlay-preferences', () => ({
      ok: true,
      value: readOverlayPrefs(electron.app.getPath('userData'))
    }));
    electron.ipcMain.handle('app:set-overlay-preferences', (_event, value) => {
      try {
        const userData = electron.app.getPath('userData');
        const next = writeOverlayPrefs(userData, value);
        const updated = applyOverlayToLibrary(userData, next);
        return { ok: true, value: { ...next, updated } };
      } catch (error) {
        return { ok: false, code: error.code || 'overlayPreferencesError', message: error.message || String(error) };
      }
    });
    electron.ipcMain.handle('app:set-overlay-language', (_event, language) => {
      try {
        const userData = electron.app.getPath('userData');
        const nextLanguage = managerLanguage(language);
        const updated = applyOverlayLanguageToLibrary(userData, nextLanguage);
        return { ok: true, value: { language: nextLanguage, updated } };
      } catch (error) {
        return { ok: false, code: error.code || 'overlayLanguageError', message: error.message || String(error) };
      }
    });

    // Backend updates need to preserve the original backup rather than doing a
    // restore-then-install dance. Register the dedicated managed-update service
    // from the main process once all settings helpers are available.
    require('./backend-update').register({
      electron,
      readSettings: read,
      readOverlayPrefs,
      readManagerLanguage,
      applyOverlay,
      applyOverlayLanguage
    });
  }
} catch {}

module.exports = {
  configFile,
  read,
  apply,
  boolValue,
  styleValue,
  managerLanguage,
  DEFAULT_OVERLAY,
  OVERLAY_KEYS,
  normalizeOverlay,
  readOverlayPrefs,
  readManagerLanguage,
  writeOverlayPrefs,
  applyOverlay,
  applyOverlayToLibrary,
  findCjkFont,
  applyOverlayLanguage,
  applyOverlayLanguageToLibrary
};
