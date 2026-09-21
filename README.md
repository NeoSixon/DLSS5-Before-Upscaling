<p align="center">
  <img src="https://raw.githubusercontent.com/NeoSixon/DLSS5-Before-Upscaling/main/standalone/renderer/icon-source.png?v=4" width="160" alt="DLSS5 Before Upscaling icon">
</p>

<h1 align="center">DLSS5 Before Upscaling</h1>

<p align="center">
  Configure DLSS 5 Neural Rendering before the upscaling stage.
</p>

<p align="center">
  <code>Windows</code>&nbsp;&nbsp;
  <code>Before Upscaling</code>&nbsp;&nbsp;
  <code>1–3 passes</code>&nbsp;&nbsp;
  <code>Per-pass styles</code>&nbsp;&nbsp;
  <code>In-game overlay</code>
</p>

<p align="center">
  <img src="docs/screenshots/library.png?v=4c5f7b3f" width="720" alt="DLSS5 Before Upscaling game library">
</p>

---

## What it does

DLSS5 Before Upscaling gives each supported game its own Neural Rendering profile. It discovers installed titles, checks the usable rendering path, installs the managed backend, and keeps the controls for running Neural Rendering before DLSS Super Resolution in one place.

The desktop app handles setup and per-game configuration. Image-dependent tuning stays in the in-game panel, where changes can be judged against the actual frame.

## Download

**[Download the latest release from GitHub Releases](https://github.com/NeoSixon/DLSS5-Before-Upscaling/releases/latest).**

The Windows release is portable: download `DLSS5-Before-Upscaling.exe` and run it directly.

> Game compatibility varies by title, rendering path, and game updates.

## Quick start

1. Download and run `DLSS5-Before-Upscaling.exe`.
2. Click **Scan library** to discover installed launcher games, or choose **Add game**.
3. For a manually added title, choose the **game folder** first and select the recommended main executable. Use **Choose EXE manually** when needed.
4. Open the game from the Library.
5. Configure Neural Rendering:
   - Enable **DLSS 5 Neural Rendering**.
   - Enable **Pre-SR** to run Neural Rendering before DLSS Super Resolution.
   - Choose **1–3 passes**.
   - Choose **Standard**, **Natural**, or **Cinematic** independently for each active pass.
6. Click **Install / update backend**.
   - If `nvngx_dlssnr.dll` is not already available, the app asks you to select a trusted local copy.
   - The runtime is validated locally and can be cached for reuse.
7. Launch the game and keep its temporal upscaler enabled.
8. Press **Insert** in game to open the Neural Rendering panel and tune image-dependent settings.

To undo a managed installation, open the game profile and use **Restore original**.

## The render path

```text
Game frame
    │
    ▼
DLSS 5 Neural Rendering
    │
    ├── Pass 1  ── Standard / Natural / Cinematic
    ├── Pass 2  ── Standard / Natural / Cinematic
    └── Pass 3  ── Standard / Natural / Cinematic
    │
    ▼
Before Upscaling
    │
    ▼
DLSS Super Resolution
    │
    ▼
Output
```

For native DLSS titles, the app uses the detected DLSS path. Where supported, temporal FSR/XeSS inputs can be routed through the managed DLSS Super Resolution path.

## Inside the app 

<p align="center">
  <img src="docs/screenshots/profile.png?v=c7bd1b24" width="720" alt="DLSS5 Before Upscaling per-game Neural Rendering profile">
</p>

**Game library** — Scan installed libraries, add titles manually, search, filter, favorite, hide or remove entries without deleting game files.

**Per-game profiles** — See the detected rendering API, DLSS version and active route in the game header, then enable Neural Rendering, choose Pre-SR placement, set 1–3 passes, and configure each active pass independently.

**In-game panel** — Press **Insert** while the game is running to tune image-dependent settings against the actual frame.

**Artwork** — Steam entries use Steam library artwork when available. Non-Steam entries look for suitable artwork locally and fall back to the executable icon. No third-party artwork API key is required.

**Recovery** — Managed installs keep tracked backups so original game files can be restored from the app.

## Current scope

- Windows 10/11 x64
- 64-bit games with a supported DirectX 12 or Vulkan rendering path
- Native DLSS detection, including DLSS files outside the executable directory
- Supported temporal FSR/XeSS routing to managed DLSS Super Resolution
- DLSS 5 Neural Rendering enable / disable
- Before-upscaling (Pre-SR) placement
- 1–3 independent Neural Rendering passes
- Standard / Natural / Cinematic style selection per active pass
- Managed OptiScaler DLSS-NR Pre-SR Multipass backend
- Launcher discovery plus folder-based/manual game addition
- Steam and local game artwork discovery with executable-icon fallback
- English and Simplified Chinese UI
- Portable Windows build

## Runtime handling

`nvngx_dlssnr.dll` is **not redistributed** by this project.

When a runtime is needed, the app asks you to select a trusted local copy, validates it locally, and can cache that copy locally for reuse. DLSS5 Before Upscaling does not present itself as an NVIDIA product and does not imply NVIDIA affiliation or endorsement.

## Build from source

Requires Node.js 22+ on Windows.

```powershell
npm ci
npm start
npm test
npm run build:portable
```

The portable executable is written to:

```text
dist-standalone/
```

## Project layout

```text
standalone/
  core/        game discovery, profiles, install state and runtime handling
  renderer/    desktop UI, library, settings and branding

scripts/
  overlay patching and icon generation

test/
  standalone regression and renderer tests
```

## Credits & licenses

DLSS5 Before Upscaling is MIT licensed.

Small retained portions of the compatibility and library-discovery code are derived from **DLSS5-Swapper by Rakan Alkhaldi** under the MIT License. The managed Neural Rendering backend is based on the independently licensed **OptiScaler DLSS-NR Pre-SR Multipass** project.

Full notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Support

If the project is useful to you, development can be supported through [Buy Me a Coffee](https://buymeacoffee.com/NeoSixon).

---

<sub>
NVIDIA, GeForce, DLSS and related marks are trademarks of NVIDIA Corporation.
Their use here is descriptive only. DLSS5 Before Upscaling is an independent community project and is not affiliated with or endorsed by NVIDIA.
</sub>
