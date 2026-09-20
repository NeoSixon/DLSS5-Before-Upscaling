'use strict';

const fs = require('fs');
const path = require('path');
const pe = require('./derived/pe');
const fileState = require('./file-state');
const routePlan = require('./route-plan');

const SKIP_DIRS = new Set([
  '_dlss5_backup', 'node_modules', '.git', 'paks', 'movies', 'screenshots', 'saved', 'logs',
  'mods', 'downloads', 'overwrite', 'profiles', '_redist', 'prerequisites', 'directx', 'redist',
  'redistributable', 'redistributables', '_commonredist', 'dotnet', 'installer_resources',
  'installer', 'installers', 'support', 'vcredist', '_support', 'directx_redist',
  'eaanticheat', 'easyanticheat', 'battleye', 'backup', 'backups', '_backup', '_dlss5_backup', 'bak', 'old',
  'original', 'originals', 'optiscaler'
]);

const API_MARKERS = [
  'D3D12CreateDevice', 'D3D12SDKPath', 'D3D12SDKVersion', 'D3D11CreateDevice',
  'CreateDXGIFactory', 'vkCreateInstance', 'wglCreateContext', 'Direct3DCreate9'
];

function apiFromImports(imports) {
  const has = name => imports.includes(name);
  if (has('d3d12.dll')) return { api: 'dxgi', apiLabel: 'DirectX 12' };
  if (has('d3d11.dll')) return { api: 'dxgi', apiLabel: 'DirectX 11' };
  if (has('vulkan-1.dll')) return { api: 'vulkan', apiLabel: 'Vulkan' };
  if (has('d3d9.dll')) return { api: 'd3d9', apiLabel: 'DirectX 9' };
  if (has('dxgi.dll')) return { api: 'dxgi', apiLabel: 'DirectX (DXGI)' };
  if (has('opengl32.dll')) return { api: 'opengl', apiLabel: 'OpenGL' };
  return null;
}

function apiFromMarkers(file) {
  const markers = pe.findMarkers(file, API_MARKERS);
  if (markers.has('D3D12CreateDevice') || markers.has('D3D12SDKPath') || markers.has('D3D12SDKVersion')) {
    return { api: 'dxgi', apiLabel: 'DirectX 12' };
  }
  if (markers.has('D3D11CreateDevice')) return { api: 'dxgi', apiLabel: 'DirectX 11' };
  if (markers.has('CreateDXGIFactory')) return { api: 'dxgi', apiLabel: 'DirectX (DXGI)' };
  if (markers.has('vkCreateInstance')) return { api: 'vulkan', apiLabel: 'Vulkan' };
  if (markers.has('Direct3DCreate9')) return { api: 'd3d9', apiLabel: 'DirectX 9' };
  if (markers.has('wglCreateContext')) return { api: 'opengl', apiLabel: 'OpenGL' };
  return null;
}

function apiFromName(file) {
  const name = path.basename(file).toLowerCase();
  if (/(?:^|[_-])(?:d3d|dx)12(?:[_-]|\.|$)/.test(name)) return { api: 'dxgi', apiLabel: 'DirectX 12' };
  if (/(?:^|[_-])(?:d3d|dx)11(?:[_-]|\.|$)/.test(name)) return { api: 'dxgi', apiLabel: 'DirectX 11' };
  if (/(?:^|[_-])vulkan(?:[_-]|\.|$)/.test(name)) return { api: 'vulkan', apiLabel: 'Vulkan' };
  return null;
}

function inspectExecutable(exePath, profile = null) {
  const resolved = path.resolve(exePath);
  if (!fs.existsSync(resolved)) return null;
  const bitness = profile?.bitness || pe.getBitness(resolved);
  let graphics = profile ? { api: profile.api, apiLabel: profile.apiLabel } : null;
  if (!graphics) graphics = apiFromImports(pe.getImports(resolved));
  if (!graphics || graphics.apiLabel === 'DirectX (DXGI)') graphics = apiFromMarkers(resolved) || graphics;
  if (!graphics) graphics = apiFromName(resolved);
  return {
    path: resolved,
    name: path.basename(resolved),
    bitness,
    api: graphics?.api || null,
    apiLabel: graphics?.apiLabel || null
  };
}

async function walkFiles(root, onFile, maxDepth = 8) {
  const queue = [{ dir: path.resolve(root), depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(entry.name.toLowerCase())) queue.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile()) {
        await onFile(full, entry.name, depth);
      }
    }
  }
}

function distanceFromExe(file, exeDir) {
  const rel = path.relative(exeDir, path.dirname(file));
  if (!rel) return 0;
  const parts = rel.split(path.sep).filter(Boolean);
  const up = parts.filter(part => part === '..').length;
  return up * 20 + parts.length;
}

async function findDlss(exeDir) {
  const found = [];
  await walkFiles(exeDir, async (full, name) => {
    if (!/^nvngx_dlss\.dll$/i.test(name)) return;
    found.push({ path: full, version: pe.getFileVersion(full), distance: distanceFromExe(full, exeDir) });
  }, 6);
  found.sort((a, b) => a.distance - b.distance || a.path.length - b.path.length);
  return found[0] || null;
}

const TEMPORAL_FILE_KIND = Object.freeze([
  [/^libxess(?:_dx11)?\.dll$/i, 'xess'],
  [/^ffx_fsr2.*\.dll$/i, 'fsr2'],
  [/^ffx_fsr3.*\.dll$/i, 'fsr3'],
  [/^amd_fidelityfx_(?:dx12|loader_dx12|upscaler_dx12)\.dll$/i, 'ffx']
]);

const TEMPORAL_MARKERS = Object.freeze({
  xess: ['xessD3D12CreateContext', 'xessGetVersion'],
  fsr2: ['ffxFsr2ContextCreate', 'ffxFsr2ContextDispatch'],
  fsr3: ['ffxFsr3ContextCreate', 'ffxFsr3ContextDispatch'],
  ffx: ['ffxCreateContext', 'ffxDispatch']
});

function temporalKindFromName(name) {
  for (const [pattern, kind] of TEMPORAL_FILE_KIND) {
    if (pattern.test(String(name || ''))) return kind;
  }
  return null;
}

async function findTemporalInputs(exePath) {
  const exeDir = path.dirname(path.resolve(exePath));
  const found = [];
  const seen = new Set();

  const add = (kind, source, file = null) => {
    const key = String(kind || '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    found.push({ kind: key, source, path: file || null, version: file ? pe.getFileVersion(file) : null });
  };

  for (const imported of pe.getImports(exePath)) {
    const kind = temporalKindFromName(imported);
    if (kind) add(kind, 'import');
  }

  const markerNames = Object.values(TEMPORAL_MARKERS).flat();
  const markers = pe.findMarkers(exePath, markerNames);
  for (const [kind, names] of Object.entries(TEMPORAL_MARKERS)) {
    if (names.some(name => markers.has(name))) add(kind, 'marker');
  }

  await walkFiles(exeDir, async (full, name) => {
    const kind = temporalKindFromName(name);
    if (kind) add(kind, 'file', full);
  }, 5);

  return found;
}

function installedInfo(gameDir, chosen) {
  let manifest = null;
  try { manifest = fileState.loadManifest(gameDir); } catch {}
  if (!manifest) return { hasBackup: false, installed: false, optiscaler: null };

  const exeDir = path.dirname(chosen.path);
  const hookName = chosen.api === 'vulkan' ? 'winmm.dll' : 'dxgi.dll';
  const hook = path.join(exeDir, hookName);
  const required = [
    hook,
    path.join(exeDir, 'OptiScaler.ini')
  ];
  const installed = required.every(file => fs.existsSync(file));
  const srRel = path.relative(gameDir, path.join(exeDir, 'nvngx_dlss.dll'));
  const managedSr =
    manifest.added?.some(rel => String(rel).toLowerCase() === srRel.toLowerCase()) ||
    manifest.replaced?.some(row => String(row.rel).toLowerCase() === srRel.toLowerCase());
  return {
    hasBackup: true,
    installed,
    managedSr,
    optiscaler: manifest.optiscaler || (manifest.route === 'optiscaler' ? { version: 'unknown', hook: hookName } : null)
  };
}

async function inspect(exePath, profile = null) {
  const chosen = inspectExecutable(exePath, profile);
  const gameDir = path.dirname(path.resolve(exePath));
  if (!chosen) {
    return { gameDir, chosen: null, dlss: null, upscalerInputs: [], route: routePlan.chooseRoute(), hasBackup: fileState.hasBackup(gameDir), installed: false, optiscaler: null };
  }
  const [dlss, upscalerInputs] = await Promise.all([
    findDlss(path.dirname(chosen.path)),
    findTemporalInputs(chosen.path)
  ]);
  const install = installedInfo(gameDir, chosen);
  const detectedRoute = routePlan.chooseRoute({
    chosen,
    dlss: install.managedSr ? null : dlss,
    upscalerInputs
  });
  let route = detectedRoute;
  const storedRoute = install.optiscaler?.inputRoute;
  if (storedRoute && ['native-presr', 'temporal-presr', 'auto-probe'].includes(storedRoute)) {
    route = {
      ...detectedRoute,
      id: storedRoute,
      ready: storedRoute === 'auto-probe' ? detectedRoute.ready : true,
      installable: true,
      source: storedRoute === 'native-presr' ? 'dlss' : (upscalerInputs[0]?.kind || null)
    };
  }
  return { gameDir, chosen, dlss, upscalerInputs, route, ...install };
}

module.exports = { inspect, inspectExecutable, findDlss, findTemporalInputs, temporalKindFromName, apiFromImports, apiFromMarkers, walkFiles };