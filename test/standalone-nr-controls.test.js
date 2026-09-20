'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('standalone supports a master Neural Rendering enabled switch under DLSS 5 branding', () => {
  const main = read('standalone/main.js');
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(main, /enabled:\s*true/);
  assert.match(main, /settings\.enabled/);
  assert.match(ux, /nrEnabledToggle/);
  assert.match(ux, /master:\s*'Enable Neural Rendering'/);
  assert.match(ux, /sectionTitle:\s*'DLSS 5 Neural Rendering'/);
});

test('NR settings bridge reads and writes existing OptiScaler config', (t) => {
  const nrSettings = require(path.join(root, 'standalone/core/nr-settings'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlssnr-settings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const exe = path.join(dir, 'Game.exe');
  fs.writeFileSync(exe, 'x');
  fs.writeFileSync(path.join(dir, 'OptiScaler.ini'), '[DlssNr]\r\nEnabled=true\r\nRunBeforeSR=true\r\nPasses=2\r\nStyle=1\r\n', 'utf8');

  const before = nrSettings.read(exe, {});
  assert.equal(before.enabled, true);
  assert.equal(before.runBeforeSR, true);
  assert.equal(before.passes, 2);
  assert.equal(before.pass1Style, '1');

  nrSettings.apply(exe, { ...before, enabled: false, runBeforeSR: false });
  const after = nrSettings.read(exe, {});
  assert.equal(after.enabled, false);
  assert.equal(after.runBeforeSR, false);
});

test('Chinese overlay replaces OptiScaler auto font with an available CJK font', (t) => {
  const nrSettings = require(path.join(root, 'standalone/core/nr-settings'));
  const ini = require(path.join(root, 'standalone/core/ini'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlssnr-cjk-'));
  const windowsDir = path.join(dir, 'Windows');
  const fontsDir = path.join(windowsDir, 'Fonts');
  fs.mkdirSync(fontsDir, { recursive: true });
  fs.writeFileSync(path.join(fontsDir, 'msyh.ttc'), 'fake-font');
  const exe = path.join(dir, 'Game.exe');
  const config = path.join(dir, 'OptiScaler.ini');
  fs.writeFileSync(exe, 'x');
  fs.writeFileSync(config, '[Menu]\\r\\nTTFFontPath=auto\\r\\n', 'utf8');

  const previousWindir = process.env.WINDIR;
  process.env.WINDIR = windowsDir;
  t.after(() => {
    if (previousWindir === undefined) delete process.env.WINDIR;
    else process.env.WINDIR = previousWindir;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  assert.equal(nrSettings.applyOverlayLanguage(exe, 'zh-CN'), true);
  const text = fs.readFileSync(config, 'utf8');
  assert.equal(ini.get(text, 'Menu', 'DLSS5ManagerLanguage'), 'zh-CN');
  assert.equal(ini.get(text, 'Menu', 'TTFFontPath'), path.join(fontsDir, 'msyh.ttc'));
});

test('compact overlay preferences write shortcut, scale, opacity and position', (t) => {
  const nrSettings = require(path.join(root, 'standalone/core/nr-settings'));
  const ini = require(path.join(root, 'standalone/core/ini'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlssnr-overlay-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const exe = path.join(dir, 'Game.exe');
  const config = path.join(dir, 'OptiScaler.ini');
  fs.writeFileSync(exe, 'x');
  fs.writeFileSync(config, '[DlssNr]\r\nEnabled=true\r\n', 'utf8');

  assert.equal(nrSettings.applyOverlay(exe, { enabled: true, hotkey: 0x79, scale: 1.25, opacity: 0.75, position: 3 }), true);
  const text = fs.readFileSync(config, 'utf8');
  assert.equal(ini.get(text, 'Menu', 'ShortcutKey'), '121');
  assert.equal(ini.get(text, 'Menu', 'Scale'), '1.25');
  assert.equal(ini.get(text, 'Menu', 'FpsOverlayAlpha'), '0.75');
  assert.equal(ini.get(text, 'Menu', 'FpsOverlayPos'), '3');
  assert.equal(ini.get(text, 'Menu', 'DisableSplash'), 'true');
});

test('standalone exposes list icons, banner artwork and existing NR detection to the renderer', () => {
  const main = read('standalone/main.js');
  const ux = read('standalone/renderer/ux-fixes.js');
  const css = read('standalone/renderer/compact-ui.css');
  assert.match(main, /getFileIcon/);
  assert.match(main, /iconDataUrl/);
  assert.match(main, /bannerDataUrl/);
  assert.match(main, /existingSetup/);
  assert.match(ux, /decorateHero/);
  assert.match(ux, /bannerDataUrl/);
  assert.match(ux, /decorateGameRows/);
  assert.match(ux, /home-game-card/);
  assert.doesNotMatch(ux, /heroGameIcon/);
  assert.match(css, /hero-game-icon\{display:none!important\}/);
  assert.match(ux, /Existing NR detected/);
});

test('game detail keeps explanations compact and puts the info button on the Pre-SR row', () => {
  const ux = read('standalone/renderer/ux-fixes.js');
  const css = read('standalone/renderer/compact-ui.css');
  assert.match(ux, /nrInfoButton/);
  assert.match(ux, /nr-info-popover/);
  assert.match(ux, /document\.getElementById\('presrToggle'\)\?\.closest\('\.setting-row'\)/);
  assert.match(ux, /title\.after\(wrap\)/);
  assert.match(css, /presr-info-wrap/);
  assert.match(css, /#gameDetail \.eyebrow/);
  assert.match(css, /#gameDetail \.mode-line/);
  assert.match(css, /#gameDetail \.game-hint/);
  assert.match(css, /\.badges\{display:inline-flex/);
});

test('Home is a banner library landing page while Games opens a dedicated game detail page', () => {
  const index = read('standalone/renderer/index.html');
  const app = read('standalone/renderer/app.js');
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(index, /id="homeScanBtn"/);
  assert.match(index, /id="homeGameCount"/);
  assert.match(index, /id="page-game"/);
  assert.match(index, /id="gameBackBtn"/);
  assert.match(app, /function renderHome\(\)/);
  assert.match(app, /function renderGame\(\)/);
  assert.match(app, /showPage\('game'\)/);
  assert.match(app, /currentPage === 'game' \? 'games'/);
  assert.match(ux, /home-game-grid/);
  assert.match(ux, /home-game-card/);
  assert.doesNotMatch(ux, /home-radar/);
});

test('standalone automatically discovers launcher games and also exposes a manual rescan', () => {
  const main = read('standalone/main.js');
  const preload = read('standalone/preload.js');
  const app = read('standalone/renderer/app.js');
  const discovery = read('standalone/core/discovery.js');
  const library = read('standalone/core/derived/library.js');
  assert.match(main, /ensureAutoDiscovery/);
  assert.match(main, /games:rescan/);
  assert.match(preload, /rescanGames/);
  assert.match(app, /function scanGames\(\)/);
  assert.match(app, /window\.nrApp\.rescanGames/);
  assert.match(discovery, /library\.discover/);
  assert.match(library, /Steam/);
  assert.match(library, /Epic Games/);
  assert.match(library, /GOG/);
  assert.match(library, /Ubisoft/);
  assert.match(library, /Xbox/);
});

test('Steam banner discovery supports current nested cache layouts and wide hero art', () => {
  const discovery = read('standalone/core/discovery.js');
  assert.match(discovery, /library_hero\.jpg/);
  assert.match(discovery, /library_header\.jpg/);
  assert.match(discovery, /recursiveSteamArtwork/);
  assert.match(discovery, /localized asset/);
  assert.match(discovery, /per-asset SHA1 directories/);
});

test('non-blocking setting updates no longer pre-render switches back to old state', () => {
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(ux, /act\s*=\s*async function\(work, lock = true\)/);
  assert.match(ux, /if \(lock\) \{ busy = true; render\(\); \}/);
});

test('desktop settings expose global manager overlay controls and native patch exists', () => {
  const preload = read('standalone/preload.js');
  const ux = read('standalone/renderer/ux-fixes.js');
  const patch = read('scripts/patch-optiscaler-compact-overlay.py');
  assert.match(preload, /getOverlayPreferences/);
  assert.match(preload, /setOverlayPreferences/);
  assert.match(ux, /overlaySettingsCard/);
  assert.match(ux, /overlayHotkey/);
  assert.match(ux, /overlayOpacity/);
  assert.match(ux, /overlayPosition/);
  assert.match(patch, /DoubleSixunManagerOverlay/);
  assert.match(patch, /dlss5ManagerOverlayVisible/);
  assert.match(patch, /RenderDlss5ManagerOverlay/);
  assert.match(patch, /_isVisible = false/);
  assert.match(patch, /Neural Rendering/);
  assert.match(patch, /Pre-SR/);
  assert.match(patch, /Pass 1 style/);
});
