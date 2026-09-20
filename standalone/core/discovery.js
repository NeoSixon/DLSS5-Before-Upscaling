'use strict';

const fs = require('fs');
const path = require('path');
const library = require('./derived/library');
const gameScan = require('./game-scan');

const NOT_A_GAME_EXE = /^(unins|setup|install|vcredist|vc_redist|dxsetup|dxwebsetup|oalinst|uninstall|crashreport|crashhandler|easyanticheat|eac|battleye|be_service|launcher|activation|patch|update|dotnetfx|touchup|helper|service|cleanup|benchmark)/i;
const AUXILIARY_EXE = /(?:launcher|updater|crashreporter|crashhandler|webhelper|cefprocess|qtwebengineprocess)\.exe$/i;
const MAX_CANDIDATES = 180;

function isFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

function firstExisting(files) {
  return files.find(isFile) || null;
}

function steamCacheRoot(entry) {
  if (entry.launcher !== 'Steam' || !entry.steamRoot || !entry.id) return null;
  return path.join(entry.steamRoot, 'appcache', 'librarycache');
}

function artworkInDirectory(dir, names) {
  const exact = firstExisting(names.map(name => path.join(dir, name)));
  if (exact) return exact;

  // Steam may only cache the active localized asset, e.g.
  // library_capsule_schinese.jpg or library_hero_german.jpg.
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true }).filter(item => item.isFile());
    for (const name of names) {
      const ext = path.extname(name).toLowerCase();
      const stem = path.basename(name, ext).toLowerCase();
      const localized = files
        .map(item => item.name)
        .filter(fileName => {
          const lower = fileName.toLowerCase();
          if (!lower.startsWith(`${stem}_`) || !lower.endsWith(ext)) return false;
          const suffix = lower.slice(stem.length + 1, -ext.length);
          if (!suffix) return false;
          // Do not accidentally substitute blurred or 2x variants for the normal art.
          return !/(^|_)blur($|_)/.test(suffix) && !/(^|_)2x($|_)/.test(suffix);
        })
        .sort((a, b) => a.localeCompare(b))[0];
      if (localized) return path.join(dir, localized);
    }
  } catch {}
  return null;
}

function recursiveSteamArtwork(dir, names, depth = 0) {
  const found = artworkInDirectory(dir, names);
  if (found) return found;
  if (depth >= 3) return null;
  try {
    const dirs = fs.readdirSync(dir, { withFileTypes: true }).filter(item => item.isDirectory());
    for (const child of dirs) {
      const nested = recursiveSteamArtwork(path.join(dir, child.name), names, depth + 1);
      if (nested) return nested;
    }
  } catch {}
  return null;
}

function nestedSteamArtwork(entry, names) {
  const root = steamCacheRoot(entry);
  if (!root) return null;
  const appDir = path.join(root, String(entry.id));

  // Modern Steam library assets are commonly under per-asset SHA1 directories,
  // and localized clients can cache only the localized filename. Preserve the
  // caller's filename priority across the whole tree: for example, a tile must
  // prefer library_header over a hero found in an earlier hash directory.
  for (const name of names) {
    const modern = recursiveSteamArtwork(appDir, [name]);
    if (modern) return modern;
  }

  // Keep compatibility with Steam's older flat librarycache layout.
  return firstExisting(names.map(name => path.join(root, `${entry.id}_${name}`)));
}

function steamBanner(entry) {
  return nestedSteamArtwork(entry, ['library_hero.jpg', 'library_header.jpg', 'header.jpg']);
}

function steamTile(entry) {
  return nestedSteamArtwork(entry, ['library_header.jpg', 'header.jpg', 'library_hero.jpg']);
}

function steamCover(entry) {
  return nestedSteamArtwork(entry, ['library_600x900.jpg', 'library_capsule.jpg']);
}

function steamBannerUrl(entry) {
  if (entry.launcher !== 'Steam' || !entry.id) return null;
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${encodeURIComponent(String(entry.id))}/library_hero.jpg`;
}

function steamTileUrl(entry) {
  if (entry.launcher !== 'Steam' || !entry.id) return null;
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${encodeURIComponent(String(entry.id))}/header.jpg`;
}

function steamCoverUrl(entry) {
  if (entry.launcher !== 'Steam' || !entry.id) return null;
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${encodeURIComponent(String(entry.id))}/library_600x900.jpg`;
}


const LOCAL_ART_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const LOCAL_ART_SKIP_DIRS = new Set([
  'binaries', 'bin', 'bin64', 'engine', 'content', 'paks', 'plugins', 'shaders',
  'thirdparty', 'redist', 'redistributables', '_commonredist', 'saved', 'logs',
  'screenshots', 'movies', 'node_modules', '.git'
]);

function readImageSize(file) {
  let buffer;
  try {
    const fd = fs.openSync(file, 'r');
    const stat = fs.fstatSync(fd);
    buffer = Buffer.alloc(Math.min(stat.size, 64 * 1024));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
  } catch { return null; }

  if (buffer.length >= 24 && buffer.subarray(1, 4).toString('ascii') === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      if (offset + 4 > buffer.length) break;
      const length = buffer.readUInt16BE(offset + 2);
      if (sof.has(marker)) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      if (!length || length < 2) break;
      offset += 2 + length;
    }
  }
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    const type = buffer.subarray(12, 16).toString('ascii');
    if (type === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (type === 'VP8L' && buffer[20] === 0x2f) {
      const b1=buffer[21], b2=buffer[22], b3=buffer[23], b4=buffer[24];
      return { width: 1 + (b1 | ((b2 & 0x3f) << 8)), height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) };
    }
  }
  return null;
}

function localArtworkFiles(root) {
  const queue = [{ dir: path.resolve(root), depth: 0 }];
  const files = [];
  while (queue.length && files.length < 320) {
    const { dir, depth } = queue.shift();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (files.length >= 320) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 4 && !LOCAL_ART_SKIP_DIRS.has(entry.name.toLowerCase())) queue.push({ dir: full, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile() || !LOCAL_ART_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const size = readImageSize(full);
      if (!size || size.width < 280 || size.height < 180) continue;
      files.push({ path: full, name: entry.name.toLowerCase().replace(/[^a-z0-9]+/g, ' '), depth, width: size.width, height: size.height, ratio: size.width / Math.max(1, size.height) });
    }
  }
  return files;
}

function localArtworkScore(file, role) {
  if (/(normal|roughness|metallic|specular|diffuse|albedo|mask|sprite|cursor|achievement|avatar|thumbnail|thumb|logo|icon)/.test(file.name)) return -Infinity;
  const hints = role === 'cover'
    ? [/library 600x900/, /library capsule/, /\bcover\b/, /\bposter\b/, /box ?art/, /key ?art/, /\bportrait\b/]
    : role === 'banner'
      ? [/library hero/, /\bhero\b/, /\bbanner\b/, /\bbackdrop\b/, /\bbackground\b/, /\bsplash\b/, /key ?art/, /\bloading\b/]
      : [/library header/, /\bheader\b/, /\btile\b/, /\blandscape\b/, /\bbanner\b/, /\bcapsule\b/];
  let score = 0;
  hints.forEach((pattern, index) => { if (pattern.test(file.name)) score = Math.max(score, 110 - index * 7); });
  if (role === 'cover') score += file.ratio >= .52 && file.ratio <= .82 ? 62 : (file.ratio < 1 ? 20 : 0);
  else if (role === 'banner') score += file.ratio >= 2.2 && file.ratio <= 4.2 ? 62 : (file.ratio >= 1.55 ? 24 : 0);
  else score += file.ratio >= 1.7 && file.ratio <= 2.5 ? 60 : (file.ratio >= 1.4 ? 22 : 0);
  if (file.width * file.height >= 1200000) score += 12;
  else if (file.width * file.height >= 500000) score += 7;
  return score - file.depth * 5;
}

function localArtworkFor(root) {
  if (!root) return { coverPath: null, bannerPath: null, tilePath: null };
  const files = localArtworkFiles(root);
  const pick = role => files
    .map(file => ({ file, score: localArtworkScore(file, role) }))
    .filter(row => Number.isFinite(row.score) && row.score >= 72)
    .sort((a, b) => b.score - a.score || (b.file.width * b.file.height) - (a.file.width * a.file.height))[0]?.file.path || null;
  return { coverPath: pick('cover'), bannerPath: pick('banner'), tilePath: pick('tile') };
}

function pathDistance(a, b) {
  const aa = path.resolve(a).toLowerCase().split(path.sep).filter(Boolean);
  const bb = path.resolve(b).toLowerCase().split(path.sep).filter(Boolean);
  let common = 0;
  while (common < aa.length && common < bb.length && aa[common] === bb[common]) common += 1;
  return (aa.length - common) + (bb.length - common);
}

async function scanEntry(entry) {
  const exes = [];
  const upscalerFiles = [];
  await gameScan.walkFiles(entry.dir, async (full, name, depth) => {
    if (/^nvngx_dlss\.dll$/i.test(name)) upscalerFiles.push({ path: full, kind: 'dlss' });
    else {
      const kind = gameScan.temporalKindFromName(name);
      if (kind) upscalerFiles.push({ path: full, kind });
    }
    if (!/\.exe$/i.test(name) || NOT_A_GAME_EXE.test(name) || AUXILIARY_EXE.test(name)) return;
    let size = 0;
    try { size = fs.statSync(full).size; } catch {}
    exes.push({ path: full, name, depth, size });
  }, 8);
  return { exes, upscalerFiles };
}

async function candidatesFor(entry) {
  const { exes, upscalerFiles } = await scanEntry(entry);
  const folder = path.basename(entry.dir).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const inspected = [];
  // Inspect likely game binaries first if a folder contains hundreds of tools.
  exes.sort((a, b) => Number(/shipping/i.test(b.name)) - Number(/shipping/i.test(a.name)) || b.size - a.size || a.path.localeCompare(b.path));
  for (const item of exes.slice(0, MAX_CANDIDATES)) {
    await new Promise(resolve => setImmediate(resolve));
    let info = null;
    try { info = gameScan.inspectExecutable(item.path); } catch {}
    const reasons = [];
    const name = path.basename(item.path, '.exe').toLowerCase().replace(/[^a-z0-9]+/g, '');
    let score = item.depth * 7;
    if (info?.bitness === 64) { score -= 36; reasons.push('x64'); }
    if (info?.api) { score -= 38; reasons.push('graphicsApi'); }
    if (/^yysls\.exe$/i.test(item.name)) { score -= 150; reasons.push('knownGame'); }
    if (/(?:win64[-_])?shipping\.exe$/i.test(item.name)) { score -= 45; reasons.push('shipping'); }
    if (folder && name && (name === folder || folder.includes(name) || name.includes(folder))) {
      score -= 22; reasons.push('nameMatch');
    }
    if (item.size > 0) score -= Math.min(18, Math.log2(Math.max(1, item.size / (1024 * 1024))) * 3);
    if (upscalerFiles.length) {
      const nearest = Math.min(...upscalerFiles.map(file => pathDistance(path.dirname(item.path), path.dirname(file.path))));
      score += nearest * 11;
      if (nearest <= 2) {
        const kinds = [...new Set(upscalerFiles
          .filter(file => pathDistance(path.dirname(item.path), path.dirname(file.path)) <= 2)
          .map(file => file.kind))];
        const reasonName = kind => kind === 'dlss' ? 'nearDlss' : `near${kind.toUpperCase()}`;
        reasons.push(...kinds.map(reasonName));
      }
    }
    inspected.push({
      path: item.path, name: item.name, relativePath: path.relative(entry.dir, item.path),
      bitness: info?.bitness || null, apiLabel: info?.apiLabel || null,
      score, reasons, supported: Boolean(info?.bitness === 64 && info?.api)
    });
  }

  inspected.sort((a, b) => {
    if (a.supported !== b.supported) return a.supported ? -1 : 1;
    return a.score - b.score || a.path.length - b.path.length || a.path.localeCompare(b.path);
  });
  return { candidates: inspected, truncated: exes.length > MAX_CANDIDATES, maxDepth: 8 };
}

async function candidateFor(entry) {
  const result = await candidatesFor(entry);
  return result.candidates[0]?.path || null;
}

async function inspectEntry(entry) {
  const exePath = await candidateFor(entry);
  if (!exePath) return null;
  const local = entry.launcher === 'Steam' ? { coverPath: null, bannerPath: null, tilePath: null } : localArtworkFor(entry.dir);
  return {
    exePath,
    displayName: entry.name || path.basename(exePath, path.extname(exePath)),
    launcher: entry.launcher || 'Detected',
    storeId: entry.id || null,
    libraryDir: entry.dir,
    bannerPath: steamBanner(entry) || (entry.poster && entry.poster.tall === false ? entry.poster.file : null) || local.bannerPath || local.tilePath,
    bannerUrl: steamBannerUrl(entry),
    tilePath: steamTile(entry) || (entry.poster && entry.poster.tall === false ? entry.poster.file : null) || local.tilePath || local.bannerPath,
    tileUrl: steamTileUrl(entry),
    coverPath: steamCover(entry) || (entry.poster && entry.poster.tall === true ? entry.poster.file : null) || local.coverPath,
    coverUrl: steamCoverUrl(entry),
    localArtworkScanned: entry.launcher !== 'Steam'
  };
}

async function discoverGames() {
  const result = library.discover([], false);
  const entries = result.games || [];
  const found = [];
  const batchSize = 4;
  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = await Promise.all(entries.slice(index, index + batchSize).map(inspectEntry));
    found.push(...batch.filter(Boolean));
  }
  const seen = new Set();
  return found.filter(item => {
    const key = path.resolve(item.exePath).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  discoverGames,
  candidateFor,
  candidatesFor,
  inspectEntry,
  steamBanner,
  steamTile,
  steamCover,
  steamBannerUrl,
  steamTileUrl,
  steamCoverUrl,
  localArtworkFor,
  readImageSize,
  localArtworkScore,
  pathDistance
};
