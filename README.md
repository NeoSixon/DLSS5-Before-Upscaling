# DLSS5 Pre-SR Manager

A focused Windows manager for DLSS 5 Neural Rendering with Pre-SR placement, multipass profiles, and a compact in-game overlay.

> Independent community project. Not affiliated with or endorsed by NVIDIA.

## Features

- Discover installed games and add executables manually.
- Detect 64-bit games, rendering APIs, and native DLSS.
- Install and update a pinned OptiScaler DLSS-NR Pre-SR Multipass backend.
- Enable or disable Neural Rendering per game.
- Toggle Pre-SR placement.
- Configure one to three Neural Rendering passes and per-pass style profiles.
- Open a dedicated compact in-game overlay with `Insert`.
- Keep tracked backups and restore original game files.
- English and Simplified Chinese interface.
- Windows portable build.

## Runtime policy

`nvngx_dlssnr.dll` is **not distributed** with this project. When needed, the app asks the user to select a trusted local copy, validates it locally, and can cache it locally for reuse.

## Development

Requires Node.js 22+ on Windows.

```powershell
npm ci
npm start
npm test
npm run build:portable
```

The Windows portable build is written to `dist-standalone/`.

## Third-party software

Small retained portions are derived from DLSS5-Swapper under the MIT License. The in-game backend is based on the independently licensed OptiScaler DLSS-NR Pre-SR Multipass project. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

DLSS5 Pre-SR Manager is released under the MIT License. See [LICENSE](LICENSE).

NVIDIA, GeForce, DLSS and related marks are trademarks of NVIDIA Corporation. Their use here is descriptive only and does not imply affiliation or endorsement.
