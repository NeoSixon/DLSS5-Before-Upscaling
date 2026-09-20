#!/usr/bin/env python3
"""Route D3D12 NGX evaluate calls from every loaded NGX/DLSS layer through OptiScaler.

Death Stranding Director's Cut can create an OptiScaler-owned SuperSampling
handle while its per-frame evaluate call lives in a different loaded NGX/DLSS
module. Hooking only _nvngx.dll or the game-folder nvngx_dlss.dll therefore
leaves the managed handle idle.

This patch enumerates loaded modules after the managed DLSS feature has been
created, finds modules exporting D3D12 EvaluateFeature entry points and installs
small Detours shims. Only handles that belong to OptiScaler's Dx12 context map
are redirected back through OptiScaler. All other handles call the per-module
trampoline, so native DLSS evaluation used internally by OptiScaler is
preserved and recursion is avoided.
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
static bool Dlss5OwnsDx12Handle(const NVSDK_NGX_Handle* handle)
{
    if (handle == nullptr)
        return false;

    const auto it = Dx12Contexts.find(handle->Id);
    return it != Dx12Contexts.end() && it->second.feature != nullptr;
}

NVSDK_NGX_API NVSDK_NGX_Result NVSDK_CONV NVSDK_NGX_D3D12_EvaluateFeature(
    ID3D12GraphicsCommandList* InCmdList, const NVSDK_NGX_Handle* InFeatureHandle,
    NVSDK_NGX_Parameter* InParameters, PFN_NVSDK_NGX_ProgressCallback InCallback);
NVSDK_NGX_API NVSDK_NGX_Result NVSDK_CONV NVSDK_NGX_D3D12_EvaluateFeature_C(
    ID3D12GraphicsCommandList* InCmdList, const NVSDK_NGX_Handle* InFeatureHandle,
    const NVSDK_NGX_Parameter* InParameters, PFN_NVSDK_NGX_ProgressCallback_C InCallback);

using PFN_DLSS5_LAYER_EVALUATE = NVSDK_NGX_Result (NVSDK_CONV *)(
    ID3D12GraphicsCommandList*, const NVSDK_NGX_Handle*, NVSDK_NGX_Parameter*,
    PFN_NVSDK_NGX_ProgressCallback);
using PFN_DLSS5_LAYER_EVALUATE_C = NVSDK_NGX_Result (NVSDK_CONV *)(
    ID3D12GraphicsCommandList*, const NVSDK_NGX_Handle*, const NVSDK_NGX_Parameter*,
    PFN_NVSDK_NGX_ProgressCallback_C);

constexpr size_t DLSS5_MAX_NGX_LAYERS = 12;
static PFN_DLSS5_LAYER_EVALUATE Dlss5LayerEvaluate[DLSS5_MAX_NGX_LAYERS] {};
static PFN_DLSS5_LAYER_EVALUATE_C Dlss5LayerEvaluateC[DLSS5_MAX_NGX_LAYERS] {};
static void* Dlss5LayerTarget[DLSS5_MAX_NGX_LAYERS] {};
static void* Dlss5LayerTargetC[DLSS5_MAX_NGX_LAYERS] {};
static size_t Dlss5LayerCount = 0;
static size_t Dlss5LayerCountC = 0;
static bool Dlss5LayerScanDone = false;

template <size_t Slot>
static NVSDK_NGX_Result NVSDK_CONV Dlss5HookedLayerEvaluate(
    ID3D12GraphicsCommandList* cmdList, const NVSDK_NGX_Handle* featureHandle,
    NVSDK_NGX_Parameter* parameters, PFN_NVSDK_NGX_ProgressCallback callback)
{
    if (Dlss5OwnsDx12Handle(featureHandle))
    {
        static bool reported = false;
        if (!reported)
        {
            reported = true;
            LOG_INFO("DLSS-NR compatibility: NGX layer {} D3D12 EvaluateFeature intercepted managed handle {}",
                     Slot, featureHandle->Id);
        }

        return NVSDK_NGX_D3D12_EvaluateFeature(cmdList, featureHandle, parameters, callback);
    }

    const auto original = Dlss5LayerEvaluate[Slot];
    return original != nullptr
               ? original(cmdList, featureHandle, parameters, callback)
               : NVSDK_NGX_Result_FAIL_FeatureNotFound;
}

template <size_t Slot>
static NVSDK_NGX_Result NVSDK_CONV Dlss5HookedLayerEvaluateC(
    ID3D12GraphicsCommandList* cmdList, const NVSDK_NGX_Handle* featureHandle,
    const NVSDK_NGX_Parameter* parameters, PFN_NVSDK_NGX_ProgressCallback_C callback)
{
    if (Dlss5OwnsDx12Handle(featureHandle))
    {
        static bool reported = false;
        if (!reported)
        {
            reported = true;
            LOG_INFO("DLSS-NR compatibility: NGX layer {} D3D12 EvaluateFeature_C intercepted managed handle {}",
                     Slot, featureHandle->Id);
        }

        return NVSDK_NGX_D3D12_EvaluateFeature_C(cmdList, featureHandle, parameters, callback);
    }

    const auto original = Dlss5LayerEvaluateC[Slot];
    return original != nullptr
               ? original(cmdList, featureHandle, parameters, callback)
               : NVSDK_NGX_Result_FAIL_FeatureNotFound;
}

static PFN_DLSS5_LAYER_EVALUATE Dlss5LayerHooks[DLSS5_MAX_NGX_LAYERS] = {
    Dlss5HookedLayerEvaluate<0>, Dlss5HookedLayerEvaluate<1>, Dlss5HookedLayerEvaluate<2>,
    Dlss5HookedLayerEvaluate<3>, Dlss5HookedLayerEvaluate<4>, Dlss5HookedLayerEvaluate<5>,
    Dlss5HookedLayerEvaluate<6>, Dlss5HookedLayerEvaluate<7>, Dlss5HookedLayerEvaluate<8>,
    Dlss5HookedLayerEvaluate<9>, Dlss5HookedLayerEvaluate<10>, Dlss5HookedLayerEvaluate<11>
};
static PFN_DLSS5_LAYER_EVALUATE_C Dlss5LayerHooksC[DLSS5_MAX_NGX_LAYERS] = {
    Dlss5HookedLayerEvaluateC<0>, Dlss5HookedLayerEvaluateC<1>, Dlss5HookedLayerEvaluateC<2>,
    Dlss5HookedLayerEvaluateC<3>, Dlss5HookedLayerEvaluateC<4>, Dlss5HookedLayerEvaluateC<5>,
    Dlss5HookedLayerEvaluateC<6>, Dlss5HookedLayerEvaluateC<7>, Dlss5HookedLayerEvaluateC<8>,
    Dlss5HookedLayerEvaluateC<9>, Dlss5HookedLayerEvaluateC<10>, Dlss5HookedLayerEvaluateC<11>
};

static bool Dlss5AddressAlreadyHooked(void* address, void* const* targets, size_t count)
{
    for (size_t i = 0; i < count; ++i)
        if (targets[i] == address)
            return true;
    return false;
}

static void Dlss5InstallLayerEvaluate(void* address, const wchar_t* modulePath)
{
    if (address == nullptr || Dlss5LayerCount >= DLSS5_MAX_NGX_LAYERS ||
        Dlss5AddressAlreadyHooked(address, Dlss5LayerTarget, Dlss5LayerCount))
        return;

    const size_t slot = Dlss5LayerCount;
    Dlss5LayerTarget[slot] = address;
    Dlss5LayerEvaluate[slot] = reinterpret_cast<PFN_DLSS5_LAYER_EVALUATE>(address);

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());
    DetourAttach(&(PVOID&) Dlss5LayerEvaluate[slot], Dlss5LayerHooks[slot]);
    const auto result = DetourTransactionCommit();
    if (result != NO_ERROR)
    {
        LOG_WARN("DLSS-NR compatibility: failed to hook D3D12 EvaluateFeature in {}: {:X}",
                 wstring_to_string(modulePath), result);
        Dlss5LayerEvaluate[slot] = nullptr;
        Dlss5LayerTarget[slot] = nullptr;
        return;
    }

    LOG_INFO("DLSS-NR compatibility: hooked NGX layer {} D3D12 EvaluateFeature in {}",
             slot, wstring_to_string(modulePath));
    ++Dlss5LayerCount;
}

static void Dlss5InstallLayerEvaluateC(void* address, const wchar_t* modulePath)
{
    if (address == nullptr || Dlss5LayerCountC >= DLSS5_MAX_NGX_LAYERS ||
        Dlss5AddressAlreadyHooked(address, Dlss5LayerTargetC, Dlss5LayerCountC) ||
        Dlss5AddressAlreadyHooked(address, Dlss5LayerTarget, Dlss5LayerCount))
        return;

    const size_t slot = Dlss5LayerCountC;
    Dlss5LayerTargetC[slot] = address;
    Dlss5LayerEvaluateC[slot] = reinterpret_cast<PFN_DLSS5_LAYER_EVALUATE_C>(address);

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());
    DetourAttach(&(PVOID&) Dlss5LayerEvaluateC[slot], Dlss5LayerHooksC[slot]);
    const auto result = DetourTransactionCommit();
    if (result != NO_ERROR)
    {
        LOG_WARN("DLSS-NR compatibility: failed to hook D3D12 EvaluateFeature_C in {}: {:X}",
                 wstring_to_string(modulePath), result);
        Dlss5LayerEvaluateC[slot] = nullptr;
        Dlss5LayerTargetC[slot] = nullptr;
        return;
    }

    LOG_INFO("DLSS-NR compatibility: hooked NGX layer C{} D3D12 EvaluateFeature_C in {}",
             slot, wstring_to_string(modulePath));
    ++Dlss5LayerCountC;
}

static void Dlss5ScanNgxEvaluateLayers()
{
    if (Dlss5LayerScanDone)
        return;
    Dlss5LayerScanDone = true;

    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, GetCurrentProcessId());
    if (snapshot == INVALID_HANDLE_VALUE)
    {
        LOG_WARN("DLSS-NR compatibility: module snapshot failed: {}", GetLastError());
        return;
    }

    MODULEENTRY32W entry {};
    entry.dwSize = sizeof(entry);
    size_t candidates = 0;

    if (Module32FirstW(snapshot, &entry))
    {
        do
        {
            if (entry.hModule == nullptr || entry.hModule == dllModule)
                continue;

            // Avoid modifying the host executable in general. Death Stranding is
            // the compatibility case that exposed this path and is a single-player
            // title, so allow its statically-linked NGX entry if present.
            if (entry.hModule == exeModule && _wcsicmp(entry.szModule, L"ds.exe") != 0)
                continue;

            auto evaluate = (void*) KernelBaseProxy::GetProcAddress_()(
                entry.hModule, "NVSDK_NGX_D3D12_EvaluateFeature");
            auto evaluateC = (void*) KernelBaseProxy::GetProcAddress_()(
                entry.hModule, "NVSDK_NGX_D3D12_EvaluateFeature_C");
            if (evaluate == nullptr && evaluateC == nullptr)
                continue;

            ++candidates;
            LOG_INFO("DLSS-NR compatibility: NGX evaluate candidate {} ({}) normal={} C={}",
                     wstring_to_string(entry.szExePath), wstring_to_string(entry.szModule),
                     evaluate != nullptr, evaluateC != nullptr);

            Dlss5InstallLayerEvaluate(evaluate, entry.szExePath);
            Dlss5InstallLayerEvaluateC(evaluateC, entry.szExePath);
        } while (Module32NextW(snapshot, &entry));
    }

    CloseHandle(snapshot);
    LOG_INFO("DLSS-NR compatibility: NGX evaluate layer scan complete, candidates={}, hooked={}+{}",
             candidates, Dlss5LayerCount, Dlss5LayerCountC);
}
'''


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-optiscaler-ngx-layer-evaluate.py <OptiScaler checkout>", file=sys.stderr)
        return 2

    root = pathlib.Path(sys.argv[1]).resolve()
    path = root / "OptiScaler" / "inputs" / "NVNGX_DLSS_Dx12.cpp"
    text = path.read_text(encoding="utf-8-sig")

    include_anchor = '#include <dxgi1_4.h>\n'
    text = replace_once(
        text,
        include_anchor,
        include_anchor + '#include <tlhelp32.h>\n',
        "Toolhelp module enumeration include",
    )

    static_anchor = r'''static ankerl::unordered_dense::map<unsigned int, ContextData<IFeature_Dx12>> Dx12Contexts;
static NgxFeatureRegistry HandleToFeature;
'''
    text = replace_once(
        text,
        static_anchor,
        static_anchor + HOOK_CODE,
        "NGX evaluate layer hook infrastructure",
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
        Dlss5ScanNgxEvaluateLayers();
    }

    return tryResult;
'''
    text = replace_once(
        text,
        create_anchor,
        create_replacement,
        "scan NGX layers after managed feature creation",
    )

    path.write_text(text, encoding="utf-8")
    print("applied multi-layer NGX D3D12 evaluate compatibility hooks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
