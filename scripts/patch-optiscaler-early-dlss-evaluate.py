#!/usr/bin/env python3
"""Hook Death Stranding's DLSS snippet at load completion, before it can cache Evaluate.

The Director's Cut loads the NGX core through OptiScaler, but its render loop does
not call any of the Evaluate exports after feature creation. Post-create detours
therefore arrive too late. The likely path is a direct/cached pointer obtained
while nvngx_dlss.dll is being loaded.

For ds.exe only, this patch hooks nvngx_dlss.dll immediately after LdrLoadDll
returns it, before control returns to the loader's caller. Managed OptiScaler
handles (>= 1,000,000) are routed back through OptiScaler's Evaluate export.
Native handles stay on the original trampoline, so OptiScaler's own DLSS work
does not recurse.
"""

from __future__ import annotations

import pathlib
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new)


HELPER = r'''
    using Dlss5EarlyEval = NVSDK_NGX_Result (NVSDK_CONV *)(
        ID3D12GraphicsCommandList*, const NVSDK_NGX_Handle*, NVSDK_NGX_Parameter*,
        PFN_NVSDK_NGX_ProgressCallback);
    using Dlss5EarlyEvalC = NVSDK_NGX_Result (NVSDK_CONV *)(
        ID3D12GraphicsCommandList*, const NVSDK_NGX_Handle*, const NVSDK_NGX_Parameter*,
        PFN_NVSDK_NGX_ProgressCallback_C);

    inline static Dlss5EarlyEval dlss5EarlyOriginalEval = nullptr;
    inline static Dlss5EarlyEvalC dlss5EarlyOriginalEvalC = nullptr;
    inline static HMODULE dlss5EarlyModule = nullptr;

    static bool Dlss5DeathStrandingProcess()
    {
        auto name = Util::ExePath().filename().wstring();
        return _wcsicmp(name.c_str(), L"ds.exe") == 0;
    }

    static NVSDK_NGX_Result NVSDK_CONV Dlss5EarlyHookedEvaluate(
        ID3D12GraphicsCommandList* cmdList, const NVSDK_NGX_Handle* featureHandle,
        NVSDK_NGX_Parameter* parameters, PFN_NVSDK_NGX_ProgressCallback callback)
    {
        if (featureHandle != nullptr && featureHandle->Id >= 1000000u)
        {
            auto target = reinterpret_cast<Dlss5EarlyEval>(
                KernelBaseProxy::GetProcAddress_()(dllModule, "NVSDK_NGX_D3D12_EvaluateFeature"));
            if (target != nullptr)
            {
                static bool reported = false;
                if (!reported)
                {
                    reported = true;
                    LOG_INFO("DLSS-NR compatibility: early nvngx_dlss.dll Evaluate intercepted managed handle {}",
                             featureHandle->Id);
                }
                return target(cmdList, featureHandle, parameters, callback);
            }
        }

        return dlss5EarlyOriginalEval != nullptr
                   ? dlss5EarlyOriginalEval(cmdList, featureHandle, parameters, callback)
                   : NVSDK_NGX_Result_FAIL_FeatureNotFound;
    }

    static NVSDK_NGX_Result NVSDK_CONV Dlss5EarlyHookedEvaluateC(
        ID3D12GraphicsCommandList* cmdList, const NVSDK_NGX_Handle* featureHandle,
        const NVSDK_NGX_Parameter* parameters, PFN_NVSDK_NGX_ProgressCallback_C callback)
    {
        if (featureHandle != nullptr && featureHandle->Id >= 1000000u)
        {
            auto target = reinterpret_cast<Dlss5EarlyEvalC>(
                KernelBaseProxy::GetProcAddress_()(dllModule, "NVSDK_NGX_D3D12_EvaluateFeature_C"));
            if (target != nullptr)
            {
                static bool reported = false;
                if (!reported)
                {
                    reported = true;
                    LOG_INFO("DLSS-NR compatibility: early nvngx_dlss.dll Evaluate_C intercepted managed handle {}",
                             featureHandle->Id);
                }
                return target(cmdList, featureHandle, parameters, callback);
            }
        }

        return dlss5EarlyOriginalEvalC != nullptr
                   ? dlss5EarlyOriginalEvalC(cmdList, featureHandle, parameters, callback)
                   : NVSDK_NGX_Result_FAIL_FeatureNotFound;
    }

    static void Dlss5HookEarlyDlssSnippet(HMODULE module, std::wstring_view name)
    {
        if (!Dlss5DeathStrandingProcess() || module == nullptr || dlss5EarlyModule != nullptr ||
            !LibraryLoadHooks::EndsWithInsensitive(name, std::wstring_view(L"nvngx_dlss.dll")))
            return;

        auto evaluate = reinterpret_cast<Dlss5EarlyEval>(
            KernelBaseProxy::GetProcAddress_()(module, "NVSDK_NGX_D3D12_EvaluateFeature"));
        auto evaluateC = reinterpret_cast<Dlss5EarlyEvalC>(
            KernelBaseProxy::GetProcAddress_()(module, "NVSDK_NGX_D3D12_EvaluateFeature_C"));

        if (evaluate == nullptr && evaluateC == nullptr)
            return;

        if (reinterpret_cast<void*>(evaluate) == reinterpret_cast<void*>(evaluateC))
            evaluateC = nullptr;

        dlss5EarlyOriginalEval = evaluate;
        dlss5EarlyOriginalEvalC = evaluateC;

        DetourTransactionBegin();
        DetourUpdateThread(GetCurrentThread());

        if (dlss5EarlyOriginalEval != nullptr)
            DetourAttach(&(PVOID&) dlss5EarlyOriginalEval, Dlss5EarlyHookedEvaluate);
        if (dlss5EarlyOriginalEvalC != nullptr)
            DetourAttach(&(PVOID&) dlss5EarlyOriginalEvalC, Dlss5EarlyHookedEvaluateC);

        const auto result = DetourTransactionCommit();
        if (result != NO_ERROR)
        {
            LOG_WARN("DLSS-NR compatibility: early nvngx_dlss.dll hook failed: {:X}", result);
            dlss5EarlyOriginalEval = nullptr;
            dlss5EarlyOriginalEvalC = nullptr;
            return;
        }

        dlss5EarlyModule = module;
        LOG_INFO("DLSS-NR compatibility: hooked nvngx_dlss.dll immediately after load (Evaluate {}, Evaluate_C {})",
                 evaluate != nullptr, evaluateC != nullptr);
    }

'''


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-optiscaler-early-dlss-evaluate.py <OptiScaler checkout>", file=sys.stderr)
        return 2

    root = pathlib.Path(sys.argv[1]).resolve()
    path = root / "OptiScaler" / "hooks" / "Ntdll_Hooks.h"
    text = path.read_text(encoding="utf-8-sig")

    include_anchor = '#include <cwctype>\n'
    text = replace_once(
        text,
        include_anchor,
        include_anchor + '#include <d3d12.h>\n#include <nvsdk_ngx.h>\n',
        "NGX/D3D12 includes",
    )

    member_anchor = r'''    inline static NtdllProxy::PFN_LdrUnloadDll o_LdrUnloadDll = nullptr;

    static NTSTATUS NTAPI hkRtlGetVersion'''
    text = replace_once(
        text,
        member_anchor,
        r'''    inline static NtdllProxy::PFN_LdrUnloadDll o_LdrUnloadDll = nullptr;

''' + HELPER + r'''    static NTSTATUS NTAPI hkRtlGetVersion''',
        "early snippet hook members",
    )

    return_anchor = r'''        return o_LdrLoadDll(PathToFile, Flags, ModuleFileName, ModuleHandle);
    }

    static NTSTATUS NTAPI hkNtLoadDll'''
    return_replacement = r'''        const auto result = o_LdrLoadDll(PathToFile, Flags, ModuleFileName, ModuleHandle);
        if (NT_SUCCESS(result) && ModuleHandle != nullptr && *ModuleHandle != nullptr)
            Dlss5HookEarlyDlssSnippet((HMODULE) *ModuleHandle, name);
        return result;
    }

    static NTSTATUS NTAPI hkNtLoadDll'''
    text = replace_once(
        text,
        return_anchor,
        return_replacement,
        "post-LdrLoadDll snippet hook",
    )

    path.write_text(text, encoding="utf-8")
    print("applied Death Stranding early DLSS snippet evaluate hook")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
