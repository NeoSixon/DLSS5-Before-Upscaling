#!/usr/bin/env python3
"""Redirect Death Stranding's NGX procedure resolution to OptiScaler.

The game can load nvngx.dll through OptiScaler yet resolve the per-frame
D3D12 EvaluateFeature entry through a different loader path. Export detours
then sit idle even though feature creation reached OptiScaler.

For ds.exe only, intercept both Win32 GetProcAddress and ntdll
LdrGetProcedureAddress. Requests for the two D3D12 EvaluateFeature entry
points are returned from the already-loaded OptiScaler module. Internal
OptiScaler lookups use the unhooked KernelBase proxy and are unaffected.
"""

from __future__ import annotations

import pathlib
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new)


KERNEL_HELPER = r'''
static bool Dlss5DeathStrandingProcess()
{
    auto name = Util::ExePath().filename().wstring();
    return _wcsicmp(name.c_str(), L"ds.exe") == 0;
}

static FARPROC Dlss5RedirectNgxProcAddress(LPCSTR procName)
{
    if (!Dlss5DeathStrandingProcess() || procName == nullptr)
        return nullptr;

    if (lstrcmpA(procName, "NVSDK_NGX_D3D12_EvaluateFeature") != 0 &&
        lstrcmpA(procName, "NVSDK_NGX_D3D12_EvaluateFeature_C") != 0)
        return nullptr;

    auto redirected = KernelBaseProxy::GetProcAddress_()(dllModule, procName);
    if (redirected != nullptr)
    {
        static bool reported = false;
        if (!reported)
        {
            reported = true;
            LOG_INFO("DLSS-NR compatibility: Death Stranding NGX GetProcAddress redirected to OptiScaler");
        }
    }
    return redirected;
}
'''

NTDLL_HELPER = r'''
    static bool Dlss5DeathStrandingProcess()
    {
        auto name = Util::ExePath().filename().wstring();
        return _wcsicmp(name.c_str(), L"ds.exe") == 0;
    }

    static bool Dlss5NgxEvaluateName(const std::string& name)
    {
        return name == "NVSDK_NGX_D3D12_EvaluateFeature" ||
               name == "NVSDK_NGX_D3D12_EvaluateFeature_C";
    }

    static NTSTATUS NTAPI hkLdrGetProcedureAddress(PVOID ModuleHandle, PANSI_STRING FunctionName,
                                                    ULONG ProcedureNumber, PVOID* FunctionAddress)
    {
        if (FunctionAddress != nullptr && FunctionName != nullptr && FunctionName->Buffer != nullptr &&
            FunctionName->Length > 0 && Dlss5DeathStrandingProcess())
        {
            const std::string name(FunctionName->Buffer, FunctionName->Length);
            if (Dlss5NgxEvaluateName(name))
            {
                auto redirected = KernelBaseProxy::GetProcAddress_()(dllModule, name.c_str());
                if (redirected != nullptr)
                {
                    *FunctionAddress = reinterpret_cast<PVOID>(redirected);
                    static bool reported = false;
                    if (!reported)
                    {
                        reported = true;
                        LOG_INFO("DLSS-NR compatibility: Death Stranding LdrGetProcedureAddress redirected to OptiScaler");
                    }
                    return STATUS_SUCCESS;
                }
            }
        }

        return o_LdrGetProcedureAddress(ModuleHandle, FunctionName, ProcedureNumber, FunctionAddress);
    }
'''


def patch_kernel(root: pathlib.Path) -> None:
    path = root / "OptiScaler" / "hooks" / "Kernel_Hooks.cpp"
    text = path.read_text(encoding="utf-8-sig")

    anchor = r'''VALIDATE_HOOK(hk_K32_GetProcAddress, Kernel32Proxy::PFN_GetProcAddress)
FARPROC WINAPI KernelHooks::hk_K32_GetProcAddress(HMODULE hModule, LPCSTR lpProcName)
{'''
    text = replace_once(
        text,
        anchor,
        KERNEL_HELPER + "\n" + anchor,
        "Kernel GetProcAddress helper",
    )

    k32_return = r'''    return o_K32_GetProcAddress(hModule, lpProcName);
}

VALIDATE_HOOK(hk_K32_GetModuleHandleA'''
    k32_new = r'''    if (auto redirected = Dlss5RedirectNgxProcAddress(lpProcName); redirected != nullptr)
        return redirected;

    return o_K32_GetProcAddress(hModule, lpProcName);
}

VALIDATE_HOOK(hk_K32_GetModuleHandleA'''
    text = replace_once(text, k32_return, k32_new, "Kernel32 GetProcAddress redirect")

    kb_return = r'''    return o_KB_GetProcAddress(hModule, lpProcName);
}

VALIDATE_HOOK(hk_K32_GetFileAttributesW'''
    kb_new = r'''    if (auto redirected = Dlss5RedirectNgxProcAddress(lpProcName); redirected != nullptr)
        return redirected;

    return o_KB_GetProcAddress(hModule, lpProcName);
}

VALIDATE_HOOK(hk_K32_GetFileAttributesW'''
    text = replace_once(text, kb_return, kb_new, "KernelBase GetProcAddress redirect")

    path.write_text(text, encoding="utf-8")


def patch_ntdll_proxy(root: pathlib.Path) -> None:
    path = root / "OptiScaler" / "proxies" / "Ntdll_Proxy.h"
    text = path.read_text(encoding="utf-8-sig")

    type_anchor = r'''    typedef NTSTATUS(NTAPI* PFN_LdrUnloadDll)(PVOID ModuleHandle);

    typedef NTSTATUS(NTAPI* PFN_RtlGetVersion)(PRTL_OSVERSIONINFOW lpVersionInformation);
'''
    type_new = r'''    typedef NTSTATUS(NTAPI* PFN_LdrUnloadDll)(PVOID ModuleHandle);
    typedef NTSTATUS(NTAPI* PFN_LdrGetProcedureAddress)(PVOID ModuleHandle, PANSI_STRING FunctionName,
                                                        ULONG ProcedureNumber, PVOID* FunctionAddress);

    typedef NTSTATUS(NTAPI* PFN_RtlGetVersion)(PRTL_OSVERSIONINFOW lpVersionInformation);
'''
    text = replace_once(text, type_anchor, type_new, "LdrGetProcedureAddress typedef")

    init_anchor = r'''        o_LdrUnloadDll = (PFN_LdrUnloadDll) GetProcAddress(_dll, "LdrUnloadDll");
        o_NtLoadDll = (PFN_NtLoadDll) GetProcAddress(_dll, "NtLoadDll");
'''
    init_new = r'''        o_LdrUnloadDll = (PFN_LdrUnloadDll) GetProcAddress(_dll, "LdrUnloadDll");
        o_LdrGetProcedureAddress =
            (PFN_LdrGetProcedureAddress) GetProcAddress(_dll, "LdrGetProcedureAddress");
        o_NtLoadDll = (PFN_NtLoadDll) GetProcAddress(_dll, "NtLoadDll");
'''
    text = replace_once(text, init_anchor, init_new, "LdrGetProcedureAddress init")

    hook_anchor = r'''    static PFN_NtLoadDll Hook_NtLoadDll(PVOID method)
    {'''
    hook_code = r'''    static PFN_LdrGetProcedureAddress Hook_LdrGetProcedureAddress(PVOID method)
    {
        auto addr = o_LdrGetProcedureAddress;

        DetourTransactionBegin();
        DetourUpdateThread(GetCurrentThread());
        DetourAttach(&(PVOID&) addr, method);
        auto detourResult = DetourTransactionCommit();
        if (detourResult != NO_ERROR)
        {
            LOG_ERROR("Failed to hook LdrGetProcedureAddress: {:X}", detourResult);
            return nullptr;
        }

        o_LdrGetProcedureAddress = addr;
        return addr;
    }

''' + hook_anchor
    text = replace_once(text, hook_anchor, hook_code, "LdrGetProcedureAddress hook method")

    ptr_anchor = r'''    inline static PFN_LdrUnloadDll o_LdrUnloadDll = nullptr;
    inline static PFN_NtLoadDll o_NtLoadDll = nullptr;
'''
    ptr_new = r'''    inline static PFN_LdrUnloadDll o_LdrUnloadDll = nullptr;
    inline static PFN_LdrGetProcedureAddress o_LdrGetProcedureAddress = nullptr;
    inline static PFN_NtLoadDll o_NtLoadDll = nullptr;
'''
    text = replace_once(text, ptr_anchor, ptr_new, "LdrGetProcedureAddress storage")

    path.write_text(text, encoding="utf-8")


def patch_ntdll_hooks(root: pathlib.Path) -> None:
    path = root / "OptiScaler" / "hooks" / "Ntdll_Hooks.h"
    text = path.read_text(encoding="utf-8-sig")

    ptr_anchor = r'''    inline static NtdllProxy::PFN_LdrLoadDll o_LdrLoadDll = nullptr;
    inline static NtdllProxy::PFN_LdrUnloadDll o_LdrUnloadDll = nullptr;
'''
    ptr_new = r'''    inline static NtdllProxy::PFN_LdrLoadDll o_LdrLoadDll = nullptr;
    inline static NtdllProxy::PFN_LdrUnloadDll o_LdrUnloadDll = nullptr;
    inline static NtdllProxy::PFN_LdrGetProcedureAddress o_LdrGetProcedureAddress = nullptr;
'''
    text = replace_once(text, ptr_anchor, ptr_new, "Ntdll hook storage")

    unload_anchor = r'''    static NTSTATUS NTAPI hkLdrUnloadDll(PVOID lpLibrary)
    {'''
    text = replace_once(
        text,
        unload_anchor,
        NTDLL_HELPER + "\n" + unload_anchor,
        "Ntdll procedure redirect helper",
    )

    validate_anchor = r'''    VALIDATE_MEMBER_HOOK(hkLdrUnloadDll, NtdllProxy::PFN_LdrUnloadDll)

  public:
'''
    validate_new = r'''    VALIDATE_MEMBER_HOOK(hkLdrUnloadDll, NtdllProxy::PFN_LdrUnloadDll)
    VALIDATE_MEMBER_HOOK(hkLdrGetProcedureAddress, NtdllProxy::PFN_LdrGetProcedureAddress)

  public:
'''
    text = replace_once(text, validate_anchor, validate_new, "Ntdll procedure validation")

    hook_anchor = r'''        if (o_LdrUnloadDll == nullptr)
            o_LdrUnloadDll = NtdllProxy::Hook_LdrUnloadDll(hkLdrUnloadDll);
'''
    hook_new = r'''        if (o_LdrUnloadDll == nullptr)
            o_LdrUnloadDll = NtdllProxy::Hook_LdrUnloadDll(hkLdrUnloadDll);

        if (o_LdrGetProcedureAddress == nullptr)
            o_LdrGetProcedureAddress = NtdllProxy::Hook_LdrGetProcedureAddress(hkLdrGetProcedureAddress);
'''
    text = replace_once(text, hook_anchor, hook_new, "Ntdll procedure hook registration")

    path.write_text(text, encoding="utf-8")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-optiscaler-ngx-proc-resolution.py <OptiScaler checkout>", file=sys.stderr)
        return 2

    root = pathlib.Path(sys.argv[1]).resolve()
    patch_kernel(root)
    patch_ntdll_proxy(root)
    patch_ntdll_hooks(root)
    print("applied Death Stranding NGX procedure-resolution compatibility patch")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
