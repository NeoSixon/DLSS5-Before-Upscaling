#!/usr/bin/env python3
"""Route preloaded/original NGX D3D12 feature calls through OptiScaler.

Death Stranding can have an original NVIDIA NGX core function pointer alive even
though later LoadLibrary("nvngx.dll") calls are redirected to OptiScaler. In
that case feature creation may still appear healthy while per-frame evaluate
bypasses OptiScaler and DLSS-NR never receives the frame.

The pinned backend already detours GetFeatureRequirements on the original NGX
core. Extend that same detour set to D3D12 Create/Evaluate/Release. Internal
OptiScaler calls keep using the Detours trampolines so there is no recursion.
"""

from __future__ import annotations

import pathlib
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-optiscaler-preloaded-ngx-core.py <OptiScaler checkout>", file=sys.stderr)
        return 2

    root = pathlib.Path(sys.argv[1]).resolve()
    target = root / "OptiScaler" / "proxies" / "NVNGX_Proxy.h"
    text = target.read_text(encoding="utf-8-sig")

    type_anchor = r'''typedef NVSDK_NGX_Result (*PFN_NVSDK_NGX_VULKAN_GetFeatureRequirements)(
    const VkInstance Instance, const VkPhysicalDevice PhysicalDevice,
    const NVSDK_NGX_FeatureDiscoveryInfo* FeatureDiscoveryInfo, NVSDK_NGX_FeatureRequirement* OutSupported);
'''
    type_block = type_anchor + r'''
typedef NVSDK_NGX_Result (NVSDK_CONV *PFN_DLSS5_D3D12_CreateFeature)(
    ID3D12GraphicsCommandList* InCmdList, NVSDK_NGX_Feature InFeatureID,
    NVSDK_NGX_Parameter* InParameters, NVSDK_NGX_Handle** OutHandle);
typedef NVSDK_NGX_Result (NVSDK_CONV *PFN_DLSS5_D3D12_EvaluateFeature)(
    ID3D12GraphicsCommandList* InCmdList, const NVSDK_NGX_Handle* InFeatureHandle,
    NVSDK_NGX_Parameter* InParameters, PFN_NVSDK_NGX_ProgressCallback InCallback);
typedef NVSDK_NGX_Result (NVSDK_CONV *PFN_DLSS5_D3D12_ReleaseFeature)(
    NVSDK_NGX_Handle* InHandle);
'''
    text = replace_once(text, type_anchor, type_block, "D3D12 hook typedefs")

    ptr_anchor = r'''inline static PFN_NVSDK_NGX_D3D1X_GetFeatureRequirements Original_D3D11_GetFeatureRequirements = nullptr;
inline static PFN_NVSDK_NGX_D3D1X_GetFeatureRequirements Original_D3D12_GetFeatureRequirements = nullptr;
inline static PFN_NVSDK_NGX_VULKAN_GetFeatureRequirements Original_Vulkan_GetFeatureRequirements = nullptr;
'''
    ptr_block = ptr_anchor + r'''
inline static PFN_DLSS5_D3D12_CreateFeature Original_D3D12_CreateFeature = nullptr;
inline static PFN_DLSS5_D3D12_EvaluateFeature Original_D3D12_EvaluateFeature = nullptr;
inline static PFN_DLSS5_D3D12_ReleaseFeature Original_D3D12_ReleaseFeature = nullptr;
'''
    text = replace_once(text, ptr_anchor, ptr_block, "D3D12 hook pointers")

    hook_anchor = r'''inline static NVSDK_NGX_Result __stdcall Hooked_Vulkan_GetFeatureRequirements(
    const VkInstance Instance, const VkPhysicalDevice PhysicalDevice,
    const NVSDK_NGX_FeatureDiscoveryInfo* FeatureDiscoveryInfo, NVSDK_NGX_FeatureRequirement* OutSupported)
{
    LOG_FUNC();

    auto result = Original_Vulkan_GetFeatureRequirements(Instance, PhysicalDevice, FeatureDiscoveryInfo, OutSupported);

    if (result == NVSDK_NGX_Result_Success && FeatureDiscoveryInfo->FeatureID == NVSDK_NGX_Feature_SuperSampling)
    {
        LOG_INFO("Spoofing support!");
        OutSupported->FeatureSupported = NVSDK_NGX_FeatureSupportResult_Supported;
        OutSupported->MinHWArchitecture = 0;
        strcpy_s(OutSupported->MinOSVersion, "10.0.10240.16384");
    }

    return result;
}
'''
    hook_block = hook_anchor + r'''
inline static NVSDK_NGX_Result NVSDK_CONV Hooked_Dlss5_D3D12_CreateFeature(
    ID3D12GraphicsCommandList* InCmdList, NVSDK_NGX_Feature InFeatureID,
    NVSDK_NGX_Parameter* InParameters, NVSDK_NGX_Handle** OutHandle)
{
    static bool reported = false;
    if (!reported)
    {
        reported = true;
        LOG_INFO("DLSS-NR compatibility: preloaded NGX D3D12 CreateFeature intercepted");
    }

    return NVSDK_NGX_D3D12_CreateFeature(InCmdList, InFeatureID, InParameters, OutHandle);
}

inline static NVSDK_NGX_Result NVSDK_CONV Hooked_Dlss5_D3D12_EvaluateFeature(
    ID3D12GraphicsCommandList* InCmdList, const NVSDK_NGX_Handle* InFeatureHandle,
    NVSDK_NGX_Parameter* InParameters, PFN_NVSDK_NGX_ProgressCallback InCallback)
{
    static bool reported = false;
    if (!reported)
    {
        reported = true;
        LOG_INFO("DLSS-NR compatibility: preloaded NGX D3D12 EvaluateFeature intercepted");
    }

    return NVSDK_NGX_D3D12_EvaluateFeature(InCmdList, InFeatureHandle, InParameters, InCallback);
}

inline static NVSDK_NGX_Result NVSDK_CONV Hooked_Dlss5_D3D12_ReleaseFeature(NVSDK_NGX_Handle* InHandle)
{
    return NVSDK_NGX_D3D12_ReleaseFeature(InHandle);
}
'''
    text = replace_once(text, hook_anchor, hook_block, "D3D12 hook functions")

    lookup_anchor = r'''    Original_Vulkan_GetFeatureRequirements =
        (PFN_NVSDK_NGX_VULKAN_GetFeatureRequirements) KernelBaseProxy::GetProcAddress_()(
            nvngx, "NVSDK_NGX_VULKAN_GetFeatureRequirements");
'''
    lookup_block = lookup_anchor + r'''
    Original_D3D12_CreateFeature =
        (PFN_DLSS5_D3D12_CreateFeature) KernelBaseProxy::GetProcAddress_()(
            nvngx, "NVSDK_NGX_D3D12_CreateFeature");
    Original_D3D12_EvaluateFeature =
        (PFN_DLSS5_D3D12_EvaluateFeature) KernelBaseProxy::GetProcAddress_()(
            nvngx, "NVSDK_NGX_D3D12_EvaluateFeature");
    Original_D3D12_ReleaseFeature =
        (PFN_DLSS5_D3D12_ReleaseFeature) KernelBaseProxy::GetProcAddress_()(
            nvngx, "NVSDK_NGX_D3D12_ReleaseFeature");
'''
    text = replace_once(text, lookup_anchor, lookup_block, "D3D12 hook lookups")

    cond_old = r'''    if (Original_D3D11_GetFeatureRequirements != nullptr || Original_D3D12_GetFeatureRequirements != nullptr ||
        Original_Vulkan_GetFeatureRequirements != nullptr)
'''
    cond_new = r'''    if (Original_D3D11_GetFeatureRequirements != nullptr || Original_D3D12_GetFeatureRequirements != nullptr ||
        Original_Vulkan_GetFeatureRequirements != nullptr || Original_D3D12_CreateFeature != nullptr ||
        Original_D3D12_EvaluateFeature != nullptr || Original_D3D12_ReleaseFeature != nullptr)
'''
    text = replace_once(text, cond_old, cond_new, "hook transaction condition")

    attach_anchor = r'''        if (Original_Vulkan_GetFeatureRequirements != nullptr)
            DetourAttach(&(PVOID&) Original_Vulkan_GetFeatureRequirements, Hooked_Vulkan_GetFeatureRequirements);
'''
    attach_block = attach_anchor + r'''
        if (Original_D3D12_CreateFeature != nullptr)
            DetourAttach(&(PVOID&) Original_D3D12_CreateFeature, Hooked_Dlss5_D3D12_CreateFeature);

        if (Original_D3D12_EvaluateFeature != nullptr)
            DetourAttach(&(PVOID&) Original_D3D12_EvaluateFeature, Hooked_Dlss5_D3D12_EvaluateFeature);

        if (Original_D3D12_ReleaseFeature != nullptr)
            DetourAttach(&(PVOID&) Original_D3D12_ReleaseFeature, Hooked_Dlss5_D3D12_ReleaseFeature);
'''
    text = replace_once(text, attach_anchor, attach_block, "D3D12 detour attach")

    reset_anchor = r'''            Original_D3D11_GetFeatureRequirements = nullptr;
            Original_D3D12_GetFeatureRequirements = nullptr;
            Original_Vulkan_GetFeatureRequirements = nullptr;
'''
    reset_block = reset_anchor + r'''            Original_D3D12_CreateFeature = nullptr;
            Original_D3D12_EvaluateFeature = nullptr;
            Original_D3D12_ReleaseFeature = nullptr;
'''
    reset_count = text.count(reset_anchor)
    if reset_count != 2:
        raise RuntimeError(f"D3D12 hook pointer resets: expected 2 matches, found {reset_count}")
    text = text.replace(reset_anchor, reset_block)

    unhook_cond_old = r'''    if (Original_D3D11_GetFeatureRequirements != nullptr || Original_D3D12_GetFeatureRequirements != nullptr)
'''
    unhook_cond_new = r'''    if (Original_D3D11_GetFeatureRequirements != nullptr || Original_D3D12_GetFeatureRequirements != nullptr ||
        Original_Vulkan_GetFeatureRequirements != nullptr || Original_D3D12_CreateFeature != nullptr ||
        Original_D3D12_EvaluateFeature != nullptr || Original_D3D12_ReleaseFeature != nullptr)
'''
    text = replace_once(text, unhook_cond_old, unhook_cond_new, "unhook condition")

    detach_anchor = r'''        if (Original_Vulkan_GetFeatureRequirements != nullptr)
            DetourDetach(&(PVOID&) Original_Vulkan_GetFeatureRequirements, Hooked_Vulkan_GetFeatureRequirements);
'''
    detach_block = detach_anchor + r'''
        if (Original_D3D12_CreateFeature != nullptr)
            DetourDetach(&(PVOID&) Original_D3D12_CreateFeature, Hooked_Dlss5_D3D12_CreateFeature);

        if (Original_D3D12_EvaluateFeature != nullptr)
            DetourDetach(&(PVOID&) Original_D3D12_EvaluateFeature, Hooked_Dlss5_D3D12_EvaluateFeature);

        if (Original_D3D12_ReleaseFeature != nullptr)
            DetourDetach(&(PVOID&) Original_D3D12_ReleaseFeature, Hooked_Dlss5_D3D12_ReleaseFeature);
'''
    text = replace_once(text, detach_anchor, detach_block, "D3D12 detour detach")

    create_assign = r'''            _module.D3D12_CreateFeature = (PFN_D3D12_CreateFeature) KernelBaseProxy::GetProcAddress_()(
                _module.dll, "NVSDK_NGX_D3D12_CreateFeature");
            _module.D3D12_ReleaseFeature = (PFN_D3D12_ReleaseFeature) KernelBaseProxy::GetProcAddress_()(
                _module.dll, "NVSDK_NGX_D3D12_ReleaseFeature");
'''
    create_new = r'''            _module.D3D12_CreateFeature = Original_D3D12_CreateFeature != nullptr
                ? (PFN_D3D12_CreateFeature) Original_D3D12_CreateFeature
                : (PFN_D3D12_CreateFeature) KernelBaseProxy::GetProcAddress_()(
                    _module.dll, "NVSDK_NGX_D3D12_CreateFeature");
            _module.D3D12_ReleaseFeature = Original_D3D12_ReleaseFeature != nullptr
                ? (PFN_D3D12_ReleaseFeature) Original_D3D12_ReleaseFeature
                : (PFN_D3D12_ReleaseFeature) KernelBaseProxy::GetProcAddress_()(
                    _module.dll, "NVSDK_NGX_D3D12_ReleaseFeature");
'''
    text = replace_once(text, create_assign, create_new, "internal create/release trampoline")

    eval_assign = r'''            _module.D3D12_EvaluateFeature = (PFN_D3D12_EvaluateFeature) KernelBaseProxy::GetProcAddress_()(
                _module.dll, "NVSDK_NGX_D3D12_EvaluateFeature");
'''
    eval_new = r'''            _module.D3D12_EvaluateFeature = Original_D3D12_EvaluateFeature != nullptr
                ? (PFN_D3D12_EvaluateFeature) Original_D3D12_EvaluateFeature
                : (PFN_D3D12_EvaluateFeature) KernelBaseProxy::GetProcAddress_()(
                    _module.dll, "NVSDK_NGX_D3D12_EvaluateFeature");
'''
    text = replace_once(text, eval_assign, eval_new, "internal evaluate trampoline")

    target.write_text(text, encoding="utf-8")
    print("applied preloaded/original NGX D3D12 routing compatibility patch")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
