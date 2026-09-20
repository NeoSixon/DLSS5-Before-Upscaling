'use strict';

// The manifest format intentionally stays compatible with DLSS5-Swapper's
// OptiScaler route so an installation created during migration can still be
// restored after the standalone app becomes its own repository.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKUP_DIR = '_DLSS5_Backup';
const MANIFEST = 'manifest.json';

function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function rootFor(gameDir) {
  return path.join(path.resolve(gameDir), BACKUP_DIR);
}

function safePath(root, rel) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, String(rel || ''));
  const relative = path.relative(base, resolved);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) return resolved;
  throw fail('unsafePath', `Path escapes managed root: ${rel}`);
}

function relKey(rel) {
  return path.normalize(String(rel)).toLowerCase();
}

function backupPath(gameDir, manifest, rel) {
  const prefix = String(manifest.backupPrefix || '');
  if (!/^originals\/[a-f0-9-]+$/i.test(prefix)) throw fail('invalidBackup', 'Invalid backup prefix');
  return safePath(rootFor(gameDir), path.join(prefix, rel));
}

function manifestPath(gameDir) {
  return path.join(rootFor(gameDir), MANIFEST);
}

function loadManifest(gameDir) {
  const file = manifestPath(gameDir);
  if (!fs.existsSync(file)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.replaced) || !Array.isArray(manifest.added)) {
      throw fail('invalidBackup', 'Invalid backup manifest');
    }
    return manifest;
  } catch (error) {
    if (error.code) throw error;
    throw fail('invalidBackup', 'Backup manifest could not be read');
  }
}

function beginManifest(gameDir, exePath, api) {
  if (fs.existsSync(manifestPath(gameDir))) throw fail('alreadyInstalled', 'A managed installation already exists. Restore originals first.');
  return {
    version: 1,
    backupPrefix: `originals/${crypto.randomUUID()}`,
    date: new Date().toISOString(),
    game: { dir: path.resolve(gameDir), exe: path.relative(gameDir, exePath), api },
    route: 'optiscaler',
    replaced: [],
    added: [],
    addedDirs: [],
    reshade: { installedByUs: false, file: null, filesAdded: [] }
  };
}

async function atomicJson(file, value) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  await fs.promises.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.promises.rename(temp, file);
}

async function saveManifest(gameDir, manifest) {
  await atomicJson(manifestPath(gameDir), manifest);
}

function rememberAdded(manifest, rel) {
  if (!manifest.added.some(item => relKey(item) === relKey(rel))) manifest.added.push(rel);
}

function rememberAddedDir(manifest, rel) {
  if (!manifest.addedDirs.some(item => relKey(item) === relKey(rel))) manifest.addedDirs.push(rel);
}

function rememberReplacement(manifest, row) {
  if (manifest.added.some(item => relKey(item) === relKey(row.rel))) return;
  const existing = manifest.replaced.find(item => relKey(item.rel) === relKey(row.rel));
  if (existing) {
    if (row.newVersion !== undefined) existing.newVersion = row.newVersion;
    if (row.kind && !existing.kind) existing.kind = row.kind;
    return;
  }
  manifest.replaced.push(row);
}

function rememberMissingParents(manifest, gameDir, target) {
  const root = path.resolve(gameDir);
  const missing = [];
  let cursor = path.dirname(path.resolve(target));
  while (cursor.toLowerCase() !== root.toLowerCase()) {
    const rel = path.relative(root, cursor);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) break;
    if (!fs.existsSync(cursor)) missing.push(rel);
    cursor = path.dirname(cursor);
  }
  for (const rel of missing.reverse()) rememberAddedDir(manifest, rel);
}

async function copyFileWritable(source, target) {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.copyFile(source, target);
  try { await fs.promises.chmod(target, 0o666); } catch {}
}

async function trackDestination(manifest, gameDir, target, meta = {}) {
  const absolute = safePath(gameDir, path.relative(gameDir, target));
  const rel = path.relative(gameDir, absolute);
  rememberMissingParents(manifest, gameDir, absolute);

  if (fs.existsSync(absolute)) {
    const addedByUs = manifest.added.some(item => relKey(item) === relKey(rel));
    if (!addedByUs) {
      const original = backupPath(gameDir, manifest, rel);
      if (!fs.existsSync(original)) await copyFileWritable(absolute, original);
      rememberReplacement(manifest, { rel, kind: meta.kind || null, oldVersion: meta.oldVersion || null, newVersion: meta.newVersion || null });
    }
  } else {
    rememberAdded(manifest, rel);
  }

  // Persist the intent before modifying the target. If the process stops during
  // the following write, Restore Originals still knows what must be undone.
  await saveManifest(gameDir, manifest);
  return { absolute, rel };
}

async function copyTracked(manifest, gameDir, source, target, meta = {}) {
  const tracked = await trackDestination(manifest, gameDir, target, meta);
  await copyFileWritable(source, tracked.absolute);
  return tracked.rel;
}

async function writeTracked(manifest, gameDir, target, text, meta = {}) {
  const tracked = await trackDestination(manifest, gameDir, target, meta);
  await fs.promises.mkdir(path.dirname(tracked.absolute), { recursive: true });
  const temp = tracked.absolute + '.tmp';
  await fs.promises.writeFile(temp, text, 'utf8');
  await fs.promises.rename(temp, tracked.absolute);
  return tracked.rel;
}

function hasBackup(gameDir) {
  return fs.existsSync(manifestPath(gameDir));
}

async function restore(gameDir, onLog) {
  const log = (code, params = {}) => onLog && onLog({ code, params });
  const manifest = loadManifest(gameDir);
  if (!manifest) throw fail('noBackup', 'No managed backup exists for this game.');

  // Validate all backup sources before changing the game directory.
  for (const item of manifest.replaced) {
    safePath(gameDir, item.rel);
    const original = backupPath(gameDir, manifest, item.rel);
    if (!fs.existsSync(original)) throw fail('invalidBackup', `Missing original backup: ${item.rel}`);
  }
  for (const rel of manifest.added) safePath(gameDir, rel);
  for (const rel of manifest.addedDirs || []) safePath(gameDir, rel);

  for (const item of manifest.replaced) {
    const original = backupPath(gameDir, manifest, item.rel);
    const target = safePath(gameDir, item.rel);
    await copyFileWritable(original, target);
    log('restored', { rel: item.rel });
  }

  for (const rel of manifest.added) {
    const target = safePath(gameDir, rel);
    if (!fs.existsSync(target)) continue;
    const stat = await fs.promises.stat(target);
    if (!stat.isFile()) continue;
    await fs.promises.unlink(target);
    log('deleted', { rel });
  }

  for (const rel of [...(manifest.addedDirs || [])].sort((a, b) => b.length - a.length)) {
    const target = safePath(gameDir, rel);
    try {
      await fs.promises.rmdir(target);
      log('deletedDir', { rel });
    } catch {}
  }

  const active = manifestPath(gameDir);
  await fs.promises.rename(active, active + `.done-${Date.now()}`);
  log('restoreDone', { date: manifest.date, route: manifest.route });
  return true;
}

module.exports = {
  BACKUP_DIR,
  MANIFEST,
  rootFor,
  manifestPath,
  safePath,
  backupPath,
  loadManifest,
  beginManifest,
  saveManifest,
  copyTracked,
  writeTracked,
  hasBackup,
  restore
};