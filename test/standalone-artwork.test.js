'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const artwork = require(path.join(root, 'standalone/core/artwork'));

test('SteamGridDB matching prefers the exact verified game title', () => {
  const games = [
    { id: 1, name: 'Death Stranding', verified: true },
    { id: 2, name: "Death Stranding Director's Cut", verified: true },
    { id: 3, name: "Death Stranding Director's Cut Demo", verified: false }
  ];
  assert.equal(artwork.chooseGame(games, "Death Stranding Director's Cut").id, 2);
});

test('SteamGridDB artwork prefers official-looking static alternatives and rejects risky tags', () => {
  const images = [
    { id: 1, score: 40, style: 'blurred', url: 'https://example.invalid/blurred.jpg', tags: [] },
    { id: 2, score: 15, style: 'alternate', url: 'https://example.invalid/alternate.jpg', tags: [] },
    { id: 3, score: 999, style: 'alternate', url: 'https://example.invalid/humor.jpg', tags: ['Humor'] }
  ];
  assert.equal(artwork.chooseImage(images, 'cover').id, 2);
});

test('SteamGridDB is reserved for non-Steam library entries', () => {
  assert.equal(artwork.isNonSteam({ launcher: 'Steam' }), false);
  assert.equal(artwork.isNonSteam({ launcher: 'Epic Games' }), true);
  assert.equal(artwork.isNonSteam({ launcher: 'GOG' }), true);
  assert.equal(artwork.isNonSteam({ launcher: 'Manual' }), true);
});

test('SteamGridDB API key can be stored through Electron safeStorage abstraction', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlss5-sgdb-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = { getPath: () => dir };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: value => value.toString('utf8').replace(/^encrypted:/, '')
  };

  const result = artwork.saveApiKey(app, safeStorage, 'secret-key');
  assert.equal(result.configured, true);
  assert.equal(result.protected, true);
  assert.equal(artwork.readApiKey(app, safeStorage), 'secret-key');
  assert.equal(artwork.hasApiKey(app, safeStorage), true);

  artwork.saveApiKey(app, safeStorage, '');
  assert.equal(artwork.hasApiKey(app, safeStorage), false);
});

test('Library cards use portrait cover art before horizontal Steam artwork', () => {
  const compat = read('standalone/renderer/home-compat.js');
  const css = read('standalone/renderer/nvidia-ui.css');
  assert.match(compat, /game\.coverDataUrl \|\| game\.tileDataUrl \|\| game\.bannerDataUrl/);
  assert.match(css, /\.library-game-card\{aspect-ratio:2\/3!important/);
  assert.match(css, /grid-template-columns:repeat\(auto-fill,minmax\(148px,1fr\)\)/);
});

test('Settings exposes SteamGridDB API-key configuration without embedding a key', () => {
  const html = read('standalone/renderer/index.html');
  const preload = read('standalone/preload.js');
  const main = read('standalone/main.js');
  assert.match(html, /id="steamGridDbKey"/);
  assert.match(html, /id="steamGridDbSaveBtn"/);
  assert.match(html, /id="steamGridDbGetKeyBtn"/);
  assert.match(preload, /artwork:set-steamgriddb-key/);
  assert.match(preload, /artwork:updated/);
  assert.match(main, /safeStorage/);
  assert.match(main, /queueArtworkEnrichment/);
  assert.doesNotMatch(main, /Bearer\s+[A-Za-z0-9_-]{16,}/);
});
