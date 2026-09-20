'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('child_process');

test('real Electron renderer exercises library actions and EXE candidate choice', { skip: process.platform !== 'win32' }, () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dlss5-library-ui-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_TEST_CONTEXT;
  try {
    const result = spawnSync(require('electron'), [
      `--user-data-dir=${profile}`, path.resolve(__dirname, '../scripts/test-standalone-library-ui.js')
    ], { encoding: 'utf8', timeout: 30000, windowsHide: true, env });
    const details = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n');
    assert.equal(result.status, 0, details);
    assert.equal((result.stdout.match(/PASS: favorites, hide\/unhide/g) || []).length, 2, details);
  } finally {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
