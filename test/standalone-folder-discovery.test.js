'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { writePe } = require('./fixtures/pe');
const discovery = require('../standalone/core/discovery');

test('folder candidates find a deeply nested shipping EXE and exclude auxiliary programs', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-folder-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ['launcher.exe', 'GameLauncher.exe', 'CrashReportClient.exe', 'GameUpdater.exe', 'setup.exe']) {
    writePe(path.join(dir, name), { text: 'D3D12CreateDevice' });
  }
  const shipping = path.join(dir, 'Wuthering Waves Game', 'Client', 'Binaries', 'Win64', 'Client-Win64-Shipping.exe');
  writePe(shipping, { text: 'D3D12CreateDevice' });
  writePe(path.join(dir, 'Game.exe'));
  fs.writeFileSync(path.join(path.dirname(shipping), 'nvngx_dlss.dll'), 'fixture');
  const result = await discovery.candidatesFor({ dir });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].path, shipping);
  assert.ok(result.candidates[0].reasons.includes('shipping'));
  assert.ok(result.candidates[0].reasons.includes('nearDlss'));
  assert.equal(result.candidates[0].apiLabel, 'DirectX 12');
  assert.equal(result.truncated, false);
  assert.equal(await discovery.candidateFor({ dir }), shipping);
});

test('multiple valid rendering executables are retained for explicit user choice', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-choice-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  writePe(path.join(dir, 'Game_dx11.exe'), { text: 'D3D11CreateDevice' });
  writePe(path.join(dir, 'Game_dx12.exe'), { text: 'D3D12CreateDevice' });
  const result = await discovery.candidatesFor({ dir });
  assert.equal(result.candidates.length, 2);
  assert.ok(result.candidates.every(candidate => candidate.supported));
  assert.deepEqual(new Set(result.candidates.map(candidate => candidate.apiLabel)), new Set(['DirectX 11', 'DirectX 12']));
});

test('an empty folder yields no fabricated executable', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-empty-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal((await discovery.candidatesFor({ dir })).candidates.length, 0);
  assert.equal(await discovery.candidateFor({ dir }), null);
});

test('temporal upscaler DLLs influence automatic game executable ranking', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-temporal-rank-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const generic = path.join(dir, 'Tools', 'Generic.exe');
  const game = path.join(dir, 'Game', 'Binaries', 'Win64', 'Game-Win64-Shipping.exe');
  writePe(generic, { text: 'D3D12CreateDevice' });
  writePe(game, { text: 'D3D12CreateDevice' });
  fs.mkdirSync(path.dirname(game), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(game), 'ffx_fsr2_api_x64.dll'), 'fixture');

  const result = await discovery.candidatesFor({ dir });
  assert.equal(result.candidates[0].path, game);
  assert.ok(result.candidates[0].reasons.includes('nearFSR2'));
});



test('Steam artwork resolver finds hashed localized library assets', t => {
  const steamRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-steam-art-'));
  t.after(() => fs.rmSync(steamRoot, { recursive: true, force: true }));

  const appDir = path.join(steamRoot, 'appcache', 'librarycache', '1867240');
  const capsuleDir = path.join(appDir, 'e3ffd05b16458c3628e3e4209f0feabf5b535382');
  const heroDir = path.join(appDir, '0579c83d1ad1a9c25b21f936e4ef143d36769bb1');
  const headerDir = path.join(appDir, 'be00107d586c0bf0412e9e4acedb64629a99aa5b');
  fs.mkdirSync(capsuleDir, { recursive: true });
  fs.mkdirSync(heroDir, { recursive: true });
  fs.mkdirSync(headerDir, { recursive: true });

  const capsule = path.join(capsuleDir, 'library_capsule_schinese.jpg');
  const hero = path.join(heroDir, 'library_hero_schinese.jpg');
  const header = path.join(headerDir, 'library_header_schinese.jpg');
  fs.writeFileSync(capsule, 'capsule');
  fs.writeFileSync(hero, 'hero');
  fs.writeFileSync(path.join(heroDir, 'library_hero_blur_schinese.jpg'), 'blur');
  fs.writeFileSync(header, 'header');

  const entry = { launcher: 'Steam', steamRoot, id: '1867240' };
  assert.equal(discovery.steamCover(entry), capsule);
  assert.equal(discovery.steamBanner(entry), hero);
  assert.equal(discovery.steamTile(entry), header);
});
