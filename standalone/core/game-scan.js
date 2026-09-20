'use strict';

const fs = require('fs');
const path = require('path');
const pe = require('./derived/pe');
const fileState = require('./file-state');

const SKIP_DIRS = new Set([
  '_dlss5_backup', 'node_modules', '.git', 'paks', 'movies', 'screenshots', 'saved', 'logs',
  'mods', 'downloads', 'overwrite', 'profiles', '_redist', 'prerequisites', 'directx', 'redist',
  'redistributable', 'redistributables', '_commonredist', 'dotnet', 'installer_resources',
  'installer', 'installers', 'support', 'vcredist', '_support', 'directx_redist',
  'eaanticheat', 'easyanticheat', 'battleye', 'backup', 'backups', '_backup', 'bak', 'old',
  'original', 'originals'
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

function installedInfo(gameDir, chosen) {
  let manifest = null;
  try { manifest = fileState.loadManifest(gameDir); } catch {}
  if (!manifest) return { hasBackup: false, installed: false, optiscaler: null };

  const exeDir = path.dirname(chosen.path);
  const hookName = chosen.api === 'vulkan' ? 'winmm.dll' : 'dxgi.dll';
  const hook = path.join(exeDir, hookName);
  const required = [
    hook,
    path.join(exeDir, 'OptiScaler.ini'),
    path.join(exeDir, 'nvngx.dll_dlssnr.dll')
  ];
  const installed = required.every(file => fs.existsSync(file));
  return {
    hasBackup: true,
    installed,
    optiscaler: manifest.optiscaler || (manifest.route === 'optiscaler' ? { version: 'unknown', hook: hookName } : null)
  };
}

async function inspect(exePath, profile = null) {
  const chosen = inspectExecutable(exePath, profile);
  const gameDir = path.dirname(path.resolve(exePath));
  if (!chosen) {
    return { gameDir, chosen: null, dlss: null, hasBackup: fileState.hasBackup(gameDir), installed: false, optiscaler: null };
  }
  const dlss = await findDlss(path.dirname(chosen.path));
  const install = installedInfo(gameDir, chosen);
  return { gameDir, chosen, dlss, ...install };
}

module.exports = { inspect, inspectExecutable, findDlss, apiFromImports, apiFromMarkers, walkFiles };