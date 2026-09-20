#!/usr/bin/env python3
"""Patch pinned OptiScaler with legacy NGX C EvaluateFeature entry points.

Some NGX clients resolve NVSDK_NGX_D3D11/12_EvaluateFeature_C instead of the
C++ callback form. The pinned backend declares those exports in NVIDIA's header
but does not define them, so a client can create a DLSS feature through
OptiScaler and then evaluate it through a path OptiScaler never sees.

Bridge the C callback ABI into OptiScaler's existing EvaluateFeature functions.
All routing, DLSS-NR placement and backend logic stays in the existing code.
"""

from __future__ import annotations

import pathlib
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new)


DX12_WRAPPER = r'''
namespace
{
thread_local PFN_NVSDK_NGX_ProgressCallback_C g_dlss5D3D12CProgress = nullptr;

void NVSDK_CONV Dlss5D3D12CProgressThunk(float progress, bool& cancel)
{
    if (g_dlss5D3D12CProgress == nullptr)
        return;

    bool cCancel = cancel;
    g_dlss5D3D12CProgress(progress, &cCancel);
    cancel = cCancel;
}
} // namespace

NVSDK_NGX_API NVSDK_NGX_Result NVSDK_CONV NVSDK_NGX_D3D12_EvaluateFeature_C(
    ID3D12GraphicsCommandList* InCmdList, const NVSDK_NGX_Handle* InFeatureHandle,
    const NVSDK_NGX_Parameter* InParameters, PFN_NVSDK_NGX_ProgressCallback_C InCallback)
{
    static bool reported = false;
    if (!reported)
    {
        reported = true;
        LOG_INFO("DLSS-NR compatibility: D3D12 C EvaluateFeature entry active");
    }

    const auto previous = g_dlss5D3D12CProgress;
    g_dlss5D3D12CProgress = InCallback;
    auto result = NVSDK_NGX_D3D12_EvaluateFeature(
        InCmdList, InFeatureHandle, const_cast<NVSDK_NGX_Parameter*>(InParameters),
        InCallback != nullptr ? Dlss5D3D12CProgressThunk : nullptr);
    g_dlss5D3D12CProgress = previous;
    return result;
}
'''

DX11_WRAPPER = r'''
namespace
{
thread_local PFN_NVSDK_NGX_ProgressCallback_C g_dlss5D3D11CProgress = nullptr;

void NVSDK_CONV Dlss5D3D11CProgressThunk(float progress, bool& cancel)
{
    if (g_dlss5D3D11CProgress == nullptr)
        return;

    bool cCancel = cancel;
    g_dlss5D3D11CProgress(progress, &cCancel);
    cancel = cCancel;
}
} // namespace

NVSDK_NGX_API NVSDK_NGX_Result NVSDK_CONV NVSDK_NGX_D3D11_EvaluateFeature_C(
    ID3D11DeviceContext* InDevCtx, const NVSDK_NGX_Handle* InFeatureHandle,
    const NVSDK_NGX_Parameter* InParameters, PFN_NVSDK_NGX_ProgressCallback_C InCallback)
{
    static bool reported = false;
    if (!reported)
    {
        reported = true;
        LOG_INFO("DLSS-NR compatibility: D3D11 C EvaluateFeature entry active");
    }

    const auto previous = g_dlss5D3D11CProgress;
    g_dlss5D3D11CProgress = InCallback;
    auto result = NVSDK_NGX_D3D11_EvaluateFeature(
        InDevCtx, InFeatureHandle, const_cast<NVSDK_NGX_Parameter*>(InParameters),
        InCallback != nullptr ? Dlss5D3D11CProgressThunk : nullptr);
    g_dlss5D3D11CProgress = previous;
    return result;
}
'''


def patch_dx12(root: pathlib.Path) -> None:
    path = root / "OptiScaler" / "inputs" / "NVNGX_DLSS_Dx12.cpp"
    text = path.read_text(encoding="utf-8-sig")

    route_old = r'''    LOG_DEBUG("DLSS-NR route: handle {}, NGX feature {}, upscaler {}, RR {}", handleId,
              tracked.feature ? (int) *tracked.feature : -1, nrUpscale, rayReconstruction);'''
    route_new = route_old + r'''
    static bool reportedNrEvaluateRoute = false;
    if (nrUpscale && !reportedNrEvaluateRoute)
    {
        reportedNrEvaluateRoute = true;
        LOG_INFO("DLSS-NR compatibility: D3D12 EvaluateFeature reached, handle {}, NGX feature {}, RR {}",
                 handleId, tracked.feature ? (int) *tracked.feature : -1, rayReconstruction);
    }'''
    text = replace_once(text, route_old, route_new, "D3D12 evaluate route diagnostic")

    anchor = r'''    return optiResult;
}

#pragma endregion

#pragma region DLSS Buffer Size Call'''
    replacement = r'''    return optiResult;
}
''' + DX12_WRAPPER + r'''
#pragma endregion

#pragma region DLSS Buffer Size Call'''
    text = replace_once(text, anchor, replacement, "D3D12 C evaluate bridge")
    path.write_text(text, encoding="utf-8")


def patch_dx11(root: pathlib.Path) -> None:
    path = root / "OptiScaler" / "inputs" / "NVNGX_DLSS_Dx11.cpp"
    text = path.read_text(encoding="utf-8-sig")

    anchor = r'''    return NVSDK_NGX_Result_Success;
}

#pragma endregion'''
    replacement = r'''    return NVSDK_NGX_Result_Success;
}
''' + DX11_WRAPPER + r'''
#pragma endregion'''
    if anchor not in text:
        raise RuntimeError("D3D11 C evaluate bridge: source pattern not found")
    head, tail = text.rsplit(anchor, 1)
    text = head + replacement + tail
    path.write_text(text, encoding="utf-8")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-optiscaler-legacy-ngx-evaluate.py <OptiScaler checkout>", file=sys.stderr)
        return 2

    root = pathlib.Path(sys.argv[1]).resolve()
    patch_dx12(root)
    patch_dx11(root)
    print("applied legacy NGX EvaluateFeature compatibility bridge")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
