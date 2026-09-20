'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pe = require('./derived/pe');

const RUNTIME_NAME = 'nvngx_dlssnr.dll';

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
    if (pe.versionMentions(file, 'NVIDIA')) return true;
    const markers = pe.findMarkers(file, ['NVIDIA', 'nvngx_dlssnr']);
    return markers.has('NVIDIA') || markers.has('nvngx_dlssnr');
  } catch {
    return false;
  }
}

function cacheFile(app) {
  return path.join(app.getPath('userData'), 'runtime', RUNTIME_NAME);
}

function metadataFile(app) {
  return path.join(path.dirname(cacheFile(app)), 'runtime.json');
}

function cache(app, source) {
  if (!looksValid(source)) throw fail('invalidRuntime', 'That file is not a valid 64-bit NVIDIA nvngx_dlssnr.dll runtime.');
  const dest = cacheFile(app);
  const dir = path.dirname(dest);
  const stagingDir = path.join(dir, '.import');
  const staged = path.join(stagingDir, RUNTIME_NAME);
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.copyFileSync(source, staged);
  if (!looksValid(staged)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw fail('invalidRuntime', 'The selected NVIDIA runtime failed validation after copying.');
  }
  fs.rmSync(dest, { force: true });
  fs.renameSync(staged, dest);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  const metadata = {
    file: RUNTIME_NAME,
    sha256: sha256(dest),
    version: pe.getFileVersion(dest),
    importedAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataFile(app), JSON.stringify(metadata, null, 2), 'utf8');
  return dest;
}

function detectCached(app) {
  const cached = cacheFile(app);
  if (looksValid(cached)) return { source: 'cache', path: cached, version: pe.getFileVersion(cached) };
  return null;
}

function detect(app, exePath) {
  const local = path.join(path.dirname(exePath), RUNTIME_NAME);
  if (looksValid(local)) return { source: 'game', path: local, version: pe.getFileVersion(local) };
  return detectCached(app);
}

async function pickAndCache(app, dialog, exePath, language = 'en') {
  const picked = await dialog.showOpenDialog({
    title: language === 'zh-CN' ? '选择 NVIDIA Neural Rendering Runtime' : 'Select NVIDIA Neural Rendering Runtime',
    message: language === 'zh-CN'
      ? '选择可信来源的 nvngx_dlssnr.dll。文件只会在本机验证并缓存。'
      : 'Choose a trusted nvngx_dlssnr.dll. The file is validated and cached locally only.',
    defaultPath: path.dirname(exePath),
    properties: ['openFile'],
    filters: [{ name: 'nvngx_dlssnr.dll', extensions: ['dll'] }]
  });
  if (picked.canceled || !picked.filePaths?.[0]) return null;
  return cache(app, picked.filePaths[0]);
}

async function resolve(app, dialog, exePath, language = 'en') {
  const detected = detect(app, exePath);
  if (detected) return detected.path;
  const imported = await pickAndCache(app, dialog, exePath, language);
  if (!imported) throw fail('runtimeRequired', 'A trusted nvngx_dlssnr.dll is required for Neural Rendering installation.');
  return imported;
}

module.exports = { RUNTIME_NAME, sha256, looksValid, cacheFile, metadataFile, cache, detectCached, detect, pickAndCache, resolve };