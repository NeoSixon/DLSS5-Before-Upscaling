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
  version: '0.8.5',
  packageId: '0.8.5-dlss5mgr30',
  url: 'https://github.com/wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass/releases/download/v0.8.5/OptiScaler-NR-v0.8.5.zip',
  sha256: '2566f5396f25ba3f368de5dcfcc3f7233e3b7e4cab587f6289d141aea0b0d723',
  readme: 'INSTALL-DLSSNR.md'
});

const LIBRARIES = Object.freeze([
  'libxess.dll', 'libxess_dx11.dll', 'libxess_fg.dll', 'libxell.dll',
  'amd_fidelityfx_vk.dll', 'amd_fidelityfx_upscaler_dx12.dll',
  'amd_fidelityfx_loader_dx12.dll', 'amd_fidelityfx_framegeneration_dx12.dll',
  'D3D12_OptiScaler/D3D12Core.dll'
]);

const LICENSES = Object.freeze(['DirectX_LICENSE.txt', 'FidelityFX_v1_LICENSE.md', 'FidelityFX_v2_LICENSE.md', 'RenoDX_ATTRIBUTION.txt', 'XeSS_LICENSE.txt']);
const STYLE_VALUES = new Set(['auto', '0', '1', '2']);

function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function hookFor(api) {
  return api === 'vulkan' ? 'winmm.dll' : 'dxgi.dll';
}

function validatePackage(root) {
  const binaries = ['OptiScaler.dll', ...LIBRARIES.map(file => `OptiScaler/${file}`)];
  for (const rel of binaries) {
    const file = fileState.safePath(root, rel);
    if (pe.getBitness(file) !== 64) throw fail('invalidOptiScalerPackage', `Invalid or missing OptiScaler binary: ${rel}`);
  }
  for (const rel of ['OptiScaler.ini', RELEASE.readme, 'LICENSE', ...LICENSES.map(file => `Licenses/${file}`)]) {
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

  const base = path.join(path.resolve(cacheRoot), 'components', 'OptiScaler-0.8.5-presr');
  const archive = base + '.zip';
  if (!download.cached(archive, RELEASE.sha256)) await download.fetchVerified(RELEASE.url, RELEASE.sha256, archive);
  await fs.promises.rm(base, { recursive: true, force: true });
  await extractZip(archive, { dir: base });

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

function configure(text, target, settings = {}, route = null) {
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
    ['ProcessFilter', 'TargetProcessName', path.basename(target.exePath)],
    ['Inputs', 'EnableDlssInputs', 'true'],
    ['Inputs', 'EnableXeSSInputs', 'true'],
    ['Inputs', 'EnableFsr2Inputs', 'true'],
    ['Inputs', 'UseFsr2Inputs', 'true'],
    ['Inputs', 'EnableFsr3Inputs', 'true'],
    ['Inputs', 'UseFsr3Inputs', 'true'],
    ['Inputs', 'EnableFfxInputs', 'true'],
    ['Inputs', 'UseFfxInputs', 'true'],
    ['Inputs', 'EnableHotSwapping', 'false'],
    ['Inputs', 'Fsr2Pattern', route?.id === 'auto-probe' ? 'true' : 'false'],
    ['Inputs', 'Fsr3Pattern', route?.id === 'auto-probe' ? 'true' : 'false'],
    ['Libraries', 'NvngxDlssPath', ['temporal-presr', 'auto-probe'].includes(route?.id) ? 'nvngx_dlss.dll' : 'auto']
  ];
  for (const [section, key, value] of values) out = ini.set(out, section, key, value);

  for (const [field, value] of [
    ['Dx12Upscaler', 'dlss'],
    ['Dx11Upscaler', 'dlss_12'],
    ['VulkanUpscaler', 'dlss']
  ]) out = ini.set(out, 'Upscalers', field, value);
  return out;
}

function copyPlan(root, api) {
  const plan = [
    ['OptiScaler.dll', hookFor(api)],
    ...LIBRARIES.map(file => [`OptiScaler/${file}`, `OptiScaler/${file}`]),
    ...LICENSES.map(file => [`Licenses/${file}`, `OptiScaler/licenses/${file}`]),
    ['LICENSE', 'OptiScaler/licenses/LICENSE.GPL-3.0.txt'],
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

async function install({ gameDir, exePath, api, apiLabel, packageRoot, runtimePath, srRuntimePath = null, settings, route = null, replaceExisting = false }, onLog) {
  const log = (code, params = {}) => onLog && onLog({ code, params });
  validatePackage(packageRoot);
  if (!runtimePath || !fs.existsSync(runtimePath)) throw fail('runtimeRequired', 'Neural Rendering runtime is missing.');
  const needsManagedSr = ['temporal-presr', 'auto-probe'].includes(route?.id);
  if (needsManagedSr && (!srRuntimePath || !fs.existsSync(srRuntimePath))) {
    throw fail('srRuntimeRequired', 'DLSS Super Resolution runtime is missing for this temporal route.');
  }
  await gameProcess.assertNotRunning(exePath);
  if (!replaceExisting) checkConflicts(gameDir, exePath, api);

  const manifest = fileState.beginManifest(gameDir, exePath, api);
  manifest.optiscaler = {
    version: RELEASE.packageId,
    upstreamVersion: RELEASE.version,
    hook: hookFor(api),
    inputRoute: route?.id || null,
    srRuntimeVersion: needsManagedSr && srRuntimePath ? pe.getFileVersion(srRuntimePath) : null,
    migratedExisting: Boolean(replaceExisting)
  };
  manifest.game.bitness = 64;
  manifest.game.apiLabel = apiLabel || api;
  await fileState.saveManifest(gameDir, manifest);

  const exeDir = path.dirname(exePath);
  try {
    for (const item of copyPlan(packageRoot, api)) {
      const rel = await fileState.copyTracked(manifest, gameDir, item.from, path.join(exeDir, item.to), { kind: 'optiscaler' });
      log('added', { rel });
    }

    if (needsManagedSr) {
      const srTarget = path.join(exeDir, 'nvngx_dlss.dll');
      if (fs.existsSync(srTarget)) {
        log('runtimeKept', { rel: path.relative(gameDir, srTarget) });
      } else {
        const rel = await fileState.copyTracked(manifest, gameDir, srRuntimePath, srTarget, { kind: 'dlss-sr-runtime' });
        log('added', { rel });
      }
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
    await fileState.writeTracked(manifest, gameDir, configFile, configure(baseText, { exePath }, settings, route), { kind: 'config' });
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

async function upgradeManaged({
  gameDir,
  exePath,
  packageRoot,
  runtimePath,
  srRuntimePath = null,
  settings,
  route = null,
  language = 'en'
}, onLog) {
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

  const effectiveRoute = route || (manifest.optiscaler?.inputRoute ? { id: manifest.optiscaler.inputRoute } : null);
  const needsManagedSr = ['temporal-presr', 'auto-probe'].includes(effectiveRoute?.id);
  if (needsManagedSr && (!srRuntimePath || !fs.existsSync(srRuntimePath))) {
    const existingSr = path.join(path.dirname(exePath), 'nvngx_dlss.dll');
    if (!fs.existsSync(existingSr)) {
      throw fail('srRuntimeRequired', 'DLSS Super Resolution runtime is missing for this temporal route.');
    }
  }

  await gameProcess.assertNotRunning(exePath, language);

  const exeDir = path.dirname(exePath);
  const plan = copyPlan(packageRoot, api);
  const runtimeTarget = path.join(exeDir, 'nvngx_dlssnr.dll');
  const srTarget = path.join(exeDir, 'nvngx_dlss.dll');
  const configFile = path.join(exeDir, 'OptiScaler.ini');
  const obsoleteHelper = path.join(exeDir, 'nvngx.dll_dlssnr.dll');
  const obsoleteRel = path.relative(gameDir, obsoleteHelper);
  const obsoleteTracked =
    manifest.added?.some(rel => String(rel).toLowerCase() === obsoleteRel.toLowerCase()) ||
    manifest.replaced?.some(row => String(row.rel).toLowerCase() === obsoleteRel.toLowerCase());
  const targetCandidates = [
    ...plan.map(item => path.join(exeDir, item.to)),
    runtimeTarget,
    configFile,
    ...(needsManagedSr && srRuntimePath && !fs.existsSync(srTarget) ? [srTarget] : []),
    ...(obsoleteTracked ? [obsoleteHelper] : [])
  ];
  const targetByKey = new Map(targetCandidates.map(file => [path.resolve(file).toLowerCase(), path.resolve(file)]));
  const targets = [...targetByKey.values()];
  const snapshot = await snapshotManagedTargets(gameDir, targets);

  try {
    for (const item of plan) {
      const rel = await fileState.copyTracked(manifest, gameDir, item.from, path.join(exeDir, item.to), { kind: 'optiscaler' });
      log('updated', { rel });
    }

    if (needsManagedSr && !fs.existsSync(srTarget) && srRuntimePath) {
      const rel = await fileState.copyTracked(manifest, gameDir, srRuntimePath, srTarget, { kind: 'dlss-sr-runtime' });
      log('added', { rel });
    } else if (needsManagedSr && fs.existsSync(srTarget)) {
      log('runtimeKept', { rel: path.relative(gameDir, srTarget) });
    }

    if (fs.existsSync(runtimeTarget)) {
      log('runtimeKept', { rel: path.relative(gameDir, runtimeTarget) });
    } else {
      const rel = await fileState.copyTracked(manifest, gameDir, runtimePath, runtimeTarget, { kind: 'runtime' });
      log('added', { rel });
    }

    if (obsoleteTracked && fs.existsSync(obsoleteHelper)) {
      await fs.promises.rm(obsoleteHelper, { force: true });
      log('deleted', { rel: obsoleteRel });
    }

    const baseText = ini.read(configFile) || ini.read(path.join(packageRoot, 'OptiScaler.ini'));
    await fileState.writeTracked(manifest, gameDir, configFile, configure(baseText, { exePath }, settings, effectiveRoute), { kind: 'config' });
    manifest.optiscaler = {
      ...manifest.optiscaler,
      version: RELEASE.packageId,
      upstreamVersion: RELEASE.version,
      hook: hookFor(api),
      inputRoute: effectiveRoute?.id || manifest.optiscaler?.inputRoute || null,
      srRuntimeVersion: needsManagedSr && fs.existsSync(srTarget) ? pe.getFileVersion(srTarget) : null,
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
