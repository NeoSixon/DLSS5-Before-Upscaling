'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pe = require('./derived/pe');
const gameScan = require('./game-scan');

const RUNTIME_NAME = 'nvngx_dlss.dll';

function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function looksValid(file) {
  try {
    if (!file || !fs.statSync(file).isFile()) return false;
    if (path.basename(file).toLowerCase() !== RUNTIME_NAME) return false;
    if (fs.statSync(file).size < 1024 * 1024) return false;
    if (pe.getBitness(file) !== 64) return false;
    const markers = pe.findMarkers(file, [
      'NVSDK_NGX_D3D12_CreateFeature',
      'NVSDK_NGX_D3D12_EvaluateFeature',
      'NVSDK_NGX_GetSnippetVersion',
      'nvngx_dlss'
    ]);
    return markers.has('NVSDK_NGX_D3D12_CreateFeature') ||
      markers.has('NVSDK_NGX_D3D12_EvaluateFeature') ||
      markers.has('NVSDK_NGX_GetSnippetVersion') ||
      markers.has('nvngx_dlss');
  } catch {
    return false;
  }
}

function cacheFile(app) {
  return path.join(app.getPath('userData'), 'runtime', 'dlss-sr', RUNTIME_NAME);
}

function metadataFile(app) {
  return path.join(path.dirname(cacheFile(app)), 'runtime.json');
}

function cache(app, source, discoveredFrom = null) {
  if (!looksValid(source)) throw fail('invalidSrRuntime', 'That file is not a valid 64-bit NVIDIA nvngx_dlss.dll runtime.');
  const dest = cacheFile(app);
  const dir = path.dirname(dest);
  const stagingDir = path.join(dir, '.import');
  const staged = path.join(stagingDir, RUNTIME_NAME);
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.copyFileSync(source, staged);
  if (!looksValid(staged)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw fail('invalidSrRuntime', 'The selected DLSS Super Resolution runtime failed validation after copying.');
  }
  fs.rmSync(dest, { force: true });
  fs.renameSync(staged, dest);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  const metadata = {
    file: RUNTIME_NAME,
    sha256: sha256(dest),
    version: pe.getFileVersion(dest),
    importedAt: new Date().toISOString(),
    discoveredFrom: discoveredFrom || null
  };
  fs.writeFileSync(metadataFile(app), JSON.stringify(metadata, null, 2), 'utf8');
  return dest;
}

function detectCached(app) {
  const file = cacheFile(app);
  if (!looksValid(file)) return null;
  return { source: 'cache', path: file, version: pe.getFileVersion(file), sha256: sha256(file) };
}

function versionParts(value) {
  return String(value || '').match(/\d+/g)?.map(Number) || [];
}

function compareVersions(a, b) {
  const aa = versionParts(a);
  const bb = versionParts(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (aa[i] || 0) - (bb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

async function discover(records = [], excludeExePath = null) {
  const exclude = excludeExePath ? path.resolve(excludeExePath).toLowerCase() : null;
  const candidates = [];
  const seen = new Set();

  for (const record of records) {
    if (!record?.exePath) continue;
    const exe = path.resolve(record.exePath);
    if (exclude && exe.toLowerCase() === exclude) continue;
    let found = null;
    try { found = await gameScan.findDlss(path.dirname(exe)); } catch {}
    if (!found?.path || !looksValid(found.path)) continue;
    const key = path.resolve(found.path).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ path: found.path, version: found.version || pe.getFileVersion(found.path), exePath: exe });
  }

  candidates.sort((a, b) => compareVersions(b.version, a.version) || a.path.length - b.path.length);
  return candidates[0] || null;
}

async function discoverAndCache(app, records, excludeExePath = null) {
  const found = await discover(records, excludeExePath);
  if (!found) return null;
  return cache(app, found.path, found.exePath);
}

async function pickAndCache(app, dialog, exePath, language = 'en') {
  const picked = await dialog.showOpenDialog({
    title: language === 'zh-CN' ? '选择 NVIDIA DLSS Super Resolution Runtime' : 'Select NVIDIA DLSS Super Resolution Runtime',
    message: language === 'zh-CN'
      ? '选择可信来源的 nvngx_dlss.dll。应用只会在本机验证并缓存，用于给 FSR/XeSS 游戏提供 DLSS 超分。'
      : 'Choose a trusted nvngx_dlss.dll. It is validated and cached locally for games that need managed DLSS Super Resolution.',
    defaultPath: path.dirname(exePath),
    properties: ['openFile'],
    filters: [{ name: 'nvngx_dlss.dll', extensions: ['dll'] }]
  });
  if (picked.canceled || !picked.filePaths?.[0]) return null;
  return cache(app, picked.filePaths[0], 'manual');
}

async function resolve(app, dialog, records, exePath, language = 'en') {
  const cached = detectCached(app);
  if (cached) return cached.path;

  const discovered = await discoverAndCache(app, records, exePath);
  if (discovered) return discovered;

  const imported = await pickAndCache(app, dialog, exePath, language);
  if (!imported) {
    throw fail(
      'srRuntimeRequired',
      'A trusted nvngx_dlss.dll is required to add DLSS Super Resolution to a game that does not ship DLSS.'
    );
  }
  return imported;
}

module.exports = {
  RUNTIME_NAME,
  sha256,
  looksValid,
  cacheFile,
  metadataFile,
  cache,
  detectCached,
  versionParts,
  compareVersions,
  discover,
  discoverAndCache,
  pickAndCache,
  resolve
};
