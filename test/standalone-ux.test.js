'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('standalone UX layer provides scroll, glass and a native language dropdown', () => {
  const index = read('standalone/renderer/index.html');
  const glass = read('standalone/renderer/liquid-glass.css');
  const ux = read('standalone/renderer/ux-fixes.js');

  assert.match(index, /liquid-glass\.css/);
  assert.match(index, /ux-fixes\.js/);
  assert.match(index, /id="languageSelect"/);
  assert.match(glass, /overflow-y:auto!important/);
  assert.match(glass, /backdrop-filter:blur\(/);
  assert.match(glass, /\.sidebar-foot\{display:none!important\}/);
  assert.doesNotMatch(ux, /language-choice/);
  assert.doesNotThrow(() => new Function(ux));
});
