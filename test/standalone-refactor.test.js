'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('standalone app does not load the upstream product shell', () => {
  const main = read('standalone/main.js');
  assert.doesNotMatch(main, /require\s*\(\s*['"]\.\.\/main\.js['"]\s*\)/);
  assert.doesNotMatch(main, /\.\.\/src\/core\/(?:scan|apply|feeder-config|optiscaler|presr-bootstrap)/);
  assert.doesNotMatch(main, /community-client|admin-vault|RenoDX/i);
});

test('standalone core has no Feeder, RenoDX, emulator or Community module dependencies', () => {
  const files = [
    'standalone/core/game-scan.js',
    'standalone/core/file-state.js',
    'standalone/core/runtime.js',
    'standalone/core/optiscaler.js',
    'standalone/core/ini.js',
    'standalone/core/download.js'
  ];
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /src\/core\/(?:scan|apply|feeder-config|runtime-components|presr-bootstrap)/);
  // Third-party packages can legitimately carry attribution files whose names
  // contain terms such as RenoDX. What must not survive here is a code/module
  // dependency on the old product surfaces themselves.
  assert.doesNotMatch(source, /require\s*\(\s*['"][^'"]*(?:community-client|admin-vault|emulators|feeder-release|renodx)[^'"]*['"]\s*\)/i);
});

test('retained upstream-derived code is isolated behind an attributed boundary', () => {
  const pe = read('standalone/core/derived/pe.js');
  assert.match(pe, /DLSS5-Swapper by Rakan Alkhaldi/);
  assert.match(pe, /MIT License/);
});

test('standalone renderer has no Community or Chat product surfaces', () => {
  const html = read('standalone/renderer/index.html');
  assert.doesNotMatch(html, /data-page=["'](?:community|chat)["']/i);
});

test('standalone launcher is explicit and separate from the legacy app', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['start:standalone'], 'electron standalone');
  assert.equal(pkg.main, 'standalone/main.js');
});

test('standalone app keeps English and Simplified Chinese as exclusive UI locales', () => {
  const renderer = read('standalone/renderer/app.js');
  assert.match(renderer, /\ben:\s*\{/);
  assert.match(renderer, /['"]zh-CN['"]:\s*\{/);
  assert.match(renderer, /whereWindsMeet:\s*'Where Winds Meet'/);
  assert.match(renderer, /whereWindsMeet:\s*'燕云十六声'/);
});

test('standalone INI editor updates one section without requiring Feeder config', () => {
  const ini = require(path.join(root, 'standalone/core/ini'));
  let text = '[DlssNr]\r\nEnabled=false\r\n\r\n[Other]\r\nValue=1';
  text = ini.set(text, 'DlssNr', 'RunBeforeSR', 'true');
  text = ini.set(text, 'DlssNr', 'Enabled', 'true');
  assert.equal(ini.get(text, 'DlssNr', 'Enabled'), 'true');
  assert.equal(ini.get(text, 'DlssNr', 'RunBeforeSR'), 'true');
  assert.equal(ini.get(text, 'Other', 'Value'), '1');
});

test('standalone file state rejects paths outside the managed game root', () => {
  const fileState = require(path.join(root, 'standalone/core/file-state'));
  const game = path.join(root, 'tmp-game');
  assert.throws(() => fileState.safePath(game, path.join('..', 'outside.dll')), /escapes managed root/);
  assert.equal(fileState.safePath(game, path.join('bin', 'inside.dll')), path.join(game, 'bin', 'inside.dll'));
});

test('OptiScaler config writes independent styles for all three model passes', () => {
  const optiscaler = require(path.join(root, 'standalone/core/optiscaler'));
  const ini = require(path.join(root, 'standalone/core/ini'));
  const configured = optiscaler.configure('[DlssNr]\r\nEnabled=false', { exePath: path.join(root, 'Game.exe') }, {
    runBeforeSR: true,
    passes: 3,
    pass1Style: '0',
    pass2Style: '1',
    pass3Style: '2'
  });
  assert.equal(ini.get(configured, 'DlssNr', 'Passes'), '3');
  assert.equal(ini.get(configured, 'DlssNr', 'Style'), '0');
  assert.equal(ini.get(configured, 'DlssNr', 'Pass2Style'), '1');
  assert.equal(ini.get(configured, 'DlssNr', 'Pass3Style'), '2');
});

test('later pass styles default to backend inheritance', () => {
  const optiscaler = require(path.join(root, 'standalone/core/optiscaler'));
  const ini = require(path.join(root, 'standalone/core/ini'));
  const configured = optiscaler.configure('', { exePath: path.join(root, 'Game.exe') }, { passes: 2 });
  assert.equal(ini.get(configured, 'DlssNr', 'Style'), 'auto');
  assert.equal(ini.get(configured, 'DlssNr', 'Pass2Style'), 'auto');
  assert.equal(ini.get(configured, 'DlssNr', 'Pass3Style'), 'auto');
});

test('per-pass style controls are present in the standalone UI', () => {
  const html = read('standalone/renderer/index.html');
  assert.match(html, /id="pass1Style"/);
  assert.match(html, /id="pass2Style"/);
  assert.match(html, /id="pass3Style"/);
  assert.match(html, /data-i18n="inheritPass1"/);
});

test('standalone packaging has its own DLSS 5 product identity and entry point', () => {
  const pkg = JSON.parse(read('package.json'));
  const config = JSON.parse(read('standalone/electron-builder.json'));
  assert.equal(pkg.scripts['build:standalone:portable'], 'electron-builder --config standalone/electron-builder.json --win portable');
  assert.equal(config.productName, 'DLSS5 Pre-SR Manager');
  assert.equal(config.appId, 'com.neosixon.dlss5presrmanager');
  assert.equal(config.extraMetadata.name, 'dlss5-presr-manager');
  assert.equal(config.extraMetadata.version, '0.1.0');
  assert.equal(config.extraMetadata.main, 'standalone/main.js');
  assert.deepEqual(config.win.target, ['portable']);
  assert.match(config.files.join('\n'), /standalone\/\*\*\/\*/);
  assert.doesNotMatch(config.files.join('\n'), /src\/\*\*/);
});

test('standalone shell uses the DLSS5 + Pre-SR Manager wordmark', () => {
  const html = read('standalone/renderer/index.html');
  const theme = read('standalone/renderer/nvidia-ui.css');
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(html, /class="brand-dlss">DLSS/);
  assert.match(html, /class="brand-five">5/);
  assert.match(html, /class="brand-subtitle">Pre-SR Manager/);
  assert.match(html, /aria-label="DLSS5 Pre-SR Manager"/);
  assert.match(theme, /\.brand-dlss:after/);
  assert.match(theme, /background:var\(--accent\)/);
  assert.match(theme, /\.brand-five\{[^}]*color:var\(--accent\)/);
  assert.match(ux, /subtitle\.textContent = 'Pre-SR Manager'/);
  assert.doesNotMatch(html, /class="brand-mark"/);
  assert.doesNotMatch(html, />NR</);
});

test('standalone build generates the approved vector 5 Manager application icon', () => {
  const pkg = JSON.parse(read('package.json'));
  const main = read('standalone/main.js');
  const iconScript = read('scripts/make-standalone-icon.js');
  const iconSource = read('standalone/renderer/icon-source.svg');
  assert.equal(pkg.scripts['icon:standalone'], 'electron scripts/make-standalone-icon.js');
  assert.equal(pkg.scripts['prebuild:standalone:portable'], 'npm run icon:standalone');
  assert.equal(pkg.scripts['prestart:standalone'], 'npm run icon:standalone');
  assert.match(main, /renderer['"], 'app-icon\.png/);
  assert.match(iconScript, /DLSS 5 Pre-SR Manager standalone icon/);
  assert.match(iconScript, /icon-source\.svg/);
  assert.match(iconScript, /transparent: true/);
  assert.match(iconScript, /backgroundColor: '#00000000'/);
  assert.match(iconScript, /build\/icon\.ico|icon\.ico/);
  assert.match(iconScript, /app-icon\.png/);
  assert.match(iconSource, /<rect[^>]+rx="\d+"[^>]+fill="#0B0D0E"\/>/);
  assert.match(iconSource, /fill="#80C704"/);
  assert.match(iconSource, />MANAGER<\/text>/);
});

test('settings includes a Buy Me a Coffee support card with a bundled QR code', () => {
  const html = read('standalone/renderer/index.html');
  const app = read('standalone/renderer/app.js');
  const preload = read('standalone/preload.js');
  const main = read('standalone/main.js');
  assert.match(html, /supportOpenBtn/);
  assert.match(html, /assets\/buymeacoffee-qr\.png/);
  assert.match(html, /buymeacoffee\.com\/NeoSixon/);
  assert.match(app, /supportTitle: '支持开发'/);
  assert.match(app, /window\.nrApp\.openSupport\(\)/);
  assert.match(preload, /app:open-support/);
  assert.match(main, /https:\/\/buymeacoffee\.com\/NeoSixon/);
  assert.match(main, /shell\.openExternal\(SUPPORT_URL\)/);
  const qr = path.join(root, 'standalone/renderer/assets/buymeacoffee-qr.png');
  assert.ok(fs.existsSync(qr), 'support QR should be bundled with standalone renderer assets');
  assert.ok(fs.statSync(qr).size > 1000, 'support QR should not be empty');
});
