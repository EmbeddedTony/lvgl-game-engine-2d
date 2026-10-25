# Desktop releases

## macOS Apple Silicon preview v0.2.0

Download from the public repository's [GitHub releases](https://github.com/EmbeddedTony/lvgl-game-engine-2d/releases).

- Architecture: Apple Silicon ARM64 (M-series Macs); no Intel build is supplied.
- App minimum: macOS 13.0. The bundled native LVGL library also targets 13.0.
  Release validation was performed on macOS 26.5.1; older macOS versions were
  not physically tested.
- Formats: DMG with an Applications shortcut, and ZIP containing the `.app`.
- The editor, Play preview and export need no browser, Node.js, npm or dev server.
- Native LVGL testing additionally needs Apple Command Line Tools (`xcode-select --install`).
- Building/flashing a DK requires the separate firmware toolchain and STM32
  programmer documented in the board guide; they are not supplied in this download.
- The 2D edition has its own application profile and recovery storage.
- The custom noncommercial license applies; engine distributions must include
  corresponding source, and forks must preserve the required visible attribution.
  Third-party notices remain in the app resources and native SDK.

The preview is **ad-hoc signed, not Developer ID signed or notarized**. Ad-hoc
signing provides local code-integrity signatures, not verified publisher identity
or Apple notarization. After downloading, macOS may block the first launch. If
macOS offers it, use **System Settings → Privacy & Security → Open Anyway** for
this app. Do not disable Gatekeeper globally. Seamless normal distribution will
require an Apple Developer ID Application certificate and notarization setup.

The release includes `SHA256SUMS.txt`. Verify a downloaded asset with:

```sh
shasum -a 256 -c SHA256SUMS.txt
```

Keep the downloaded DMG, ZIP and license beside the checksum file when verifying
all entries. The release tag identifies the corresponding source code.

## Rebuild on this Mac

```sh
npm ci
npm run desktop:dist
```

The command prepares the renderer, native LVGL SDK, standalone CLI and app bundle,
then produces ARM64 DMG and ZIP archives under `release/`. The SDK's fingerprint
includes its macOS deployment target so an older host-specific build is rebuilt.
Build artifacts are ignored by Git.

## Experimental Windows and Linux builds

The release also supplies **experimental x64** Windows NSIS (`.exe`) and Linux
AppImage downloads. The title bar labels these platforms Experimental. Editing,
the built-in Play preview, and LVGL C export are included. Native LVGL C playtesting
is deliberately unavailable, with a visible explanation; the Mac library is not
bundled into these builds. Board hardware integration and driver behavior have
not been validated on either platform.

The Windows installer is not Authenticode-signed and may trigger SmartScreen or
publisher warnings. The Linux AppImage may need `chmod +x` before running; systems
without FUSE can use its `--appimage-extract-and-run` option. These are preview
builds and should be tested with copies of important projects.

A Windows device is not required to produce them. The manually triggered
`Experimental Windows and Linux packages` GitHub Actions workflow builds them
on Windows Server 2022 and Ubuntu 22.04 runners. Each job checks actual packaged
GUI startup, movement in Play, the unavailable-native message, and CLI C export
before uploading its installer artifact. Artifacts are attached to a GitHub
release separately by the repository owner; the workflow cannot publish releases
or merge source changes.

For full native C playtesting, add a per-platform LVGL SDK, compiler discovery and
platform-appropriate native host/IPC handling, then run packaged native-game
regressions. The experimental label does not claim that functionality is complete.
