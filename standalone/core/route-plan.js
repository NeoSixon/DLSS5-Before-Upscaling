'use strict';

const ROUTE_IDS = Object.freeze({
  NATIVE: 'native-presr',
  TEMPORAL: 'temporal-presr',
  PROBE: 'auto-probe',
  UNSUPPORTED: 'unsupported'
});

function normalizeInputs(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const kind = String(item?.kind || item || '').trim().toLowerCase();
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    out.push(kind);
  }
  return out;
}

function chooseRoute({ chosen, dlss, upscalerInputs } = {}) {
  const api = chosen?.api || null;
  const bitness = Number(chosen?.bitness || 0);
  const inputs = normalizeInputs(upscalerInputs);
  const supportedApi = api === 'dxgi' || api === 'vulkan';

  if (!chosen || bitness !== 64 || !supportedApi) {
    return {
      id: ROUTE_IDS.UNSUPPORTED,
      ready: false,
      installable: false,
      confidence: 'none',
      source: null,
      inputs
    };
  }

  if (dlss) {
    return {
      id: ROUTE_IDS.NATIVE,
      ready: true,
      installable: true,
      confidence: 'high',
      source: 'dlss',
      inputs: ['dlss', ...inputs.filter(kind => kind !== 'dlss')]
    };
  }

  if (inputs.length) {
    return {
      id: ROUTE_IDS.TEMPORAL,
      ready: true,
      installable: true,
      confidence: 'high',
      source: inputs[0],
      inputs
    };
  }

  return {
    id: ROUTE_IDS.PROBE,
    ready: false,
    installable: true,
    confidence: 'probe',
    source: null,
    inputs: []
  };
}

module.exports = { ROUTE_IDS, normalizeInputs, chooseRoute };
