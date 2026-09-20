'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ROUTE_IDS, chooseRoute } = require('../standalone/core/route-plan');
const scan = require('../standalone/core/game-scan');

const dx12 = { api: 'dxgi', apiLabel: 'DirectX 12', bitness: 64 };
const vk = { api: 'vulkan', apiLabel: 'Vulkan', bitness: 64 };

test('native DLSS is the highest-priority Pre-SR route', () => {
  const route = chooseRoute({
    chosen: dx12,
    dlss: { path: 'nvngx_dlss.dll', version: '310.9.0' },
    upscalerInputs: [{ kind: 'fsr2' }]
  });
  assert.equal(route.id, ROUTE_IDS.NATIVE);
  assert.equal(route.ready, true);
  assert.equal(route.installable, true);
  assert.equal(route.source, 'dlss');
});

test('FSR and XeSS games route temporal inputs to managed DLSS', () => {
  for (const kind of ['xess', 'fsr2', 'fsr3', 'ffx']) {
    const route = chooseRoute({ chosen: dx12, dlss: null, upscalerInputs: [{ kind }] });
    assert.equal(route.id, ROUTE_IDS.TEMPORAL);
    assert.equal(route.ready, true);
    assert.equal(route.installable, true);
    assert.equal(route.source, kind);
  }
});

test('unknown 64-bit DXGI/Vulkan games get an experimental pattern-probe route', () => {
  for (const chosen of [dx12, vk]) {
    const route = chooseRoute({ chosen, dlss: null, upscalerInputs: [] });
    assert.equal(route.id, ROUTE_IDS.PROBE);
    assert.equal(route.ready, false);
    assert.equal(route.installable, true);
  }
});

test('32-bit and unsupported APIs are not offered the in-process route', () => {
  assert.equal(chooseRoute({ chosen: { ...dx12, bitness: 32 } }).installable, false);
  assert.equal(chooseRoute({ chosen: { api: 'opengl', bitness: 64 } }).installable, false);
});

test('temporal provider filenames cover common XeSS FSR and FidelityFX DLLs', () => {
  assert.equal(scan.temporalKindFromName('libxess.dll'), 'xess');
  assert.equal(scan.temporalKindFromName('ffx_fsr2_api_x64.dll'), 'fsr2');
  assert.equal(scan.temporalKindFromName('ffx_fsr3upscaler_x64.dll'), 'fsr3');
  assert.equal(scan.temporalKindFromName('amd_fidelityfx_loader_dx12.dll'), 'ffx');
  assert.equal(scan.temporalKindFromName('nvngx_dlss.dll'), null);
});
