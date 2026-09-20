'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const discovery = require(path.join(root, 'standalone/core/discovery'));

function fakePng(file, width, height) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = Buffer.alloc(24);
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(data);
  data.write('IHDR', 12, 'ascii');
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  fs.writeFileSync(file, data);
}

test('local artwork discovery selects a portrait cover, wide hero and landscape tile', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlss5-local-art-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cover = path.join(dir, 'launcher', 'images', 'game_cover.png');
  const hero = path.join(dir, 'launcher', 'images', 'main_hero.png');
  const tile = path.join(dir, 'launcher', 'images', 'library_header.png');
  fakePng(cover, 600, 900);
  fakePng(hero, 1920, 620);
  fakePng(tile, 920, 430);
  const result = discovery.localArtworkFor(dir);
  assert.equal(result.coverPath, cover);
  assert.equal(result.bannerPath, hero);
  assert.equal(result.tilePath, tile);
});

test('local artwork discovery rejects texture-like images', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlss5-local-texture-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fakePng(path.join(dir, 'character_diffuse.png'), 600, 900);
  fakePng(path.join(dir, 'ui_normal.png'), 1920, 620);
  const result = discovery.localArtworkFor(dir);
  assert.equal(result.coverPath, null);
  assert.equal(result.bannerPath, null);
});

test('library cards use the executable icon as the final fallback', () => {
  const compat = read('standalone/renderer/home-compat.js');
  const fixes = read('standalone/renderer/ux-fixes.js');
  assert.match(compat, /game\.coverDataUrl \|\| game\.tileDataUrl \|\| game\.bannerDataUrl \|\| game\.iconDataUrl/);
  assert.match(fixes, /game\.tileDataUrl \|\| game\.bannerDataUrl \|\| game\.coverDataUrl \|\| game\.iconDataUrl/);
});

test('artwork handling has no credential or remote-artwork IPC surface', () => {
  const main = read('standalone/main.js');
  const preload = read('standalone/preload.js');
  const html = read('standalone/renderer/index.html');
  assert.doesNotMatch(main, /safeStorage|Authorization:/);
  assert.doesNotMatch(preload, /artwork:set|artwork:updated/);
  assert.doesNotMatch(html, /API key/i);
  assert.match(main, /discovery\.localArtworkFor/);
});
