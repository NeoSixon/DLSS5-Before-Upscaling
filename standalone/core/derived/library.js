'use strict';
// Launcher discovery adapted from DLSS5-Swapper by Rakan Alkhaldi (MIT).
// Read-only: no launcher accounts or files are modified.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const NOT_A_GAME = /redistributabl|steamworks common|directx|vcredist|soundtrack/i;
let registryRunner = args => execFileSync('reg', args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });

function reg(key, value) {
  try {
    const out = registryRunner(['query', key, '/v', value]);
    const match = out.match(new RegExp(value + '\\s+REG_\\w+\\s+(.+)'));
    return match ? match[1].trim() : null;
  } catch { return null; }
}
function regKeys(key) {
  try { return registryRunner(['query', key]).split('\n').map(v => v.trim()).filter(v => v.startsWith('HKEY')); }
  catch { return []; }
}
function setRegistryRunner(runner) {
  registryRunner = runner || (args => execFileSync('reg', args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }));
}
function kv(text, key) {
  return (String(text).match(new RegExp(`"${key}"\\s+"([^"]+)"`, 'i')) || [])[1];
}

function steamPoster(steamRoot, appid) {
  const root = path.join(steamRoot, 'appcache', 'librarycache');
  for (const file of [path.join(root, String(appid), 'header.jpg'), path.join(root, `${appid}_header.jpg`)]) {
    if (fs.existsSync(file)) return { file, tall: false };
  }
  for (const file of [path.join(root, String(appid), 'library_600x900.jpg'), path.join(root, `${appid}_library_600x900.jpg`)]) {
    if (fs.existsSync(file)) return { file, tall: true };
  }
  return null;
}

function steam() {
  const root = reg('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  if (!root) return [];
  const base = root.replace(/\//g, '\\');
  const libraries = new Set([base]);
  try {
    const vdf = fs.readFileSync(path.join(base, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.add(match[1].replace(/\\\\/g, '\\'));
  } catch {}
  const games = [];
  for (const lib of libraries) {
    const apps = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(apps).filter(name => /^appmanifest_\d+\.acf$/i.test(name)); } catch { continue; }
    for (const file of files) {
      try {
        const text = fs.readFileSync(path.join(apps, file), 'utf8');
        const appid = kv(text, 'appid');
        const installdir = kv(text, 'installdir');
        const name = kv(text, 'name') || installdir;
        if (!appid || !installdir || NOT_A_GAME.test(name || '')) continue;
        const dir = path.join(apps, 'common', installdir);
        if (!fs.existsSync(dir)) continue;
        games.push({ launcher: 'Steam', id: appid, name, dir, poster: steamPoster(base, appid), steamRoot: base });
      } catch {}
    }
  }
  return games;
}

function epic() {
  const root = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  let files = [];
  try { files = fs.readdirSync(root).filter(name => name.endsWith('.item')); } catch { return []; }
  return files.flatMap(file => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      if (!data.InstallLocation || !fs.existsSync(data.InstallLocation) || NOT_A_GAME.test(data.DisplayName || '')) return [];
      return [{ launcher: 'Epic Games', id: data.AppName || null, name: data.DisplayName || path.basename(data.InstallLocation), dir: data.InstallLocation, poster: null }];
    } catch { return []; }
  });
}

function gog() {
  const out = [];
  for (const key of regKeys('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games')) {
    const dir = reg(key, 'path');
    if (!dir || !fs.existsSync(dir)) continue;
    const name = reg(key, 'gameName') || path.basename(dir);
    if (!NOT_A_GAME.test(name)) out.push({ launcher: 'GOG', id: key.split('\\').pop(), name, dir, poster: null });
  }
  return out;
}

function ubisoft() {
  const out = [];
  for (const key of regKeys('HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs')) {
    const raw = reg(key, 'InstallDir');
    if (!raw) continue;
    const dir = path.resolve(raw);
    if (!fs.existsSync(dir)) continue;
    const name = path.basename(dir);
    if (!NOT_A_GAME.test(name)) out.push({ launcher: 'Ubisoft', id: key.split('\\').pop(), name, dir, poster: null });
  }
  return out;
}

function drives() {
  const out = [];
  for (let code = 67; code <= 90; code++) {
    const root = String.fromCharCode(code) + ':\\';
    try { fs.readdirSync(root); out.push(root); } catch {}
  }
  return out;
}
function gamingRootFolder(drive) {
  let buf;
  try { buf = fs.readFileSync(path.join(drive, '.GamingRoot')); } catch { return null; }
  if (buf.length < 10 || buf.toString('latin1', 0, 4) !== 'RGBX') return null;
  const decoded = buf.toString('utf16le', 8);
  const end = decoded.indexOf('\0');
  const relative = (end === -1 ? decoded : decoded.slice(0, end)).trim();
  if (!relative) return null;
  const dir = path.resolve(drive, relative);
  return fs.existsSync(dir) ? dir : null;
}
function xbox() {
  const out = [];
  for (const drive of drives()) {
    const root = gamingRootFolder(drive);
    if (!root) continue;
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const content = path.join(dir, 'Content');
      if (!fs.existsSync(content)) continue;
      out.push({ launcher: 'Xbox', id: null, name: entry.name, dir, poster: null });
    }
  }
  return out;
}

function dedupe(games) {
  const seen = new Map();
  for (const game of games) {
    const key = path.resolve(game.dir).toLowerCase();
    if (!seen.has(key)) seen.set(key, game);
  }
  return [...seen.values()];
}
function discover() {
  return { games: dedupe([...steam(), ...epic(), ...gog(), ...ubisoft(), ...xbox()]), roots: [] };
}

module.exports = { discover, steam, epic, gog, ubisoft, xbox, drives, gamingRootFolder, dedupe, setRegistryRunner };
