'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('manager overlay uses a safe horizontal inset and compact labeled style rows', () => {
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  assert.match(fix, /horizontalMargin = 64\.0f \* scale/);
  assert.match(fix, /verticalMargin = 26\.0f \* scale/);
  assert.match(fix, /comboWidth = std::min\(176\.0f \* scale, ImGui::GetContentRegionAvail\(\)\.x\)/);
  assert.match(fix, /panelWidth = std::min/);
  assert.match(fix, /panelHeightLimit/);
  assert.match(fix, /SetNextWindowPos\(anchor, ImGuiCond_Always, pivot\)/);
  assert.match(fix, /ImVec2\(panelWidth, panelHeightLimit\)/);
  assert.match(fix, /optionalStyleCombo/);
  assert.match(fix, /baseStyle/);
  assert.match(fix, /##ManagerPass2Style/);
  assert.match(fix, /##ManagerPass3Style/);
});

test('all active advanced passes default open', () => {
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  assert.match(fix, /TreeNodeEx\(title\.c_str\(\), ImGuiTreeNodeFlags_DefaultOpen\)/);
});

test('desktop language is mirrored into managed in-game overlays with CJK glyph support', () => {
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  const settings = read('standalone/core/nr-settings.js');
  const preload = read('standalone/preload.js');
  const compat = read('standalone/renderer/home-compat.js');
  const app = read('standalone/renderer/app.js');

  assert.match(fix, /Dlss5ManagerLanguage/);
  assert.match(fix, /GetDlss5ManagerGlyphRanges/);
  assert.doesNotMatch(fix, /->GetGlyphRangesChinese/);
  const glyphBlock = fix.match(/static const ImWchar chineseRanges\[\] = \{([\s\S]*?)\};/);
  assert.ok(glyphBlock, 'CJK glyph ranges have static lifetime for atlas building');
  const endpoints = [...glyphBlock[1].matchAll(/0x[0-9A-F]+/gi)].map(([hex]) => Number(hex));
  assert.equal(endpoints.length % 2, 0, 'glyph ranges use inclusive start/end pairs');
  for (const character of new Set([...fix].filter(char => char.codePointAt(0) > 0x7f))) {
    const codepoint = character.codePointAt(0);
    assert.ok(endpoints.some((start, index) => index % 2 === 0 &&
      codepoint >= start && codepoint <= endpoints[index + 1]),
    `overlay glyph ranges must cover ${character} (U+${codepoint.toString(16)})`);
  }
  assert.match(fix, /神经渲染/);
  assert.match(fix, /模型分辨率/);
  assert.match(fix, /实验性/);

  assert.match(settings, /DLSS5ManagerLanguage/);
  assert.match(settings, /applyOverlayLanguageToLibrary/);
  assert.match(settings, /msyh\.ttc/);
  assert.match(preload, /setOverlayLanguage/);
  assert.match(app, /await window\.nrApp\.setOverlayLanguage\(language\)/);
  assert.match(compat, /overlayLanguageError/);
});

test('manager backend revision is mgr23 everywhere user-facing update detection relies on it', () => {
  for (const rel of [
    'standalone/core/optiscaler.js',
    'standalone/renderer/home-compat.js'
  ]) {
    assert.match(read(rel), /0\.7\.7-dlss5mgr23/, `${rel} should use mgr23`);
  }
});

test('manager shortcut is handled before the first ImGui frame', () => {
  const patch = read('scripts/patch-optiscaler-compact-overlay.py');
  assert.match(patch, /Handle the hotkey before the first ImGui frame/);
  assert.doesNotMatch(patch, /if \(io\.DisplaySize\.x <= 0\.0f \|\| io\.DisplaySize\.y <= 0\.0f\)\s*return;/);
});

test('add-game source buttons are neutral until the user points to one', () => {
  const dialog = read('standalone/renderer/library-dialog.js');
  const styles = read('standalone/renderer/library-actions.css');
  assert.doesNotMatch(dialog, /chooseGameFolderBtn[^\n]+class="primary"/);
  assert.doesNotMatch(dialog, /chooseGameFolderBtn[^\n]+autofocus/);
  assert.match(dialog, /dialog\.setAttribute\('tabindex', '-1'\)/);
  assert.match(styles, /\.add-game-sources \.add-game-source:hover/);
});

test('technical overlay controls expose bilingual hover explanations', () => {
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  assert.match(fix, /hoverHelp/);
  assert.match(fix, /ImGuiHoveredFlags_AllowWhenDisabled/);
  assert.match(fix, /在最终画面应用 NR/);
  assert.match(fix, /仅支持原生 DX12 \+ DLSS SR，不支持光线重建/);
  assert.match(fix, /细节累积速率/);
  assert.match(fix, /每两帧运行一次 NR/);
  assert.match(fix, /估算相机数据辅助帧生成/);
  assert.match(fix, /HDR 亮度进入 NR 时的映射方式/);
});

test('manager overlay scales font size with UI scale', () => {
  const patch = read('scripts/patch-optiscaler-compact-overlay.py');
  assert.match(patch, /ImGui::PushFontSize\(std::round\(fontSize \* scale\)\)/);
  assert.match(patch, /ImGui::SetWindowFontScale\(scale\)/);
  assert.match(patch, /ImGui::PopFontSize\(\)/);
});

test('manager header uses a compact DLSS5 wordmark without NR branding or subtitle', () => {
  const patch = read('scripts/patch-optiscaler-compact-overlay.py');
  assert.match(patch, /CalcTextSize\("DLSS"\)/);
  assert.match(patch, /const float fiveX/);
  assert.match(patch, /fiveColor/);
  assert.doesNotMatch(patch, /const float nrStroke/);
  assert.doesNotMatch(patch, /wordmarkLine/);
  assert.doesNotMatch(patch, /"DLSS 5"/);
  assert.doesNotMatch(patch, /separatorX/);
  assert.doesNotMatch(patch, /TextDisabled\("Neural Rendering"\)/);
});

test('later-pass auto skin mask only shows a restore icon after an override', () => {
  const patch = read('scripts/patch-optiscaler-compact-overlay.py');
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  assert.match(patch, /inherit && autoMask->has_value\(\)/);
  assert.match(patch, /restoreIcon\("##RestoreAutoMask"/);
  assert.match(patch, /Restore the Pass 1 setting\./);
  assert.doesNotMatch(patch, /Reset##AutoMask/);
  assert.match(fix, /恢复为第 1 层设置/);
  assert.match(fix, /不只脸部/);
});

test('advanced restore controls are contextual instead of always-visible Reset buttons', () => {
  const patch = read('scripts/patch-optiscaler-compact-overlay.py');
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  assert.match(patch, /const bool canRestore = inherit \? option->has_value\(\) : effectiveValue != fallback/);
  assert.match(patch, /restoreIcon\("##RestoreSlider"/);
  assert.doesNotMatch(patch, /SmallButton\(reset\.c_str\(\)\)/);
  assert.match(patch, /intensityDefault = inherit \? config->DlssNrIntensity\.value_or_default\(\) : 1\.0f/);
  assert.match(patch, /toneDefault = inherit \? 0\.0f : 1\.0f/);
  assert.match(patch, /skinDefault = inherit \? config->DlssNrSkinStructure\.value_or_default\(\) : -1\.0f/);
  assert.match(fix, /恢复默认值：1\.00/);
  assert.match(fix, /恢复为第 1 层设置/);
  assert.match(fix, /恢复本层默认值：0\.00/);
});


test('manager overlay reports a concrete failure or waits for the DLSS evaluate call', () => {
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  assert.match(fix, /DlssNr::FailureReason\(\)/);
  assert.match(fix, /NR inactive - waiting for DLSS evaluate/);
});

test('legacy NGX C evaluate entry points are bridged into the managed backend', () => {
  const patch = read('scripts/patch-optiscaler-legacy-ngx-evaluate.py');
  assert.match(patch, /NVSDK_NGX_D3D12_EvaluateFeature_C/);
  assert.match(patch, /NVSDK_NGX_D3D11_EvaluateFeature_C/);
  assert.match(patch, /D3D12 C EvaluateFeature entry active/);
  assert.match(patch, /D3D12 EvaluateFeature reached/);
  assert.match(patch, /const_cast<NVSDK_NGX_Parameter\*>/);
});
