# Third-party notices

This standalone application is MIT-licensed, but it interacts with or contains portions derived from independently licensed projects. Those projects remain under their own licences.

## DLSS5-Swapper

Parts of the PE/game compatibility inspection code in `standalone/core/derived/pe.js` and launcher/game-library discovery logic in `standalone/core/derived/library.js` are derived from DLSS5-Swapper by Rakan Alkhaldi and are used under the MIT License.

MIT License

Copyright (c) 2026 Rakan Alkhaldi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Upstream project: https://github.com/rakanki911/DLSS5-Swapper

## OptiScaler DLSS-NR Pre-SR Multipass

The Neural Rendering backend is downloaded on demand from the independent GPL-3.0 project:

https://github.com/wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass

The application currently pins public release v0.7.7 and verifies the release archive with SHA-256 before extraction. The OptiScaler binaries are not included in this application's source or portable executable. During installation, the backend's own licence and attribution files are retained and copied alongside the deployed backend.

Pinned archive SHA-256:
`4a315a3b3ee495631bd7cb1f562f609af577443602e507bfc7a7e6749c296258`

## NVIDIA Neural Rendering runtime

`nvngx_dlssnr.dll` is not redistributed by this application. A user-supplied copy is validated locally and may be cached locally for reuse. No NVIDIA endorsement, affiliation or support is implied.

## Electron and npm dependencies

The packaged application also contains Electron and production npm dependencies such as `extract-zip`. They remain under their respective licences. Electron distributions include their own licence notices; npm package licence data remains attributable to the corresponding packages.
