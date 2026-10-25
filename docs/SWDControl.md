# SWD game control

The CLI can control a running STM32H7S78-DK game through its existing ST-LINK connection. It sends commands to a small RAM mailbox using CubeProgrammer HOTPLUG reads/writes. The game executes them on the LVGL owner thread. No serial firmware console, breakpoint, MCU reset or reflashing is needed for each test.

## Build and connect

Export a current project configured for STM32H7S78-DK, then build:

```sh
./bin/lge build --project-path /path/Game.lge.json \
  --output /path/new-build --debug-swd
```

Flash the application using the existing board workflow. Use the **exact build-report.json corresponding to the running image**. Each development build has a new identity tag; a mismatched report is rejected before command writes. Do not use the output report of a subsequent rebuild with an older running image.

```sh
LGE_REPORT=/path/new-build/build-report.json
LGE_PROBE=0033004E3033510135393935
./bin/lge board status --build-report "$LGE_REPORT" --serial "$LGE_PROBE"
./bin/lge commands --query board
```

The standalone desktop app includes the same `lge` executable in `Contents/MacOS` on macOS. It runs without a system Node installation. Tool settings from the editor are reused; `--programmer /absolute/path/STM32_Programmer_CLI` overrides discovery.

## Controls

Every command accepts `--build-report` and `--serial`. Results use the existing single JSON envelope on stdout. Select commands with `lge help --command board.input`, for example.

```sh
./bin/lge board input --build-report "$LGE_REPORT" --serial "$LGE_PROBE" \
  --actions up,jump --duration-ms 2000
./bin/lge board camera --build-report "$LGE_REPORT" --serial "$LGE_PROBE" --yaw 45 --pitch -5
./bin/lge board camera --build-report "$LGE_REPORT" --serial "$LGE_PROBE" --zoom -2
./bin/lge board camera --build-report "$LGE_REPORT" --serial "$LGE_PROBE" --recenter
./bin/lge board warp --build-report "$LGE_REPORT" --serial "$LGE_PROBE" --x -42 --y 2 --z 40
./bin/lge board pause --build-report "$LGE_REPORT" --serial "$LGE_PROBE" --duration-ms 10000
./bin/lge board resume --build-report "$LGE_REPORT" --serial "$LGE_PROBE"
./bin/lge board release --build-report "$LGE_REPORT" --serial "$LGE_PROBE"
./bin/lge board reload --build-report "$LGE_REPORT" --serial "$LGE_PROBE"
```

Actions: `left`, `right`, `up`, `down`, `jump`/`action`, `sword`/`talk`/`interact`, `lock`/`menu`, `none`. The firmware receives the normal seven-bit engine input mask; project behaviors determine its meaning. A held jump/interact generates one rising edge. Release and press again for another edge.

Input ownership suppresses physical mapped movement/actions and world camera dragging. Leases last 100–120000 ms, default 5000. Expiry releases held input and restores the preceding pause state; explicit `resume` selects a resumed baseline. `release` returns control immediately. A crashed client cannot hold movement or pause indefinitely. Scene reload and warp are test operations: they can change session progress and trigger ordinary project hooks; they are not checkpoint restore operations.

## Capture and measure

```sh
./bin/lge board capture --build-report "$LGE_REPORT" --serial "$LGE_PROBE" \
  --surface world --output /path/new-world.png
./bin/lge board capture --build-report "$LGE_REPORT" --serial "$LGE_PROBE" \
  --surface display --output /path/new-display.png
./bin/lge board benchmark --build-report "$LGE_REPORT" --serial "$LGE_PROBE" \
  --actions up --seconds 10 --output /path/new-measurements.json
```

Capture temporarily freezes simulation and releases automation before returning. `state` describes the frozen capture; `releasedState` describes the control state afterward. An existing PNG/JSON is never overwritten. Captures require a functioning display and stable firmware; they show framebuffer contents, not a photograph of the physical panel. The world source stays frozen; display diagnostics can continue updating during a display readback.

Benchmark holds the requested actions, publishes position/input/timing samples, then releases. It reports whether the player actually moved. `worldFps` counts new CPU world renders; `displayFps` counts LVGL refreshes, which may also draw HUD/diagnostics without producing a new world frame. Paused/HUD-only rates are not gameplay FPS. `meanRasterUs` excludes GPU presentation and flush wait. Device reads occur sequentially, so state/display/raster timestamps can differ. Use the timestamped samples when interpreting spikes. The backend does not change resolution, artwork or quality settings.

For comparable runs, reload the same scene, start from the same player/camera position, use the same actions/duration, and compare the complete samples. A route can include falls/respawns or become blocked; a nonzero input mask alone does not prove movement.

## Implementation

- `ports/stm32h7s78/debug_mailbox.{h,c}`: portable C99 request/ack/seqlock processor, duplicate suppression and wrap-safe leases. No allocation, HAL or LVGL dependency.
- `ports/stm32h7s78/debug_swd.c`: board/UI adapter with finite bounds checks. The fixed 512-byte mailbox lives in uncached RAM_CMD and is initialized explicitly because that section is NOLOAD.
- `desktop/board/debug-swd.cjs`: CubeProgrammer transport, identity/range checks, PNG capture and measurement aggregation. CLI writes are confined to the host-owned 128 bytes of the mailbox; frame captures only read validated RAM ranges.
- `desktop/board/probe-lock.cjs`: cross-process USB ownership shared with editor flashing and monitoring. Stop another debugger/monitor before a CLI operation; external ST tools do not participate in this lock.
- `src/automation/manifest.ts`: discoverable command contracts shared with the CLI.

The request contains a nonzero sequence twice. The host invalidates the commit word, writes the payload, then commits the sequence last. The firmware accepts a coherent request once, acknowledges success/rejection, and publishes state under a separate seqlock. Board actions execute in a foreground timer, never the SWD peripheral or an ISR. Release failures are reported; lease expiry remains the fallback.

The portable engine's `lge_override_input(engine, enabled, mask)` belongs on the owner thread. It supplies effective input while retaining normal fixed-step/edge semantics and clears held state when ownership changes. Ordinary input APIs remain unchanged when no override is active.
