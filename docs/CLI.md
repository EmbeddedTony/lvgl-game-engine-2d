# CLI and agent automation

`lge` exposes the editor's authoring model, validator, scene operations, LVGL exporter, native C playtest service and STM32 builder through a versioned JSON interface. It runs locally, without a dev server. The command discovery and headless workflow take inspiration from the [official Unity CLI](https://docs.unity.com/en-us/unity-cli) and its [agent-oriented command discovery and structured results](https://docs.unity.com/en-us/unity-cli/release-notes).

## Launch

From this repository, with Node.js and installed development dependencies:

```sh
./bin/lge commands
./bin/lge help --command node.create
npm run cli -- project inspect --project-path /path/to/Game.lge.json
```

The repository launcher rebuilds its bundle when authoring/runtime sources change. Use `bin/lge` directly when parsing stdout: npm prints its own script banner.

The built macOS app contains a standalone launcher using its bundled runtime. It requires **no system Node.js or npm**:

```sh
"/path/to/LVGL Game Engine.app/Contents/MacOS/lge" commands
```

For this checkout, that launcher is at `release/mac-arm64/LVGL Game Engine.app/Contents/MacOS/lge`. An optional shell alias is convenient:

```sh
alias lge='"/absolute/path/to/LVGL Game Engine.app/Contents/MacOS/lge"'
```

All commands are headless. The desktop editor may remain open. Native playtesting additionally needs the bundled LVGL SDK and the Apple Command Line Tools compiler. `lge doctor` reports availability. STM32 builds use the same installed tools and tool settings as the desktop Build & flash panel.

## Discovery before editing

```sh
lge commands --json
lge commands --query tilemap
lge help --command project.apply
lge schema
lge schema --type Project
lge schema --type GameNode
lge schema --type Physics
```

Commands accept `node create`, `node.create`, or `command node.create`. `run --command validate` is also accepted. Global `--project-path` selects a `.lge.json` file or a directory containing exactly one such file. `--project` and Unity-style `-projectPath` are aliases. `LGE_PROJECT_PATH` supplies a default. `-batchmode` and `-quit` are accepted for batch wrappers; commands already finish without opening an editor window.

Flags use kebab case or camel case: `--tile-size 32` and `--tileSize 32` are equivalent. Boolean switches accept an explicit `=false`. Structured parameters are JSON:

```sh
lge node update --project-path Game.lge.json --scene main --id player \
  --patch '{"speed":100,"x":48,"y":80}'
```

To avoid shell quoting, pass the entire command parameter object through `--params-file params.json`, `--params-file -` (stdin), or `--params '{...}'`. Paths in parameter files resolve against the invocation's working directory. Unknown command names, flags, parameter types and node/scene patch properties fail explicitly.

## A complete authoring workflow

```sh
lge project create --project-path Game.lge.json --name "My adventure" \
  --width 320 --height 240
lge node create --project-path Game.lge.json --scene main --kind rect --id player \
  --data '{"name":"Player","player":true,"x":24,"y":40,"speed":100}'
lge project inspect --project-path Game.lge.json
lge node list --project-path Game.lge.json --scene main --resolved
lge validate --project-path Game.lge.json
lge guidance --project-path Game.lge.json
lge export --project-path Game.lge.json --output firmware
lge playtest --project-path Game.lge.json --seconds 2 --screenshot frame.png
```

`export` creates `firmware/ui/` using the same atomic exporter as the editor. It preserves unrelated files and external edits. If both the project and disk changed a generated file, it returns a conflict and leaves the existing folder intact. Review those files before using `--replace-modified`.

`project inspect`, `scene list`, `node list` and `resource list` omit large pixel/map payloads. Use individual `get` commands for full records. `project get --path /scenes/0/camera2d` reads an RFC 6901 JSON Pointer. Root `project get` returns the whole project, including embedded pixels; it can be large.

### Scenes and transactions

Scenes keep stable IDs independently of their display names and folders. CLI structural commands reuse the editor's hierarchy operations: reparenting preserves world position; extraction/unpacking migrate authored references; edits to inherited nodes write instance overrides instead of changing their source scene.

`project apply` takes a file containing `{ "commands": [...] }` and commits once. Commands are applied in order, followed by complete structural and semantic validation. This permits dependent additions and reference repairs within one transaction. Any failure leaves the source project unchanged. For example, `batch.json`:

```json
{
  "commands": [
    {"command":"scene.create","params":{"id":"actor","name":"Reusable actor"}},
    {"command":"node.create","params":{"scene":"actor","kind":"rect","id":"body","data":{"width":16,"height":24}}},
    {"command":"node.create","params":{"scene":"main","kind":"instance","id":"villager","data":{"scene":"actor","x":100,"y":80}}}
  ]
}
```

```sh
lge project apply --project-path Game.lge.json --params-file batch.json --dry-run
lge project apply --project-path Game.lge.json --params-file batch.json
```

### Tiles, sprites and gameplay data

```sh
lge asset import-tileset --project-path Game.lge.json --file terrain.png \
  --id terrain --name Terrain --tile-size 32
lge tilemap create --project-path Game.lge.json --scene main --tileset terrain \
  --id ground --columns 32 --rows 24
lge tilemap paint --project-path Game.lge.json --scene main --id ground \
  --cells '[{"x":2,"y":3,"tile":1},{"x":3,"y":3,"tile":1}]'
lge asset import-sprite --project-path Game.lge.json --file hero.png --id hero_image
```

PNG import preserves original RGBA pixels without filtering or resampling. Tilesets support margins, spacing, selected atlas cells and exact duplicate merging (`--merge=false` disables merging). Maximum input sizes are 512×512 for a sprite and 2048×2048 for a tileset sheet. Tilesets retain the editor's 255 unique tile limit; create additional layers/resources for larger packs. Numeric map values are **tile-bank indices**: 0 is empty, 1 selects the first ID in the map's `tiles` array. `node get` reveals that bank.

`resource list/get/upsert/delete --resource <table>` supports `sprites`, `tilesets`, `audio`, `animations`, `scripts`, `state`, `patterns`, `items`, `skills`, `actors`, `encounters`, `folders` and `sequences`. Upsert takes a complete `--data` record with a stable ID. Use transactions to add dependencies together. Existing multi-layer clips remain ordinary `animations` records with `layers`; tile animations, collision/slopes and terrain definitions retain their normal project schema. File imports (`asset.import-*` and `code.set --file`) can appear inside `project apply` and are expanded before the transaction commits.

### C hooks and real LVGL playtests

```sh
lge code get --project-path Game.lge.json
lge code set --project-path Game.lge.json --file game_hooks.c
lge api get --project-path Game.lge.json --file ui.h
lge api get --project-path Game.lge.json --file engine/lge.h
lge playtest --project-path Game.lge.json --scene main --seconds 2 \
  --input-file controls.json --screenshot artifacts/final.png
```

`api get` reads the generated public headers, including time/velocity, camera, scene, battle and sound APIs. `playtest` compiles the generated C and project hooks against the native LVGL SDK, runs the actual game process, acknowledges framebuffer packets, captures its final frame and returns game state/compiler diagnostics. A bad hook produces a nonzero exit with source diagnostics. Builds are cached by content. `--timeout-ms` bounds compile plus execution; `--seconds` counts from successful game startup. One CLI playtest per profile owns the shared cache at a time. Interrupting a run stops its child process and releases the lock. If a process is forcibly killed, inspect `Cache/cli-native-playtest/active.lock` in the profile before removing a stale lock.

`controls.json` contains a timed array:

```json
[
  {"atMs":0,"input":2},
  {"atMs":800,"input":0},
  {"atMs":1000,"pointer":{"x":260,"y":210,"down":true}},
  {"atMs":1100,"pointer":{"x":260,"y":210,"down":false}}
]
```

Input masks match the C runtime: left=1, right=2, up=4, down=8, action=16, interact=32, menu=64. Combine bits for simultaneous holds. An input remains held until another action changes it. Pointer coordinates use display pixels. Actions may also set `pause`. Inputs use elapsed wall time after startup; this is a bounded smoke-test runner, not a deterministic frame-replay system. Headless audio is silent, with finite voice completion and pause semantics; the result reports audio command/voice counts. Native rendered frame counts measure the host run and do not predict MCU FPS.

### Target guidance and board builds

```sh
lge targets --query stm32
lge project create --project-path DK.lge.json --name "DK demo" --board stm32h7s78-dk
lge doctor
lge board probes
lge build --project-path DK.lge.json --output builds/dk-001 \
  --renderer neochrom --fps 60
```

Generic projects choose an MCU/Linux/host family through `--family` during creation or through their normal target configuration. Guidance uses the editor's existing researched catalog and workload estimator; selecting a family does not implement board bring-up.

`build` currently supports the existing **STM32H7S78-DK board port**. It exports the selected snapshot, builds through the shared pinned vendor port and returns the build report plus SHA-256 hashes/paths of `build/appli.bin` and `build/boot.bin`. Use a new output directory per build. `--cache` and `--toolchain-bin` override tool locations when needed. `--timeout-ms` bounds the builder (10 minutes by default); interrupts/timeouts terminate its process group. The command never programs a probe, writes option bytes or installs a bootloader. `board probes` only enumerates attached probes. Device programming remains in the desktop Build & flash workflow; adding this CLI does not change the working board firmware.

## Live editor versus files

```sh
lge editor sessions
lge status --project-path Game.lge.json
lge status --session 12345
lge node update --project-path Game.lge.json --scene main --id player \
  --patch '{"speed":120}' --expected-revision 'REVISION_FROM_STATUS' --save
```

If the selected project is open in an updated desktop editor, commands use its **in-memory document**, including unsaved changes. Each mutation/batch is one normal Undo step. Live mutations remain unsaved unless `--save` is specified or `project save` is called. An unsaved new document can be selected by `--session`; use the editor's Save As once before CLI saving. Multiple matching editors require explicit session selection. Stop editor playback before live mutations. Export, guidance and native CLI playtests can read snapshots without modifying the open document.

Closed projects use an exclusive writer lock, compare the exact source revision again, store the previous version in `.lge-backups/<filename>/<sha256>.json`, then atomically replace the project. `--dry-run` validates mutations without saving or adding an Undo step. `--expected-revision` supplies optimistic concurrency control; revisions are opaque and should be obtained from `meta.revision` or the mutation result. They differ between live sessions and saved files. When a save races a new manual edit, its result reports the actual dirty state and the revision that was saved.

`--offline` explicitly reads the saved file. Offline writes to a project known to be open are rejected to protect unsaved editor changes. If the editor connection fails, CLI edits fail instead of silently falling back to disk. A profile is the isolation boundary; development/test instances using `LGE_PROFILE_DIR` have separate sessions, settings, caches and recovery files.

The connection uses a local Unix socket (named pipe on Windows), a random per-session token and private registry files. Tokens/endpoints are omitted from discovery output. It exposes snapshot/apply/save only, with no arbitrary JavaScript evaluation or shell execution endpoint.

## Result and exit contract

Default stdout contains exactly one JSON envelope:

```json
{"protocolVersion":1,"ok":true,"command":"validate","data":{"valid":true,"issues":[]},"meta":{"engineVersion":"0.2.0","source":"file","projectPath":"/path/Game.lge.json","revision":"sha256:...","dirty":false,"elapsedMs":12}}
```

Failures use `ok:false` and `error:{code,message,details?}`. Build/playtest progress goes to stderr. `--json` is an explicit alias for the default. `--format text` pretty-prints successful data for people; failure envelopes remain JSON. `--log-file` additionally writes the final structured envelope to a file.

| Exit | Meaning |
| --- | --- |
| 0 | Success |
| 2 | Unknown command, parameter or invalid argument |
| 3 | Invalid project or transaction |
| 4 | Revision, export, writer-lock or editor-state conflict |
| 5 | Missing project/resource, unavailable editor/tool, or invalid local credentials |
| 6 | Compiler, builder or other execution failure |
| 130 | Interrupted playtest/build |

For agents: discover commands/types, inspect by stable IDs, capture the revision, submit a small batch with `--expected-revision`, validate, playtest, then export/build. On a conflict, inspect current state before retrying. Never assume a timed-out request was not applied; the revision/Undo history is the source of truth.

## Architecture and checks

`src/automation/` owns the versioned command contracts and pure project operations shared with React. `src/cli/` adapts arguments, disk transactions and existing export/playtest/build services. `desktop/automation/` owns private local transport; the renderer bridge commits through the existing history function. The CLI bundle embeds the canonical runtime sources and generated type schemas. The packaged launcher uses Electron's [Node execution mode](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node), avoiding GUI/Chromium startup. The app executable also supports `--cli` before registering editor lifecycle handlers.

Verification commands:

```sh
npm run test:cli
npm test
npm run test:files
npm run build
npx playwright test --config playwright.desktop.config.ts tests/native/automation.spec.ts
```

Coverage includes atomic rollback, linked-instance ownership, world-preserving reparenting, pointer safety, native-resolution tiles, export conflict preservation, revision/backup behavior, real C compilation and movement capture, build artifact reporting, live Undo/saves and credential rejection. Board-build routing is tested with a fixture builder; no programming command is issued by these tests.

Prefab sources and pools use `prefab.list`, `prefab.create` and `prefab.pool`; `node.move` supports `inside`, `before`, `after` and `root` placement with preserved world coordinates. See [Prefabs](Prefabs.md) for the editor and runtime contract.

## Running-device commands

Optional `build --debug-swd` firmware supports `board.status`, `board.input`, `board.pause/resume/release`, `board.reload`, `board.warp`, `board.camera`, `board.capture` and `board.benchmark`. Commands require the exact running build report and an explicit ST-LINK serial. Input/pause leases expire automatically, and captures/benchmarks release automation before returning. See [SWD game control](SWDControl.md) for commands, bounds and measurement semantics.
