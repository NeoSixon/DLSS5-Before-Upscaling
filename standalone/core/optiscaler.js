'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const extractZip = require('extract-zip');
const pe = require('./derived/pe');
const ini = require('./ini');
const download = require('./download');
const fileState = require('./file-state');
const gameProcess = require('./game-process');

const RELEASE = Object.freeze({
  version: '0.7.7',
  packageId: '0.7.7-dlss5mgr26',
  url: 'https://github.com/wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass/releases/download/v0.7.7/OptiScaler-DLSSNR-v0.7.7.zip',
  sha256: '4a315a3b3ee495631bd7cb1f562f609af577443602e507bfc7a7e6749c296258',
  readme: 'INSTALL-DLSSNR.md',
  licenseUrl: 'https://raw.githubusercontent.com/Dagherbou/OptiScaler_DLSSNR/393e070/LICENSE',
  licenseSha256: '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'
});

const LIBRARIES = Object.freeze([
  'libxess.dll', 'libxess_dx11.dll', 'libxess_fg.dll', 'libxell.dll',
  'amd_fidelityfx_vk.dll', 'amd_fidelityfx_upscaler_dx12.dll',
  'amd_fidelityfx_loader_dx12.dll', 'amd_fidelityfx_framegeneration_dx12.dll',
  'D3D12_OptiScaler/D3D12Core.dll'
]);

const LICENSES = Object.freeze(['DirectX_LICENSE.txt', 'FidelityFX_v2_LICENSE.md', 'RenoDX_ATTRIBUTION.txt', 'XeSS_LICENSE.txt']);
const STYLE_VALUES = new Set(['auto', '0', '1', '2']);

function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function hookFor(api) {
  return api === 'vulkan' ? 'winmm.dll' : 'dxgi.dll';
}

function validatePackage(root) {
  const binaries = ['OptiScaler.dll', 'nvngx.dll_dlssnr.dll', ...LIBRARIES.map(file => `OptiScaler/${file}`)];
  for (const rel of binaries) {
    const file = fileState.safePath(root, rel);
    if (pe.getBitness(file) !== 64) throw fail('invalidOptiScalerPackage', `Invalid or missing OptiScaler binary: ${rel}`);
  }
  for (const rel of ['OptiScaler.ini', RELEASE.readme, ...LICENSES.map(file => `Licenses/${file}`)]) {
    if (!fs.existsSync(fileState.safePath(root, rel))) throw fail('invalidOptiScalerPackage', `Missing OptiScaler package file: ${rel}`);
  }
  return true;
}

function bundledPackageRoot() {
  const root = path.join(__dirname, '..', 'backend-payload');
  try {
    if (fs.existsSync(path.join(root, 'OptiScaler.dll'))) {
      validatePackage(root);
      return root;
    }
  } catch {}
  return null;
}

async function ensurePackage(cacheRoot) {
  const bundled = bundledPackageRoot();
  if (bundled) return bundled;

  const base = path.join(path.resolve(cacheRoot), 'components', 'OptiScaler-0.7.7-presr');
  const archive = base + '.zip';
  if (!download.cached(archive, RELEASE.sha256)) await download.fetchVerified(RELEASE.url, RELEASE.sha256, archive);
  await fs.promises.rm(base, { recursive: true, force: true });
  await extractZip(archive, { dir: base });

  const license = path.join(base, 'OptiScaler-GPL-3.0.txt');
  if (!download.cached(license, RELEASE.licenseSha256)) {
    await download.fetchVerified(RELEASE.licenseUrl, RELEASE.licenseSha256, license);
  }
  validatePackage(base);
  return base;
}

function styleValue(settings, key) {
  const value = String(settings?.[key] ?? 'auto').toLowerCase();
  if (!STYLE_VALUES.has(value)) throw fail('invalidStyle', `Invalid Neural Rendering style: ${value}`);
  return value;
}

function primaryStyleValue(settings, key) {
  const value = styleValue(settings, key);
  return value === 'auto' ? '0' : value;
}

function concreteStyleValue(settings, key, fallback = '0') {
  const value = styleValue(settings, key);
  return value === 'auto' ? fallback : value;
}

function configure(text, target, settings = {}) {
  const passes = Number(settings.passes || 1);
  if (!Number.isInteger(passes) || passes < 1 || passes > 3) throw fail('invalidPasses', 'Passes must be 1, 2, or 3.');
  const runBeforeSR = settings.runBeforeSR !== false;
  let out = String(text || '');
  const pass1Style = primaryStyleValue(settings, 'pass1Style');
  const values = [
    ['DlssNr', 'Enabled', settings.enabled === false ? 'false' : 'true'],
    ['DlssNr', 'RunBeforeSR', runBeforeSR ? 'true' : 'false'],
    ['DlssNr', 'FinishedPicture', 'false'],
    ['DlssNr', 'Passes', String(passes)],
    ['DlssNr', 'WorkingScale', '1.0'],
    ['DlssNr', 'Style', pass1Style],
    ['DlssNr', 'Pass2Style', concreteStyleValue(settings, 'pass2Style', pass1Style)],
    ['DlssNr', 'Pass3Style', concreteStyleValue(settings, 'pass3Style', pass1Style)],
    ['Menu', 'ShortcutKey', '45'],
    ['Menu', 'Scale', '1.00'],
    ['Menu', 'BGColorA', '0.82'],
    // Keep the performance overlay alpha aligned for older manager builds.
    ['Menu', 'FpsOverlayAlpha', '0.82'],
    ['Menu', 'FpsOverlayPos', '1'],
    ['Menu', 'DisableSplash', 'true'],
    ['Menu', 'OverlayMenu', 'true'],
    // This fork documents ManualInputPolling as the fallback for games where the
    // menu is visible but the normal window/input queue never reaches ImGui. It
    // also avoids relying on OptiScaler to block game input while our compact menu
    // is open, which is safer for titles that stall during loading transitions.
    ['Hotfix', 'ManualInputPolling', 'true'],
    // The manager pins and builds its own backend revision; the upstream OptiScaler
    // update banner is therefore misleading inside a managed installation.
    ['Hotfix', 'CheckForUpdate', 'false'],
    ['Log', 'LogToFile', 'true'],
    ['Log', 'LogLevel', '2'],
    ['Spoofing', 'Dxgi', 'false'],
    ['Plugins', 'LoadAsiPlugins', 'false'],
    ['ProcessFilter', 'TargetProcessName', path.basename(target.exePath)]
  ];
  for (const [section, key, value] of values) out = ini.set(out, section, key, value);

  for (const [field, fallback] of [
    ['Dx12Upscaler', 'dlss'],
    ['Dx11Upscaler', 'ffx_12'],
    ['VulkanUpscaler', 'ffx_12']
  ]) {
    const current = ini.get(out, 'Upscalers', field);
    if (!current || current === 'auto') out = ini.set(out, 'Upscalers', field, fallback);
  }
  return out;
}

function copyPlan(root, api) {
  const plan = [
    ['OptiScaler.dll', hookFor(api)],
    ['nvngx.dll_dlssnr.dll', 'nvngx.dll_dlssnr.dll'],
    ...LIBRARIES.map(file => [`OptiScaler/${file}`, `OptiScaler/${file}`]),
    ...LICENSES.map(file => [`Licenses/${file}`, `OptiScaler/licenses/${file}`]),
    ['OptiScaler-GPL-3.0.txt', 'OptiScaler/licenses/LICENSE.GPL-3.0.txt'],
    [RELEASE.readme, 'OptiScaler/README-DLSSNR.txt']
  ];
  if (fs.existsSync(path.join(root, 'DLSS5-MANAGER-BACKEND.txt'))) {
    plan.push(['DLSS5-MANAGER-BACKEND.txt', 'OptiScaler/DLSS5-MANAGER-BACKEND.txt']);
  }
  return plan.map(([from, to]) => ({ from: fileState.safePath(root, from), to }));
}

function checkConflicts(gameDir, exePath, api) {
  const exeDir = path.dirname(exePath);
  const hook = hookFor(api);
  const watched = [hook, 'OptiScaler.ini', 'nvngx_dlssnr.dll'];
  for (const name of watched) {
    const file = path.join(exeDir, name);
    if (!fs.existsSync(file)) continue;
    throw fail('installConflict', `Conflicting pre-existing file: ${file}. Remove or restore the existing graphics mod with its own installer first.`);
  }
  const optiDir = path.join(exeDir, 'OptiScaler');
  if (fs.existsSync(optiDir)) throw fail('installConflict', `Conflicting pre-existing OptiScaler folder: ${optiDir}`);
}

async function install({ gameDir, exePath, api, apiLabel, packageRoot, runtimePath, settings, replaceExisting = false }, onLog) {
  const log = (code, params = {}) => onLog && onLog({ code, params });
  validatePackage(packageRoot);
  if (!runtimePath || !fs.existsSync(runtimePath)) throw fail('runtimeRequired', 'Neural Rendering runtime is missing.');
  await gameProcess.assertNotRunning(exePath);
  if (!replaceExisting) checkConflicts(gameDir, exePath, api);

  const manifest = fileState.beginManifest(gameDir, exePath, api);
  manifest.optiscaler = { version: RELEASE.packageId, upstreamVersion: RELEASE.version, hook: hookFor(api), migratedExisting: Boolean(replaceExisting) };
  manifest.game.bitness = 64;
  manifest.game.apiLabel = apiLabel || api;
  await fileState.saveManifest(gameDir, manifest);

  const exeDir = path.dirname(exePath);
  try {
    for (const item of copyPlan(packageRoot, api)) {
      const rel = await fileState.copyTracked(manifest, gameDir, item.from, path.join(exeDir, item.to), { kind: 'optiscaler' });
      log('added', { rel });
    }

    const runtimeTarget = path.join(exeDir, 'nvngx_dlssnr.dll');
    if (fs.existsSync(runtimeTarget)) {
      log('runtimeKept', { rel: path.relative(gameDir, runtimeTarget) });
    } else {
      const rel = await fileState.copyTracked(manifest, gameDir, runtimePath, runtimeTarget, { kind: 'runtime' });
      log('added', { rel });
    }

    const configFile = path.join(exeDir, 'OptiScaler.ini');
    const baseText = ini.read(configFile) || ini.read(path.join(packageRoot, 'OptiScaler.ini'));
    await fileState.writeTracked(manifest, gameDir, configFile, configure(baseText, { exePath }, settings), { kind: 'config' });
    await fileState.saveManifest(gameDir, manifest);
    log(replaceExisting ? 'migrationDone' : 'installDone', { version: RELEASE.packageId });
    return manifest;
  } catch (error) {
    try { await fileState.saveManifest(gameDir, manifest); } catch {}
    throw error;
  }
}

async function snapshotManagedTargets(gameDir, targets) {
  const root = path.join(fileState.rootFor(gameDir), `update-stage-${crypto.randomUUID()}`);
  await fs.promises.mkdir(root, { recursive: true });
  const rows = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = path.resolve(targets[index]);
    const existed = fs.existsSync(target) && (await fs.promises.stat(target)).isFile();
    const snapshot = path.join(root, `${String(index).padStart(3, '0')}.bak`);
    if (existed) await fs.promises.copyFile(target, snapshot);
    rows.push({ target, existed, snapshot: existed ? snapshot : null });
  }
  return { root, rows };
}

async function rollbackManagedTargets(snapshot) {
  for (const row of snapshot.rows) {
    if (row.existed) {
      await fs.promises.mkdir(path.dirname(row.target), { recursive: true });
      await fs.promises.copyFile(row.snapshot, row.target);
    } else {
      await fs.promises.rm(row.target, { force: true });
    }
  }
}

async function upgradeManaged({ gameDir, exePath, packageRoot, runtimePath, settings, language = 'en' }, onLog) {
  const log = (code, params = {}) => onLog && onLog({ code, params });
  validatePackage(packageRoot);
  const manifest = fileState.loadManifest(gameDir);
  if (!manifest?.optiscaler || manifest.route !== 'optiscaler') {
    throw fail('notManaged', 'This game does not have a managed OptiScaler installation to update.');
  }
  const manifestBefore = JSON.parse(JSON.stringify(manifest));
  const api = manifest.game?.api;
  if (!api) throw fail('invalidBackup', 'The managed installation does not record its rendering API.');
  if (manifest.optiscaler.version === RELEASE.packageId) return manifest;
  if (!runtimePath || !fs.existsSync(runtimePath)) throw fail('runtimeRequired', 'Neural Rendering runtime is missing.');

  await gameProcess.assertNotRunning(exePath, language);

  const exeDir = path.dirname(exePath);
  const plan = copyPlan(packageRoot, api);
  const runtimeTarget = path.join(exeDir, 'nvngx_dlssnr.dll');
  const configFile = path.join(exeDir, 'OptiScaler.ini');
  const targets = [...new Set([
    ...plan.map(item => path.join(exeDir, item.to)),
    runtimeTarget,
    configFile
  ].map(file => path.resolve(file).toLowerCase()))].map(lower => {
    const match = [...plan.map(item => path.join(exeDir, item.to)), runtimeTarget, configFile]
      .find(file => path.resolve(file).toLowerCase() === lower);
    return path.resolve(match);
  });
  const snapshot = await snapshotManagedTargets(gameDir, targets);

  try {
    for (const item of plan) {
      const rel = await fileState.copyTracked(manifest, gameDir, item.from, path.join(exeDir, item.to), { kind: 'optiscaler' });
      log('updated', { rel });
    }

    if (fs.existsSync(runtimeTarget)) {
      log('runtimeKept', { rel: path.relative(gameDir, runtimeTarget) });
    } else {
      const rel = await fileState.copyTracked(manifest, gameDir, runtimePath, runtimeTarget, { kind: 'runtime' });
      log('added', { rel });
    }

    const baseText = ini.read(configFile) || ini.read(path.join(packageRoot, 'OptiScaler.ini'));
    await fileState.writeTracked(manifest, gameDir, configFile, configure(baseText, { exePath }, settings), { kind: 'config' });
    manifest.optiscaler = {
      ...manifest.optiscaler,
      version: RELEASE.packageId,
      upstreamVersion: RELEASE.version,
      hook: hookFor(api),
      updatedAt: new Date().toISOString()
    };
    await fileState.saveManifest(gameDir, manifest);
    await fs.promises.rm(snapshot.root, { recursive: true, force: true });
    log('backendUpdateDone', { fromVersion: manifestBefore.optiscaler.version, version: RELEASE.packageId });
    return manifest;
  } catch (error) {
    try { await rollbackManagedTargets(snapshot); } catch {}
    try { await fileState.saveManifest(gameDir, manifestBefore); } catch {}
    try { await fs.promises.rm(snapshot.root, { recursive: true, force: true }); } catch {}
    throw error;
  }
}

function updateSettings(exePath, settings) {
  const file = path.join(path.dirname(exePath), 'OptiScaler.ini');
  if (!fs.existsSync(file)) return false;
  const text = configure(ini.read(file), { exePath }, settings);
  fs.writeFileSync(file, text, 'utf8');
  return true;
}

module.exports = {
  RELEASE,
  LIBRARIES,
  LICENSES,
  hookFor,
  validatePackage,
  bundledPackageRoot,
  ensurePackage,
  configure,
  copyPlan,
  checkConflicts,
  install,
  snapshotManagedTargets,
  rollbackManagedTargets,
  upgradeManaged,
  updateSettings
};
