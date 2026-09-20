#!/usr/bin/env python3
"""Compatibility and product-UI fixes applied after the independent manager overlay patch.

The manager overlay deliberately reuses OptiScaler's proven ImGui/render/input host, while the
visible panel is owned by DLSS 5 Neural Rendering Manager. This post-patch adapts pinned v0.7.7
APIs, adds manager-language plumbing, loads CJK glyphs when Chinese is selected, and applies the
small layout/UX refinements that belong to our panel rather than OptiScaler's stock menu.
"""

from __future__ import annotations

import pathlib
import sys


MANAGER_GLYPH_RANGES = r'''static const ImWchar* GetDlss5ManagerGlyphRanges(ImFontAtlas* atlas, bool chinese)
{
    if (!chinese)
        return atlas->GetGlyphRangesDefault();

    // The pinned ImGui disables obsolete glyph-range helpers. Keep the ranges
    // alive until atlas build/upload, including for legacy rendering backends.
    static const ImWchar chineseRanges[] = {
        0x0020, 0x00FF, // Latin
        0x2000, 0x206F, // General punctuation
        0x3000, 0x30FF, // CJK symbols, punctuation, Hiragana and Katakana
        0x31F0, 0x31FF, // Katakana extensions
        0x3400, 0x4DBF, // CJK unified ideographs extension A
        0x4E00, 0x9FFF, // CJK unified ideographs
        0xFF00, 0xFFEF, // Half-width and full-width forms
        0xFFFD, 0xFFFD, // Replacement character
        0
    };
    return chineseRanges;
}

'''


def replace_exact(text: str, old: str, new: str, label: str, expected: int | None = None) -> str:
    count = text.count(old)
    if expected is not None and count != expected:
        raise RuntimeError(f"{label}: expected {expected} match(es), found {count}")
    if count == 0:
        raise RuntimeError(f"{label}: source pattern not found")
    return text.replace(old, new)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    return replace_exact(text, old, new, label, expected=1)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: fix-optiscaler-manager-overlay-compile.py <OptiScaler checkout>", file=sys.stderr)
        return 2

    root = pathlib.Path(sys.argv[1]).resolve()
    target = root / "OptiScaler" / "menu" / "menu_common.cpp"
    config_h = root / "OptiScaler" / "Config.h"
    config_cpp = root / "OptiScaler" / "Config.cpp"

    text = target.read_text(encoding="utf-8-sig")

    # v0.7.x exposed the Vulkan running-state helper from a separate header.
    # v0.8.x publishes backend status through DlssNr_Status.h (included by DlssNr.h),
    # so the extra include is neither necessary nor present in the modern tree.
    include_anchor = "#include <dlssnr/DlssNr_ExposureScan.h>\n"
    include_line = "#include <dlssnr/DlssNrFeature_Vk.h>\n"
    if include_line not in text and include_anchor in text:
        text = replace_once(text, include_anchor, include_anchor + include_line, "Vulkan NR header include")

    # Pinned ImGui has GetContentRegionAvail(), not the newer window-content helper.
    old_edge = "ImGui::GetWindowContentRegionMax().x"
    new_edge = "(ImGui::GetCursorPosX() + ImGui::GetContentRegionAvail().x)"
    text = replace_exact(text, old_edge, new_edge, "content region edge", expected=2)

    # Pull the panel inward from the physical screen edge. Vertical spacing stays compact;
    # the larger horizontal safe margin matches modern game overlays and avoids edge clipping.
    old_position = r'''    const float margin = 26.0f * scale;

    ImVec2 anchor(io.DisplaySize.x - margin, margin);
    ImVec2 pivot(1.0f, 0.0f);
    switch (config->FpsOverlayPosition.value_or_default())
    {
    case FpsOverlayPos_TopLeft:
        anchor = ImVec2(margin, margin);
        pivot = ImVec2(0.0f, 0.0f);
        break;
    case FpsOverlayPos_BottomLeft:
        anchor = ImVec2(margin, io.DisplaySize.y - margin);
        pivot = ImVec2(0.0f, 1.0f);
        break;
    case FpsOverlayPos_BottomRight:
        anchor = ImVec2(io.DisplaySize.x - margin, io.DisplaySize.y - margin);
        pivot = ImVec2(1.0f, 1.0f);
        break;'''
    new_position = r'''    const float horizontalMargin = 64.0f * scale;
    const float verticalMargin = 26.0f * scale;
    // Bound the panel against the current viewport, including resolution/scale changes.
    const float safeX = std::min(horizontalMargin, io.DisplaySize.x * 0.08f);
    const float safeY = std::min(verticalMargin, io.DisplaySize.y * 0.05f);
    const float panelWidth = std::min(480.0f * scale, std::max(1.0f, io.DisplaySize.x - 2.0f * safeX));
    const float panelHeightLimit = std::max(1.0f, io.DisplaySize.y - 2.0f * safeY);

    ImVec2 anchor(io.DisplaySize.x - safeX, safeY);
    ImVec2 pivot(1.0f, 0.0f);
    switch (config->FpsOverlayPosition.value_or_default())
    {
    case FpsOverlayPos_TopLeft:
        anchor = ImVec2(safeX, safeY);
        pivot = ImVec2(0.0f, 0.0f);
        break;
    case FpsOverlayPos_BottomLeft:
        anchor = ImVec2(safeX, io.DisplaySize.y - safeY);
        pivot = ImVec2(0.0f, 1.0f);
        break;
    case FpsOverlayPos_BottomRight:
        anchor = ImVec2(io.DisplaySize.x - safeX, io.DisplaySize.y - safeY);
        pivot = ImVec2(1.0f, 1.0f);
        break;'''
    text = replace_once(text, old_position, new_position, "overlay safe margins")
    text = replace_once(text,
        '    ImGui::SetNextWindowPos(anchor, ImGuiCond_Appearing, pivot);\n'
        '    ImGui::SetNextWindowSizeConstraints(ImVec2(390.0f * scale, 0.0f),\n'
        '                                        ImVec2(560.0f * scale, io.DisplaySize.y * 0.90f));',
        '    ImGui::SetNextWindowPos(anchor, ImGuiCond_Always, pivot);\n'
        '    ImGui::SetNextWindowSizeConstraints(ImVec2(panelWidth, 0.0f),\n'
        '                                        ImVec2(panelWidth, panelHeightLimit));',
        'viewport-constrained window')
    text = replace_once(text,
        '                             ImGuiWindowFlags_NoCollapse |\n',
        '                             ImGuiWindowFlags_NoCollapse |\n'
        '                             ImGuiWindowFlags_NoMove |\n',
        'anchor-owned position')

    # Language is deliberately a manager-owned INI key. It follows the desktop app without
    # changing OptiScaler's own stock-menu language or exposing that menu to the user.
    language_anchor = "    const float opacity = std::clamp(config->MenuBGColorA.value_or_default(), 0.50f, 0.95f);\n"
    language_block = r'''    const bool zh = config->Dlss5ManagerLanguage.value_or_default() == "zh-CN";
    const auto tr = [zh](const char* en, const char* zhCn) -> const char* { return zh ? zhCn : en; };
    const auto hoverHelp = [&](const char* en, const char* zhCn)
    {
        if (!ImGui::IsItemHovered(ImGuiHoveredFlags_AllowWhenDisabled))
            return;
        ImGui::BeginTooltip();
        ImGui::PushTextWrapPos(ImGui::GetFontSize() * 28.0f);
        ImGui::TextUnformatted(tr(en, zhCn));
        ImGui::PopTextWrapPos();
        ImGui::EndTooltip();
    };
'''
    text = replace_once(text, language_anchor, language_anchor + language_block, "overlay language helper")

    # Pass 2/3 style options are CustomOptional<uint32_t, NoDefault>, so do not instantiate
    # value_or_default() for them. Also hide the implementation-level "inherit Pass 1" choice:
    # an unset later pass simply displays Pass 1's effective style until the user chooses an override.
    # The compact right-aligned combo width leaves the label visible instead of pushing it offscreen.
    old_styles = r'''        auto styleCombo = [&](const char* label, auto* option, bool inherit)
        {
            if (!inherit)
            {
                int style = (int) std::clamp(option->value_or_default(), 0u, 2u);
                ImGui::SetNextItemWidth(-1.0f);
                if (ImGui::Combo(label, &style, styles, IM_ARRAYSIZE(styles)))
                {
                    *option = (uint32_t) style;
                    return true;
                }
                return false;
            }

            int selected = option->has_value() ? std::clamp((int) option->value(), 0, 2) + 1 : 0;
            ImGui::SetNextItemWidth(-1.0f);
            if (!ImGui::Combo(label, &selected, inheritedStyles, IM_ARRAYSIZE(inheritedStyles)))
                return false;
            if (selected == 0)
                option->reset();
            else
                *option = (uint32_t) (selected - 1);
            return true;
        };

        ImGui::Spacing();
        if (styleCombo("Pass 1 style", &config->DlssNrStyle, false))
            changed = true;
        if (passes >= 2 && styleCombo("Pass 2 style", &config->DlssNrPass2Style, true))
            changed = true;
        if (passes >= 3 && styleCombo("Pass 3 style", &config->DlssNrPass3Style, true))
            changed = true;'''

    new_styles = r'''        auto styleRow = [&](const char* label, const char* id, int& style)
        {
            ImGui::TextUnformatted(label);
            ImGui::SameLine();
            const float comboWidth = std::min(176.0f * scale, ImGui::GetContentRegionAvail().x);
            const float rightEdge = ImGui::GetCursorPosX() + ImGui::GetContentRegionAvail().x;
            ImGui::SetCursorPosX(std::max(ImGui::GetCursorPosX(), rightEdge - comboWidth));
            ImGui::SetNextItemWidth(comboWidth);
            return ImGui::Combo(id, &style, styles, IM_ARRAYSIZE(styles));
        };

        auto primaryStyleCombo = [&](const char* label, const char* id, auto* option)
        {
            int style = (int) std::clamp(option->value_or_default(), 0u, 2u);
            if (!styleRow(label, id, style))
                return false;
            *option = (uint32_t) style;
            return true;
        };

        auto optionalStyleCombo = [&](const char* label, const char* id, auto* option)
        {
            const int baseStyle = (int) std::clamp(config->DlssNrStyle.value_or_default(), 0u, 2u);
            int style = option->has_value() ? std::clamp((int) option->value(), 0, 2) : baseStyle;
            if (!styleRow(label, id, style))
                return false;
            *option = (uint32_t) style;
            return true;
        };

        ImGui::Spacing();
        if (primaryStyleCombo(tr("Pass 1 style", "第 1 层风格"), "##ManagerPass1Style", &config->DlssNrStyle))
            changed = true;
        if (passes >= 2 && optionalStyleCombo(tr("Pass 2 style", "第 2 层风格"), "##ManagerPass2Style", &config->DlssNrPassOverrides[0].style))
            changed = true;
        if (passes >= 3 && optionalStyleCombo(tr("Pass 3 style", "第 3 层风格"), "##ManagerPass3Style", &config->DlssNrPassOverrides[1].style))
            changed = true;'''
    text = replace_once(text, old_styles, new_styles, "style rows")

    # The old arrays still expose implementation-level inheritance; collapse to the three actual styles.
    text = replace_once(
        text,
        '        const char* styles[] = { "Standard", "Natural", "Cinematic" };\n        const char* inheritedStyles[] = { "Inherit Pass 1", "Standard", "Natural", "Cinematic" };',
        '        const char* styles[] = { tr("Standard", "标准"), tr("Natural", "自然"), tr("Cinematic", "电影感") };',
        "localized style names")

    # Main panel localization.
    replacements = [
        ('ImGui::Checkbox("Neural Rendering", &enabled)', 'ImGui::Checkbox(tr("Neural Rendering", "神经渲染"), &enabled)', 'NR checkbox'),
        ('ImGui::Checkbox("Pre-SR", &beforeSr)', 'ImGui::Checkbox(tr("Pre-SR", "Pre-SR（超分前）"), &beforeSr)', 'Pre-SR checkbox'),
        ('ImGui::SetTooltip("Run Neural Rendering before DLSS Super Resolution.");', 'ImGui::SetTooltip("%s", tr("Run Neural Rendering before DLSS Super Resolution.", "在 DLSS 超分辨率之前运行神经渲染。"));', 'Pre-SR tooltip'),
        ('ImGui::TextDisabled("Passes");', 'ImGui::TextDisabled(tr("Passes", "层数"));', 'passes label'),
        ('ImGui::SliderInt("Model resolution", &scalePercent, 25, 200, "%d%%")', 'ImGui::SliderInt(tr("Model resolution", "模型分辨率"), &scalePercent, 25, 200, "%d%%")', 'model resolution'),
        ('ImGui::SetTooltip("Lower values improve performance. Higher values increase Neural Rendering detail.");', 'ImGui::SetTooltip("%s", tr("Lower values improve performance. Higher values increase Neural Rendering detail.", "降低可提升性能；提高可增加神经渲染细节。"));', 'resolution tooltip'),
        ('ImGui::SliderFloat("Detail strength", &detail, 0.0f, 2.0f, "%.2f")', 'ImGui::SliderFloat(tr("Detail strength", "细节强度"), &detail, 0.0f, 2.0f, "%.2f")', 'detail strength'),
        ('ImGui::SliderFloat("Colour strength", &colour, 0.0f, 4.0f, "%.2f")', 'ImGui::SliderFloat(tr("Colour strength", "色彩强度"), &colour, 0.0f, 4.0f, "%.2f")', 'colour strength'),
        ('ImGui::CollapsingHeader("Advanced")', 'ImGui::CollapsingHeader(tr("Advanced", "高级"))', 'advanced header'),
        ('ImGui::Checkbox("Apply to finished picture", &finishedPicture)', 'ImGui::Checkbox(tr("Apply NR to finished picture", "在最终画面应用 NR"), &finishedPicture)', 'finished picture'),
        ('ImGui::TextDisabled("Finished-picture mode requires native DirectX 12.");', 'ImGui::TextDisabled("%s", tr("Finished-picture mode requires native DirectX 12.", "最终画面模式需要原生 DirectX 12。"));', 'finished picture hint'),
        ('ImGui::Checkbox("Apply effect (A/B preview)", &applyModel)', 'ImGui::Checkbox(tr("Apply effect (A/B preview)", "应用效果（A/B 对比）"), &applyModel)', 'A/B checkbox'),
        ('ImGui::SetTooltip("Turn off to compare before/after. Neural Rendering still runs and keeps its GPU cost.");', 'ImGui::SetTooltip("%s", tr("Turn off to compare before/after. Neural Rendering still runs and keeps its GPU cost.", "关闭可对比前后效果；神经渲染仍会运行并保持 GPU 开销。"));', 'A/B tooltip'),
        ('ImGui::CollapsingHeader("Experimental")', 'ImGui::CollapsingHeader(tr("Experimental", "实验性"))', 'experimental header'),
        ('"Experimental - may cause artifacts, latency, or require restart.");', '"%s", tr("Experimental - may cause artifacts, latency, or require restart.", "实验性功能 - 可能产生伪影、延迟，或需要重启游戏。"));', 'experimental warning'),
        ('ImGui::Checkbox("Carry Pre-SR edit across Ray Reconstruction", &residualAcrossRr)', 'ImGui::Checkbox(tr("Carry Pre-SR edit across Ray Reconstruction", "将 Pre-SR 编辑保留到光线重建"), &residualAcrossRr)', 'RR residual'),
        ('ImGui::SliderFloat("RR detail accumulation", &rrBlend, 0.01f, 1.0f, "%.2f")', 'ImGui::SliderFloat(tr("RR detail accumulation", "光线重建细节累积"), &rrBlend, 0.01f, 1.0f, "%.2f")', 'RR detail'),
        ('ImGui::Checkbox("Generate before SR, apply after SR", &deferred)', 'ImGui::Checkbox(tr("Generate before SR, apply after SR", "超分前生成，超分后应用"), &deferred)', 'deferred NR'),
        ('ImGui::Combo("HDR mapping", &hdrMode, hdrModes, IM_ARRAYSIZE(hdrModes))', 'ImGui::Combo(tr("HDR mapping", "HDR 映射"), &hdrMode, hdrModes, IM_ARRAYSIZE(hdrModes))', 'HDR mapping'),
    ]
    for old, new, label in replacements:
        text = replace_once(text, old, new, label)


    # Technical controls expose concise bilingual hover help. Keep these next to the
    # actual ImGui items so the explanation also works when an option is disabled.
    text = replace_once(
        text,
        '''            if (ImGui::Checkbox(tr("Apply NR to finished picture", "在最终画面应用 NR"), &finishedPicture))
            {
                config->DlssNrFinishedPicture = finishedPicture;
                DlssNr::RetryAfterFailure();
                changed = true;
            }
            ImGui::EndDisabled();''',
        '''            if (ImGui::Checkbox(tr("Apply NR to finished picture", "在最终画面应用 NR"), &finishedPicture))
            {
                config->DlssNrFinishedPicture = finishedPicture;
                DlssNr::RetryAfterFailure();
                changed = true;
            }
            if (beforeSr)
                hoverHelp(
                    "Current: Pre-SR is on.\\nRecommended: keep this off; try it only for green noise, colour issues, or post-processing conflicts.\\nLimits: native DX12 + DLSS SR only; Ray Reconstruction is not supported.",
                    "当前配置：Pre-SR 已开启\\n推荐：保持关闭；出现绿色噪点、颜色异常或后处理问题时再尝试开启。\\n限制：仅支持原生 DX12 + DLSS SR，不支持光线重建。");
            else
                hoverHelp(
                    "Current: Pre-SR is off.\\nRecommended: enable Pre-SR first; running NR directly on the finished picture is better suited to compatibility testing or specific games.\\nLimits: native DX12 only.",
                    "当前配置：Pre-SR 已关闭\\n推荐：优先开启 Pre-SR；直接在最终画面运行 NR 更适合兼容性测试或特定游戏。\\n限制：仅支持原生 DX12。");
            ImGui::EndDisabled();''',
        "finished-picture hover help")

    text = replace_once(
        text,
        '''            if (ImGui::Checkbox(tr("Apply effect (A/B preview)", "应用效果（A/B 对比）"), &applyModel))
            {
                config->DlssNrApplyModel = applyModel;
                changed = true;
            }
            if (ImGui::IsItemHovered())
                ImGui::SetTooltip("%s", tr("Turn off to compare before/after. Neural Rendering still runs and keeps its GPU cost.", "关闭可对比前后效果；神经渲染仍会运行并保持 GPU 开销。"));''',
        '''            if (ImGui::Checkbox(tr("Apply effect (A/B preview)", "应用效果（A/B 对比）"), &applyModel))
            {
                config->DlssNrApplyModel = applyModel;
                changed = true;
            }
            hoverHelp(
                "Turn this off for an A/B comparison. Neural Rendering still runs in the background, so GPU cost remains.",
                "关闭后可进行 A/B 前后对比。神经渲染仍会在后台运行，因此 GPU 开销不会消失。");''',
        "A/B hover help")

    text = replace_once(
        text,
        '''                    if (ImGui::Checkbox("Auto skin mask", &mask))
                    {
                        *autoMask = mask;
                        changed = true;
                    }''',
        '''                    if (ImGui::Checkbox("Auto skin mask", &mask))
                    {
                        *autoMask = mask;
                        changed = true;
                    }
                    hoverHelp(
                        "Use the model's learned skin selection (not face-only) so Skin structure mainly targets detected skin regions. Accuracy can vary by scene.",
                        "使用模型学习到的皮肤区域识别（不只脸部），使“皮肤结构”主要作用于识别出的皮肤区域。识别准确度会随画面变化。");''',
        "auto-skin-mask hover help")

    text = replace_once(
        text,
        '''            if (ImGui::Checkbox(tr("Carry Pre-SR edit across Ray Reconstruction", "将 Pre-SR 编辑保留到光线重建"), &residualAcrossRr))
            {
                config->DlssNrResidualAcrossRr = residualAcrossRr;
                changed = true;
            }''',
        '''            if (ImGui::Checkbox(tr("Carry Pre-SR edit across Ray Reconstruction", "将 Pre-SR 调整延续至光线重建"), &residualAcrossRr))
            {
                config->DlssNrResidualAcrossRr = residualAcrossRr;
                changed = true;
            }
            hoverHelp(
                "Only applies with Pre-SR enabled and Ray Reconstruction active. NR runs before SR, then its adjustment is temporally carried onto the RR+SR output so RR denoising does not erase it.",
                "仅在开启 Pre-SR 且游戏启用光线重建时生效。NR 先在超分前生成调整，再通过时间累积把这部分调整叠加到 RR+SR 输出，避免被光线重建的去噪过程抹掉。");''',
        "RR carry hover help")

    text = replace_once(
        text,
        '''            if (ImGui::SliderFloat(tr("RR detail accumulation", "光线重建细节累积"), &rrBlend, 0.01f, 1.0f, "%.2f"))
            {
                config->DlssNrResidualAcrossRrBlend = std::clamp(rrBlend, 0.01f, 1.0f);
                changed = true;
            }''',
        '''            if (ImGui::SliderFloat(tr("RR detail accumulation", "细节累积速率"), &rrBlend, 0.01f, 1.0f, "%.2f"))
            {
                config->DlssNrResidualAcrossRrBlend = std::clamp(rrBlend, 0.01f, 1.0f);
                changed = true;
            }
            hoverHelp(
                "How quickly the carried RR detail builds up. Lower values are steadier but slower to appear; 1.0 disables accumulation and can flicker more. Default: 0.08.",
                "控制上述光线重建调整的累积速度。数值越低越稳定，但效果出现更慢；1.0 表示不做累积，更容易闪烁。默认值：0.08。");''',
        "RR accumulation hover help")

    text = replace_once(
        text,
        '''            if (ImGui::Checkbox(tr("Generate before SR, apply after SR", "超分前生成，超分后应用"), &deferred))
            {
                config->DlssNrDeferredDlss = deferred;
                changed = true;
            }''',
        '''            if (ImGui::Checkbox(tr("Generate before SR, apply after SR", "超分前生成，超分后应用（DLSS）"), &deferred))
            {
                config->DlssNrDeferredDlss = deferred;
                changed = true;
            }
            hoverHelp(
                "Compute NR at input resolution, upscale only its changes with DLSS, then apply them after Super Resolution. Experimental: may flicker, adds GPU cost, and does not support Ray Reconstruction.",
                "在输入分辨率计算 NR，只用 DLSS 放大 NR 产生的变化，再在超分后叠加。属于实验功能：可能闪烁、增加 GPU 开销，并且不支持光线重建。");''',
        "deferred-NR hover help")

    text = replace_once(
        text,
        '''            if (ImGui::Combo(tr("HDR mapping", "HDR 映射"), &hdrMode, hdrModes, IM_ARRAYSIZE(hdrModes)))
            {
                config->DlssNrReversibleMode = (uint32_t) hdrMode;
                changed = true;
            }''',
        '''            if (ImGui::Combo(tr("HDR mapping", "HDR 映射"), &hdrMode, hdrModes, IM_ARRAYSIZE(hdrModes)))
            {
                config->DlssNrReversibleMode = (uint32_t) hdrMode;
                changed = true;
            }
            hoverHelp(
                "Controls how HDR brightness is mapped for NR. Soft knee compresses highlights; Neutwo uses a reversible curve; Hybrid preserves midtones while compressing highlights. Replace modes bypass the composed strength controls and may flicker.",
                "控制 HDR 亮度进入 NR 时的映射方式。柔和拐点会压缩高光；Neutwo 使用可逆曲线；Hybrid 尽量保留中间调并压缩高光。Replace 模式会绕过部分合成强度控制，并可能闪烁。");''',
        "HDR-mapping hover help")

    # Advanced sliders reserve room for their label and the compact restore icon only when it is visible.
    text = replace_once(text,
        '                if (ImGui::SliderFloat(label, &value, mn, mx, "%.2f"))',
        '                const float labelWidth = ImGui::CalcTextSize(label).x;\n'
        '                const float restoreWidth = canRestore ? ImGui::GetFrameHeight() + ImGui::GetStyle().ItemSpacing.x : 0.0f;\n'
        '                const float sliderWidth = ImGui::GetContentRegionAvail().x - labelWidth - restoreWidth -\n'
        '                    ImGui::GetStyle().ItemInnerSpacing.x;\n'
        '                ImGui::SetNextItemWidth(std::max(1.0f, sliderWidth));\n'
        '                if (ImGui::SliderFloat(label, &value, mn, mx, "%.2f"))',
        'advanced slider width')

    # Localize advanced-pass controls and keep every currently-active pass open by default.
    text = replace_once(
        text,
        '                const std::string title = "Pass " + std::to_string(pass);',
        '                const std::string title = zh ? "第 " + std::to_string(pass) + " 层" : "Pass " + std::to_string(pass);',
        "advanced pass title")
    text = replace_once(
        text,
        '                if (ImGui::TreeNodeEx(title.c_str(), pass == 1 ? ImGuiTreeNodeFlags_DefaultOpen : 0))',
        '                if (ImGui::TreeNodeEx(title.c_str(), ImGuiTreeNodeFlags_DefaultOpen))',
        "active pass default expansion")
    for old, new, label in [
        ('deferredSlider("Intensity", intensity', 'deferredSlider(tr("Intensity", "强度"), intensity', 'intensity'),
        ('deferredSlider("Local structure", structure', 'deferredSlider(tr("Local structure", "局部结构"), structure', 'local structure'),
        ('deferredSlider("Local tone", tone', 'deferredSlider(tr("Local tone", "局部色调"), tone', 'local tone'),
        ('deferredSlider("Skin structure", skin', 'deferredSlider(tr("Skin structure", "皮肤结构"), skin', 'skin structure'),
        ('ImGui::Checkbox("Auto skin mask", &mask)', 'ImGui::Checkbox(tr("Auto skin mask", "自动皮肤遮罩"), &mask)', 'auto mask'),
    ]:
        text = replace_once(text, old, new, label)
    # Restore icons use contextual tooltips instead of ambiguous "Reset" labels.
    for old, new, label in [
        ('const char* restoreDefaultOne = "Restore default value: 1.00.";',
         'const char* restoreDefaultOne = tr("Restore default value: 1.00.", "恢复默认值：1.00。");',
         'restore default one tooltip'),
        ('const char* restoreDefaultSkin = "Restore default value: -1.00 (follows Local structure).";',
         'const char* restoreDefaultSkin = tr("Restore default value: -1.00 (follows Local structure).", "恢复默认值：-1.00（跟随局部结构）。");',
         'restore default skin tooltip'),
        ('const char* restoreInherited = "Restore the Pass 1 setting.";',
         'const char* restoreInherited = tr("Restore the Pass 1 setting.", "恢复为第 1 层设置。");',
         'restore inherited tooltip'),
        ('const char* restoreToneZero = "Restore this pass\'s default value: 0.00.";',
         'const char* restoreToneZero = tr("Restore this pass\'s default value: 0.00.", "恢复本层默认值：0.00。");',
         'restore tone tooltip'),
    ]:
        text = replace_once(text, old, new, label)

    # Translate the HDR option values rather than leaving an otherwise-Chinese panel half-English.
    old_hdr = r'''            const char* hdrModes[] = { "Off (soft knee)", "Neutwo + composed", "Neutwo + replace",
                                       "Hybrid + composed", "Hybrid + replace" };'''
    new_hdr = r'''            const char* hdrModes[] = { tr("Off (soft knee)", "关闭（柔和拐点）"),
                                       tr("Neutwo + composed", "Neutwo + 合成"), tr("Neutwo + replace", "Neutwo + 替换"),
                                       tr("Hybrid + composed", "混合 + 合成"), tr("Hybrid + replace", "混合 + 替换") };'''
    text = replace_once(text, old_hdr, new_hdr, "HDR mode names")

    # Footer status and close hint.
    old_status = r'''        const bool running = DlssNr::IsRunning() || DlssNr::IsRunningVk();
        if (!enabled)
            ImGui::TextDisabled("Off");
        else if (running)
            ImGui::TextColored(ImVec4(0.502f, 0.780f, 0.016f, 1.0f), "%s - %d pass%s",
                               beforeSr ? "Pre-SR active" : "After-SR active", passes, passes == 1 ? "" : "es");
        else
            ImGui::TextColored(ImVec4(0.90f, 0.72f, 0.34f, 1.0f), "NR inactive - waiting for supported DLSS path");'''
    new_status = r'''        const auto dx12NrStatus = DlssNr::ReadStatus(DlssNr::Backend::Dx12);
        const auto vkNrStatus = DlssNr::ReadStatus(DlssNr::Backend::Vulkan);
        const bool running = dx12NrStatus.running || vkNrStatus.running;
        if (!enabled)
            ImGui::TextDisabled("%s", tr("Off", "关闭"));
        else if (running)
        {
            const char* mode = beforeSr ? tr("Pre-SR active", "Pre-SR 已启用") : tr("After-SR active", "后置 NR 已启用");
            if (zh)
                ImGui::TextColored(ImVec4(0.502f, 0.780f, 0.016f, 1.0f), "%s · %d 层", mode, passes);
            else
                ImGui::TextColored(ImVec4(0.502f, 0.780f, 0.016f, 1.0f), "%s · %d pass%s", mode, passes, passes == 1 ? "" : "es");
        }
        else
        {
            const std::string failure = !dx12NrStatus.failureReason.empty()
                                            ? dx12NrStatus.failureReason
                                            : vkNrStatus.failureReason;
            if (!failure.empty())
                ImGui::TextColored(ImVec4(0.92f, 0.35f, 0.30f, 1.0f), "NR inactive - %s", failure.c_str());
            else
                ImGui::TextColored(ImVec4(0.90f, 0.72f, 0.34f, 1.0f), "%s",
                                   tr("NR inactive - waiting for temporal evaluate",
                                      "NR 未运行 - 等待时域 Evaluate 调用"));
        }'''
    text = replace_once(text, old_status, new_status, "localized status footer")
    text = replace_once(
        text,
        '        const std::string closeHint = shortcut + " / Esc to close";',
        '        const std::string closeHint = shortcut + (zh ? " / Esc 关闭" : " / Esc to close");',
        "localized close hint")

    # Add a manager-owned language option to the pinned Config surface.
    cfg_h = config_h.read_text(encoding="utf-8-sig")
    cfg_h = replace_once(
        cfg_h,
        '    CustomOptional<float> MenuBGColorA { 0.99f };',
        '    CustomOptional<float> MenuBGColorA { 0.99f };\n    CustomOptional<std::string> Dlss5ManagerLanguage { "en" };',
        "manager language config field")
    config_h.write_text(cfg_h, encoding="utf-8")

    cfg_cpp = config_cpp.read_text(encoding="utf-8-sig")
    cfg_cpp = replace_once(
        cfg_cpp,
        '            DisableSplash.set_from_config(readBool("Menu", "DisableSplash"));',
        '            DisableSplash.set_from_config(readBool("Menu", "DisableSplash"));\n            Dlss5ManagerLanguage.set_from_config(readString("Menu", "DLSS5ManagerLanguage"));',
        "manager language config load")
    config_cpp.write_text(cfg_cpp, encoding="utf-8")

    # Supply explicit CJK ranges without relying on ImGui's disabled obsolete APIs.
    # English keeps the default range; Chinese uses the system font selected by the app.
    init_signature = "void MenuCommon::Init(HWND InHwnd, bool isUWP)"
    text = replace_once(text, init_signature, MANAGER_GLYPH_RANGES + init_signature,
                        "manager glyph range helper")
    glyph_old = "io.Fonts->GetGlyphRangesDefault()"
    glyph_new = 'GetDlss5ManagerGlyphRanges(io.Fonts, Config::Instance()->Dlss5ManagerLanguage.value_or_default() == "zh-CN")'
    text = replace_exact(text, glyph_old, glyph_new, "manager CJK glyph range")

    target.write_text(text, encoding="utf-8")
    print(f"applied manager overlay compatibility/localization fixes: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
