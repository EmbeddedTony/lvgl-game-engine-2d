# Native LVGL playtesting

Use **Native LVGL** in the toolbar, or **F6**, to compile and play the current project inside the desktop editor. It runs the same generated C and `ui_*` entry point that firmware export uses. You do not need to export a directory, launch a browser, run a server or attach a board.

## Run a game

1. Open Native LVGL. Select the current scene, another scene, a named sequence or Game entry.
2. Click **Build & run**. The editor generates an immutable UI snapshot in its private cache, compiles the C hooks and starts a separate game process.
3. Focus the display and use WASD/arrows, Space for the action bit, and the mouse for real LVGL widgets. Escape pauses. The toolbar provides pause, restart, sequence Next step, mute and Stop.
4. Read compiler errors and `printf` output below the display. **Open at line** returns to the relevant authored C location. Edit, reopen the playtest and rebuild.

**Play** remains the fast preview of built-in behaviors. It starts immediately and does not compile C. **Native LVGL** runs custom C hooks, the portable game engine, real LVGL rendering/widgets and authored sequence transitions. Physical MCU deployment is a separate future board/build/flash adapter; this release does not upload firmware.

The first native build requires Apple's Command Line Tools (`xcode-select --install`) on macOS Apple Silicon. The app checks availability and explains a missing compiler. It bundles LVGL 9.4.0 headers and a prebuilt host library; it does not download dependencies during playtesting. Normal editing and export do not require a compiler.

## Source and runtime ownership

The generator is shared by native playtesting and firmware export. Native playtesting does not modify a saved project or publish anything into your firmware `ui/` directory. The compiler receives a fixed source list and argument array; project names and IDs never become shell commands. `LGE_DESKTOP_PLAYTEST=1` lets custom C guard board-specific includes/implementations. The editor currently compiles the authored `user/game_hooks.c` and generated engine files; extra firmware modules and board libraries are not automatically linked into a desktop build.

The default UI's LVGL thread runs on the game process's main loop. The host port supplies a memory display, a pointer input device, monotonic tick advancement and the audio backend. Exported runtime code remains independent of Electron. The display supports project resolutions from 16 to 2048 pixels per axis and 16/32-bit color. Frames are converted to RGBA for the editor canvas, with a maximum 30 Hz transfer rate. This is a host preview, not a measurement of board FPS or RAM.

The renderer has no Node access. A typed bridge sends generated files and specific controls to a main-process supervisor. That supervisor compiles in a private cache and owns the subprocess lifetime. Compiler output and game output are logs; binary frames and state use a separate protocol pipe, so `printf` cannot corrupt the display. One frame is allowed in flight until the canvas acknowledges it. Packet lengths, logs, command queues and audio command rates are bounded.

A stalled hook or infinite loop is terminated after roughly five seconds without a heartbeat. Stop, closing the panel/window, a renderer failure and application shutdown terminate the owned process group. Crashes or compiler errors leave the editor usable. This is process isolation for editor stability; authored native C runs with your local user permissions and is not a security sandbox. Code is executed only after an explicit Build & run action.

## Audio

The C engine owns voice allocation, priority, gain and scene teardown. The desktop backend sends play/stop/pause/gain commands using the same voice tokens as a board backend. A Web Audio adapter decodes the project's PCM WAV clips before execution, plays those commands and returns natural completions to the C loop. It does not apply cue/bus gain or priority a second time. Mute is local monitoring only. Missing/unavailable playback completes the voice so a silent preview cannot fill the runtime's voice pool indefinitely.

This verifies the engine-to-backend contract. It does not exercise an MCU filesystem, audio codec, worker queue, I²S/DAC/PWM driver, DMA, physical input or display flush timing. Host builds use a larger LVGL heap than constrained boards; budget and test the real target separately.

## Cache and reproducibility

The build key hashes the bundled SDK manifest, host port and every compiled source/header. Changing a C hook, scene/map/image definition or SDK makes a new build. Changing only the start target can reuse the executable. The cache retains at most eight completed/recent build directories in the application's user-data `Cache/native-playtest` directory. Failed/canceled builds never publish an executable. Restart reuses the current process's compiled code and recreates the UI from its original start target.

For source development, `npm run native:sdk` builds the pinned upstream LVGL commit once using CMake/Ninja. `LGE_LVGL_SOURCE` may point to a checkout of that exact commit. `npm run desktop:build` includes the SDK automatically. `npm run test:playtest` exercises real compiled C, frame backpressure, pointer input, movement, audio commands, pause, cache reuse, build errors, cancellation, blocked hooks and odd-sized 16/32-bit displays.

The host adapter uses LVGL's public [display setup](https://lvgl.io/docs/open/9.4/details/main-modules/display/setup) and [pointer input](https://lvgl.io/docs/open/9.4/details/main-modules/indev/pointer) APIs. Electron's [IPC API](https://www.electronjs.org/docs/latest/api/ipc-main) connects the isolated renderer to its supervisor.

## Inspect collision shapes

The project's **Pixel perfect rendering** preference applies to this display too. **Display zoom → Integer fit** preserves whole physical pixels and aspect ratio; explicit 1×–8× choices provide exact inspection with scrolling when needed. Scaled pointer input still maps to the original game coordinates. Zoom changes neither firmware dimensions nor gameplay state. See [Pixel Perfect](PixelPerfect.md) for artwork sizing and board-display integration.

The **Colliders** button overlays the runtime's actual rectangle and solid-tile collision shapes. Blue is a character, green is a static body and amber is a detection area. This goes through LVGL drawing, follows scene/parent transforms and creates no debug widgets. It is a playtest preference; the project and export are unchanged. Firmware can enable the same overlay with `ui_set_collision_debug(true)`.

Choose **Explore Physics Playground** on the welcome screen, or **Help → Open Physics Playground**, for gravity, platforms, a child hurtbox, a hazard hitbox and a checkpoint. Move with A/D and jump with Space/Up. The native Output log identifies the entering hitbox/hurtbox pair; the linked hazard sound uses the same audio adapter as other cues. See [Physics](Physics.md) for the layer, shape and callback contracts.
