#!/usr/bin/env python3
"""Hook the loaded DLSS feature snippet's D3D12 evaluate entry point.

Some older NGX clients can create the SuperSampling feature through the NGX core
but execute frames through the loaded nvngx_dlss.dll feature snippet. OptiScaler
then sees feature creation but never sees the per-frame EvaluateFeature call.

After OptiScaler creates its managed DLSS feature, hook the feature snippet's
D3D12 EvaluateFeature exports. Only handles owned by OptiScaler's Dx12 context
map are redirected back through OptiScaler. Calls for the underlying native
DLSS handle are forwarded to the original snippet trampoline, avoiding
recursion when OptiScaler evaluates native DLSS internally.
"""

from __future__ import annotations

import pathlib
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new)


HOOK_CODE = r'''
using PFN_DLSS5_SNIPPET_D3D12_EVALUATE = NVSDK_NGX_Result (NVSDK_CONV *)(
    ID3D12GraphicsCommandList*, const NVSDK_NGX_Handle*, NVSDK_NGX_Parameter*,
    PFN_NVSDK_NGX_ProgressCallback);
using PFN_DLSS5_SNIPPET_D3D12_EVALUATE_C = NVSDK_NGX_Result (NVSDK_CONV *)(
    ID3D12GraphicsCommandList*, const NVSDK_NGX_Handle*, const NVSDK_NGX_Parameter*,
    PFN_NVSDK_NGX_ProgressCallback_C);

static PFN_DLSS5_SNIPPET_D3D12_EVALUATE Dlss5OriginalSnippetEvaluate = nullptr;
static PFN_DLSS5_SNIPPET_D3D12_EVALUATE_C Dlss5OriginalSnippetEvaluateC = nullptr;
static HMODULE Dlss5SnippetModule = nullptr;
static bool Dlss5SnippetHookAttempted = false;

static bool Dlss5OwnsDx12Handle(const NVSDK_NGX_Handle* handle)
{
    if (handle == nullptr)
        return false;

    const auto it = Dx12Contexts.find(handle->Id);
    return it != Dx12Contexts.end() && it->second.feature != nullptr;
}

static NVSDK_NGX_Result NVSDK_CONV Dlss5HookedSnippetEvaluate(
    ID3D12GraphicsCommandList* cmdList, const NVSDK_NGX_Handle* featureHandle,
    NVSDK_NGX_Parameter* parameters, PFN_NVSDK_NGX_ProgressCallback callback)
{
    if (Dlss5OwnsDx12Handle(featureHandle))
    {
        static bool reported = false;
        if (!reported)
        {
            reported = true;
            LOG_INFO("DLSS-NR compatibility: nvngx_dlss.dll D3D12 EvaluateFeature intercepted managed handle {}",
                     featureHandle->Id);
        }

        return NVSDK_NGX_D3D12_EvaluateFeature(cmdList, featureHandle, parameters, callback);
    }

    return Dlss5OriginalSnippetEvaluate != nullptr
               ? Dlss5OriginalSnippetEvaluate(cmdList, featureHandle, parameters, callback)
               : NVSDK_NGX_Result_FAIL_FeatureNotFound;
}

static NVSDK_NGX_Result NVSDK_CONV Dlss5HookedSnippetEvaluateC(
    ID3D12GraphicsCommandList* cmdList, const NVSDK_NGX_Handle* featureHandle,
    const NVSDK_NGX_Parameter* parameters, PFN_NVSDK_NGX_ProgressCallback_C callback)
{
    if (Dlss5OwnsDx12Handle(featureHandle))
    {
        static bool reported = false;
        if (!reported)
        {
            reported = true;
            LOG_INFO("DLSS-NR compatibility: nvngx_dlss.dll D3D12 EvaluateFeature_C intercepted managed handle {}",
                     featureHandle->Id);
        }

        return NVSDK_NGX_D3D12_EvaluateFeature_C(cmdList, featureHandle, parameters, callback);
    }

    return Dlss5OriginalSnippetEvaluateC != nullptr
               ? Dlss5OriginalSnippetEvaluateC(cmdList, featureHandle, parameters, callback)
               : NVSDK_NGX_Result_FAIL_FeatureNotFound;
}

static void Dlss5EnsureSnippetEvaluateHooks()
{
    if (Dlss5SnippetHookAttempted)
        return;

    Dlss5SnippetHookAttempted = true;
    HMODULE module = GetModuleHandleW(L"nvngx_dlss.dll");
    if (module == nullptr)
    {
        LOG_WARN("DLSS-NR compatibility: nvngx_dlss.dll is not loaded after managed feature creation");
        return;
    }

    auto evaluate = (PFN_DLSS5_SNIPPET_D3D12_EVALUATE)
        KernelBaseProxy::GetProcAddress_()(module, "NVSDK_NGX_D3D12_EvaluateFeature");
    auto evaluateC = (PFN_DLSS5_SNIPPET_D3D12_EVALUATE_C)
        KernelBaseProxy::GetProcAddress_()(module, "NVSDK_NGX_D3D12_EvaluateFeature_C");

    if ((void*) evaluateC == (void*) evaluate)
        evaluateC = nullptr;

    if (evaluate == nullptr && evaluateC == nullptr)
    {
        LOG_WARN("DLSS-NR compatibility: nvngx_dlss.dll exposes no D3D12 EvaluateFeature entry");
        return;
    }

    Dlss5OriginalSnippetEvaluate = evaluate;
    Dlss5OriginalSnippetEvaluateC = evaluateC;

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    if (Dlss5OriginalSnippetEvaluate != nullptr)
        DetourAttach(&(PVOID&) Dlss5OriginalSnippetEvaluate, Dlss5HookedSnippetEvaluate);

    if (Dlss5OriginalSnippetEvaluateC != nullptr)
        DetourAttach(&(PVOID&) Dlss5OriginalSnippetEvaluateC, Dlss5HookedSnippetEvaluateC);

    const auto result = DetourTransactionCommit();
    if (result != NO_ERROR)
    {
        LOG_ERROR("DLSS-NR compatibility: failed to hook nvngx_dlss.dll EvaluateFeature exports: {:X}", result);
        Dlss5OriginalSnippetEvaluate = nullptr;
        Dlss5OriginalSnippetEvaluateC = nullptr;
        return;
    }

    Dlss5SnippetModule = module;
    LOG_INFO("DLSS-NR compatibility: hooked nvngx_dlss.dll D3D12 EvaluateFeature exports (Evaluate {}, Evaluate_C {})",
             evaluate != nullptr, evaluateC != nullptr);
}
'''


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-optiscaler-dlss-snippet-evaluate.py <OptiScaler checkout>", file=sys.stderr)
        return 2

    root = pathlib.Path(sys.argv[1]).resolve()
    path = root / "OptiScaler" / "inputs" / "NVNGX_DLSS_Dx12.cpp"
    text = path.read_text(encoding="utf-8-sig")

    static_anchor = r'''static ankerl::unordered_dense::map<unsigned int, ContextData<IFeature_Dx12>> Dx12Contexts;
static NgxFeatureRegistry HandleToFeature;
'''
    text = replace_once(
        text,
        static_anchor,
        static_anchor + HOOK_CODE,
        "snippet evaluate hook infrastructure",
    )

    create_anchor = r'''    auto tryResult = TryCreateOptiFeature(InCmdList, InFeatureID, InParameters, OutHandle);

    if (tryResult == NVSDK_NGX_Result_Success && *OutHandle)
        HandleToFeature.Record((*OutHandle)->Id, InFeatureID);

    return tryResult;
'''
    create_replacement = r'''    auto tryResult = TryCreateOptiFeature(InCmdList, InFeatureID, InParameters, OutHandle);

    if (tryResult == NVSDK_NGX_Result_Success && *OutHandle)
    {
        HandleToFeature.Record((*OutHandle)->Id, InFeatureID);
        Dlss5EnsureSnippetEvaluateHooks();
    }

    return tryResult;
'''
    text = replace_once(
        text,
        create_anchor,
        create_replacement,
        "install snippet hook after managed feature creation",
    )

    path.write_text(text, encoding="utf-8")
    print("applied nvngx_dlss.dll D3D12 evaluate compatibility hook")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
