# Architecture — Desktop 0.2

## CLI and live automation

`src/automation` defines versioned JSON contracts and pure transactional project commands. These reuse editor scene operations and the existing import/semantic validators. Copy-on-write transactions validate all operations together before returning a project; the frontend commits through normal Undo history. ID-based queries omit large pixel payloads by default. A JSON Pointer patch escape hatch covers the full authoring model, and discovery schemas are generated from TypeScript types at bundle time.

`src/cli` adapts arguments, filesystem concurrency and the existing exporter/native LVGL/board build services. Offline writes take an exclusive lock, recheck the source revision, preserve a content-addressed backup and publish by atomic rename. Export retains its existing ownership/conflict manifest. Playtests use the canonical C source and SDK, bounded input scripts, explicit frame acknowledgements, a silent audio lifecycle and guaranteed process cleanup. Board builds produce hashed artifacts without a programming operation.

`desktop/automation` supplies private, token-authenticated local sockets, with renderer responses restricted to trusted IPC. Live writes check an opaque revision and playback state, then create one Undo transaction; saving remains explicit. The CLI entry bundle contains runtime source templates and type schemas. Repository commands use Node; the standalone macOS launcher uses the app's bundled Node execution mode, avoiding a separate Node install or Chromium startup. See [CLI.md](CLI.md) for the complete protocol, workflow and exit contract.

## Dialogue reveal

Say actions retain an optional `textSpeed` in characters/second (default 30, 0 instant). `gameplay/text-reveal.ts` owns the preview's allocation-free Unicode cursor; the story VM mirrors it with UTF-8 byte offsets and fractional character credit. Reveal advances on the simulation clock, respects pause, and resets for every page. A confirmation either reveals the current page or advances it. Choice navigation/rendering waits until reveal completes. The existing page text remains available to C hooks; visible-byte and revealing queries expose presentation state without another page buffer.

The preview reserves full-page/choice geometry before typing starts. The LVGL adapter caches full-page measurement and a dialogue revision, copies only the visible prefix into its label, and skips unchanged dialogue updates. Touch controller space and the in-panel 40px advance button retain their existing bounds.

## Layered character animation

`src/animation/layers.ts` owns the bounded layer contract, validation, straight-alpha composition and derived image cache. A clip retains 1–8 ordered layers with static or timeline-matched frame references. All layers use the clip's existing frame index, FPS, direction selection, loop and pause behavior. There are no independent layer timers. The cache retains only the current source revision and latest bake per clip; mutable script inputs bypass it. Composition is bounded to 128×128 frames and four million total derived pixels.

`animation/import-character.ts` converts compatible Mana Seed P1 sheets into native 32×48 frame assets and eight directional idle/walk clips. A shared crop preserves registration across rear cloak, body, outfit, cloak, facewear, hair and hood. Import validates matching pages and one body/hood variant. The file-reading React adapter commits the source frames, clips and scene node as one undo transaction, respects scene/asset/clip budgets, and rejects stale asynchronous image reads. The clip editor owns ordering, visibility, offsets and static accessories; source sheets remain unchanged.

`projectImages`, fast preview, target guidance and export share the same composed image IDs. Export emits ordinary immutable LVGL image descriptors and existing animation pointer tables. Source clothing layers do not add runtime objects, blending passes, timers or allocations. Clothes visibility/order are authoring settings baked into each exported outfit; runtime equipment switching can select another authored clip/outfit. The board port and portable C animation ABI are unchanged.

## Pixel-perfect presentation

`pixel-perfect.ts` defines physical-pixel zoom, source-to-node size checks and C-compatible final draw rounding. The optional `Project.pixelPerfect` preference defaults to true; it belongs to document history/persistence, while zoom remains editor state. `usePixelViewport` observes monitor scale, resizing and scrolling and aligns a frame to shared CSS/physical-pixel boundaries. It uses layout offsets instead of a second compositing transform.

`ScenePixels` renders the sorted scene into one logical-resolution canvas with exact nearest sampling and clipped source variants. This preserves draw ordering, transparent compositing and one pixel grid on Retina/fractional OS scales. The existing transparent DOM node layer continues to own selection, pointer events and handles. Decoded variants are limited to 4 MiB/512 entries. Native LVGL streams its original-resolution framebuffer into a separate canvas and uses the same fit/alignment policy; pointer conversion continues to use displayed bounds versus logical dimensions.

Physics retains float state and hierarchy composition precedes draw rounding. Firmware images remain prebaked variants (compact palettes on software ports, aligned ARGB8888 on NeoChrom): experiments with runtime enlargement exposed version/decoder color differences, so pixel correctness takes precedence over storing a smaller transformed source. No new MCU framebuffer or physics allocation is introduced. `GAME_PIXEL_PERFECT` records the authoring policy for board integration.

## Authoring → runtime

`src/model.ts` is the versioned authoring schema, import validator and content diagnostics. All authored positions are local logical pixels; resolutions are independent of boards. Scene/node/asset/cue IDs are stable strings. Layers are sorted into world then UI, preserving order inside each layer. Properties, tile painting and native export use this same order.

`src/App.tsx` owns document state and editor controls. `src/editor/useScenePreview.ts` owns the fast preview clock, input, audio and cancellation. Native file operations stay in the Electron main process; the renderer has no Node.js access. Immer updates retain unchanged assets across undo history. Gesture edits create one history entry. Desktop recovery is stored atomically in the app user-data directory; explicit JSON files are the portable source of truth. Browser storage remains a renderer-development fallback. ZIP exports include source JSON outside the firmware folder, so they can be reopened by extracting it.

`src/simulation.ts` owns the fixed preview clock and hierarchy state; `src/physics-simulation.ts` implements the character/area solver. `src/physics.ts` owns the authoring component, legacy defaults, layer names, bounds and validation contract. `engine/lge.c` owns lifecycle/audio/hierarchy; `engine/lge_physics.c` implements matching portable C99 physics with swept axis movement, bounded one-pixel area samples, collision masks, gravity/jumping, contacts and collection. Both paths run at 60 Hz with 100 ms catch-up limits and behavioral regression tests. Native playtest runs the actual exported C, including custom hooks; fast preview excludes those hooks explicitly.

`src/exporter.ts` generates a firmware ui folder: generated scene/image data, the ui.h/ui.c facade, stable IDs, user hooks, a CMake target, WAV files and the audio manifest. The source project JSON is outside the firmware folder. Names/text are UTF-8 encoded into escaped C strings. Asset/size variants, identical compressed tilemap payloads and identical immutable physics components are deduplicated. Project content is validated before export. Board code does not parse JSON or ZIP at startup.

`engine/lge_lvgl.c` builds LVGL objects for game objects and UI. Each tile layer is a single LVGL object with a public draw-event callback, drawing individual images through LVGL's renderer. The renderer culls outside the display; LVGL applies its invalidation clip. It reads map runs directly from const memory; RAW8 is used if the RLE payload would be larger. Image data is pre-sized for node/tile dimensions to avoid transforms on indexed formats. No extra full-screen canvas is allocated by this adapter.

Game state is **per instance**: `lge_view_t` owns a game, its LVGL root, objects and timer. No global hidden engine is required. A single owner-thread token allocator keeps audio completion IDs distinct across instances and recreation; audio workers never access it. The generated sample exposes scene definitions in `game_scenes`. Scene changes must run from the owning LVGL loop, outside callbacks currently traversing objects.

## Editor workbench

The dock layout and application commands stay separate from project ownership. `src/editor/useWorkbenchLayout.ts` validates and persists panel sizes under a distinct local preference key; layout changes do not enter undo, project JSON or firmware export. `DockSeparator` supplies bounded pointer/keyboard resizing and pointer-capture cleanup. Dock locations are fixed; widths, bottom height, collapse and viewport focus are adjustable.

`EditorMenuBar` presents real command callbacks and contains keyboard navigation. `ProjectDock` owns folder/search/selection/presentation state, then delegates open/place/instance/audition commands to the document controller. Selecting a resource never mutates the project. Console shows bounded editor output and current validation issues. `CanvasRulers` renders authoring coordinates only. `src/workbench.css` scopes workbench presentation apart from gameplay pixel styles and the existing specialized workspaces.

Fast-preview input ignores editor controls and handled menu events. Start/restart from other workspaces focuses the newly mounted viewport; resume returns focus there. Scene/Game switching restores authored state on Stop. The native C process/ports and generated firmware API are unchanged by the reconstruction.

## Native extension

`game_on_event(game,event,node,user)` observes accepted START/COLLECT/COMPLETE/CLICK/EXIT events. `game_on_update(game,dt_seconds,user)` runs after built-in simulation each fixed step; it pauses with the game. Developers can locate nodes through `lge_find`, update runtime positions/visibility, inspect game input/score/complete, and request audio through the engine API. Attach game-specific state through ui_config_t.user (or game_create for advanced instances). START is delivered after widgets exist. ui_request_scene queues a transition for the next timer pass; callbacks never need to destroy the scene they are traversing.

Callbacks must stay short and must not destroy the view or load a scene while the simulation/event callback is traversing it. Queue transitions to your main owner. The runtime is single-threaded. New gameplay features should remain independent of LVGL where possible so they can be host-tested.

## Audio boundary

LVGL owns graphics/input scheduling; it is not an audio driver. `lge_audio_backend_t` is a small injected contract, with a context and play/stop/pause/set_gain callbacks. Supply all four or pass NULL; incomplete backends are treated as silent.

The engine allocates monotonically increasing nonzero voice tokens, keeps eight active voice slots, applies cue × bus × master gain, and accepts/rejects a request based on backend capacity and priority. Full pools steal a lowest-priority voice if the incoming priority is equal or higher. Worker completions use the original token, so a late completion cannot clear a slot that has been reused. Natural completion must be reported, or a slot remains logically active until stolen/stopped.

Backend callbacks enqueue commands only. The board worker owns URI resolution, storage, PCM parsing, sample-rate conversion if needed, mixing, loop behavior and DMA. A play queue may reject a command; stop and pause must be reliably delivered. Use a dedicated control path or reserved control slots under load. The worker must copy transient command parameters. Cue definitions have static generated lifetime.

Worker/DMA callbacks never call LVGL or mutate the engine. Drain completion tokens through a queue on the LVGL thread. Pause suspends simulation and commands the worker to suspend voices, preserving cursor positions. Resume continues them. Scene replacement stops old voices and releases paused backend state before starting new scene audio. Destroy stops voices before deleting the UI/timer. Gain changes update active voices through set_gain.

`src/audio.ts` provides the analogous Web Audio preview with eight voices, buses, priority and loop behavior. It decodes before play. Browser decoding/storage is not the embedded memory model.

## Embedded constraints

The core has fixed arrays and no heap allocation in its update loop. The LVGL adapter can allocate during scene construction and LVGL may allocate draw tasks/cache buffers while rendering. Avoid claiming static/no-heap operation for the entire LVGL stack.

RLE uses pairs of uint16 count/value; zero is empty. Values 1–255 index tile descriptors. Compact collision bytes support the full bank; a NULL collision-byte pointer preserves the legacy 32-bit mask. RAW8 preserves high-entropy maps without expansion. Maps are immutable at runtime in this release. Collision queries share the render map. Longer RLE streams now include cumulative flash checkpoints every 16 runs, with their bytes included in codec selection. Caller-owned cursors share no global mutable state. Drawing clips before decoding and animated invalidation batches visible row spans. Legacy unindexed streams still work. See [Performance review](PerformanceReview.md).

Image palette bytes use LVGL's BGRA palette representation; exported test targets use little-endian hosts/MCUs. Hardware renderers and other byte orders need verification. PCM WAV is little-endian by format. The board controls output color, storage and buffering. Output resolution/color changes in the editor do not reconfigure physical display drivers.

## Compatibility references

- [LVGL integration and timer ownership](https://lvgl.io/docs/open/9.5/integration/overview)
- [LVGL 9.4 image API](https://github.com/lvgl/lvgl/blob/v9.4.0/src/widgets/image/lv_image.h)
- [LVGL 9.4 image descriptor](https://github.com/lvgl/lvgl/blob/v9.4.0/src/draw/lv_image_dsc.h)
- [LVGL 9.6 source](https://github.com/lvgl/lvgl/tree/v9.6.0)
- [SquareLine screen/display settings](https://docs.squareline.io/docs/1.3.0/dev_env/project_settings/)
- [LVGL Pro project/display declarations](https://lvgl.io/docs/pro/syntax/project)

The competitor references inform the display-settings workflow only. This project uses its own model, editor and runtime and does not import their project formats or generated code.

## Standalone desktop boundary

desktop/main.cjs owns the app window, native menus/dialogs, current project path, recent files and recovery. It loads dist/index.html through file:// from the packaged ASAR; there is no local HTTP server. Renderer Node integration is disabled; context isolation and sandboxing are enabled. Permission requests and non-file/data/blob requests are denied. The CSP allows bundled scripts/fonts and authored bitmap data while blocking remote code and connections.

desktop/preload.cjs exposes one narrow method per action through contextBridge. Each IPC call checks the requesting frame against the app's exact local URL. Renderer content cannot supply arbitrary paths for opening/saving projects: native dialogs, recent-file indexes and one-use open tickets own those paths. Parsing a selected project must succeed before the main process accepts its file path. Project loading never executes user C. An explicit Native LVGL Build & run action compiles the generated C into a separate supervised process.

desktop/storage.cjs handles project size/basic schema checks and atomic replacement. Full authoring schema validation remains in src/model.ts. Recovery uses a serialized write queue so old snapshots cannot overtake new ones. Saving or accepting an opened file also commits a matching recovery snapshot. Closing with unsaved changes uses the renderer's latest project snapshot and a native Save/Discard/Cancel prompt.

desktop/export-folder.cjs publishes a staged ui directory, with rollback if the final swap fails. It refuses traversal, symlinks, unowned nonempty UI folders and other project identities. SHA-256 ownership metadata enables three-way comparisons. Unknown files survive re-export; untouched obsolete generated files may be removed; external modifications are retained or presented as conflicts. ZIP packages include the same ownership metadata.

CodeMirror is loaded only when the Code workspace opens. The desktop staging package includes bundled renderer assets and the four native CommonJS modules; source node_modules and development tools are excluded from the ASAR. The Electron runtime is bundled in the .app.

Native desktop implementation follows the public Electron [context-isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) and [sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox) APIs. Packaging uses electron-builder's [macOS target](https://www.electron.build/mac/).

## Scene orchestration

Scenes own content; folders organize the editor; sequences own progression. Optional `Project.flow` describes folders, ordered scene references, per-step advance rules, explicit endings and one entry. Legacy projects start at their first scene. Stable IDs keep references independent of display names and folder placement; stable step IDs distinguish repeated visits to a reused scene. The library shows uses and blocks referenced deletion. The importer and exporter validate all targets and bounded table sizes.

`src/flow.ts` supplies preview locations, reference checks and diagnostics. `src/flow-export.ts` emits immutable `generated/game_flow.h/.c` tables. `engine/lge_flow.c` is a portable C99 state machine with no LVGL dependency or allocations. It owns the committed sequence cursor and one pending transition. Generated ui.c bridges its requests to the existing safe LVGL transition queue. START commits the cursor before invoking user hooks; automatic COMPLETE/CLICK rules run after user hooks so explicit requests take precedence. Duplicate pending requests return false.

Only the active composed scene has widgets/runtime nodes. Sequence references select a scene; scene-instance nodes compose source content within it. Scene replacement stops old voices and resets scene-local state. Session state is passed through ui_config_t.user and stays application-owned. Shared hooks should dispatch to feature-specific firmware modules; the editor currently edits a single game_hooks.c. There are no nested sequences, retained screen stacks or timeline scheduler. The [organization guide](SceneOrganization.md) documents the contract and examples.

## Scene composition

`src/scenes.ts` is the composition boundary shared by Design, preview, reference validation and C export. It resolves parent links and nested source scenes into a parent-before-child plan with local transforms, world coordinates, effective visibility, source provenance and scoped instance paths. It rejects cycles, orphan parents/overrides, excessive depth and expanded node budgets. The authoring schema stays backward compatible with version 1 flat scenes.

`src/editor/scene-commands.ts` owns structural operations and reference migration. App commits graph commands as validated Immer transactions; a failed operation leaves the document/history untouched. Extraction, duplication and unpacking preserve container ownership and migrate references through containing scenes. `SceneTree`, `SceneInstancePicker` and `InheritedNodeInspector` present these operations without owning project state. Linked-child overrides use an explicit small property contract rather than arbitrary schema patches.

The C compiler emits parent indices and scoped IDs. The fixed-capacity engine propagates parent world deltas and effective visibility; setters and direct C-hook world writes stay compatible. Logical roots consume one engine slot but no LVGL widget. LVGL objects remain siblings to avoid accidental parent clipping/layout; stable layer ordering is applied independently. EXIT occurs before teardown, START after object creation, and transitions are rejected while exiting. Instances share the loaded root's gameplay/audio context. Bounded prefab spawning reuses reserved linked branches; additive loading and rotation/scale inheritance remain outside this version's contract.

## Native playtesting

The same generator supplies firmware export and desktop playtest snapshots. `desktop/playtest/service.cjs` owns capability checks, source staging, content-hashed builds, bounded cache retention, process-group lifetime and timeouts. It depends on explicit paths and an event sink, not Electron. `ipc.cjs` supplies the trusted desktop adapter. `protocol.cjs` parses a bounded fd-3 stream separately from stdout/stderr logs.

`native/host.c` supplies the real LVGL memory-display and pointer ports, the monotonic clock and a token-based audio backend. Native frames go directly to the canvas through `useNativePlaytest`; React owns only status/control state. `NativeAudio` implements the desktop audio port with engine-supplied gains and completion tokens. One frame is in flight; a blocked C hook is killed by the supervisor without blocking the editor. The optional compiler requirement and hardware limits are documented in [NativePlaytest](NativePlaytest.md). Review findings and refactors are in [CodeReview](CodeReview.md).

## Physics ownership

PhysicsInspector and ColliderOverlay own presentation and gesture state; document edits stay in validated App transactions with one undo entry per drag. Local collider bounds remain independent of visual bounds. Linked scenes own their collider structure at the source; reusable instance copies share const definitions in exported C and keep separate runtime velocities/contact state. Area nodes inherit translation/visibility and allocate no LVGL objects. Physics code depends only on the portable model, never on React, Electron, LVGL or a board audio driver. Audio cues and deferred scene requests use the existing application boundary.

The C solver uses engine-owned contact bits (2 KiB), bounded node arrays and fixed-step substeps. Area events are directional and carry an ephemeral other-node pointer; no allocations or event heap are needed. Debug LVGL drawing is opt-in and reads the same bounds/tile definitions. Compressed debug tilemaps are walked once per draw, rather than repeatedly scanning RLE for each cell. See [Physics](Physics.md) for units, masks, limits and hook timing.

## Tileset resources and placement

TilesetAsset is an optional version-1 project resource: atlas dimensions/cell IDs plus owned, selected non-empty tile pixels and shared collision defaults. Sprite and tile image IDs occupy one validated namespace. `tile-assets.ts` is a pure, type-only foundation for image enumeration, exact equality and guarded hash buckets; model validation does not depend on editor commands. `tilesets.ts` owns slicing, exact deduplication, resource construction, append-only bank attachment and propagation of shared collision changes to authored maps. No React, Electron or LVGL dependency enters these operations.

`TilesetImporter` owns transient sheet decoding, grid selection and byte estimates; bitmap resources close promptly and generation tokens discard stale reads. It is lazy loaded. `TilemapPanel` owns atlas/tool presentation, while App still owns validated document transactions. `editor/tile-tools.ts` calculates sparse changes with integer line interpolation, stamp repetition, clipping and a bounded iterative flood fill. `useTilePainter` owns pointer capture, hover/rectangle previews and gesture history grouping. Undo/redo cancel active tile gestures through an explicit callback port. `TilemapCanvas` clips editor rendering to the viewport and caches image decoding instead of building an element for each cell. Palette/tool presentation and example construction are lazy loaded.

The exporter retains bank indices, emits NULL for unused image slots, and shares byte-equal image/size payloads after hash/equality verification. RLE16/RAW8 is chosen by actual cell-data size. Collision bits cost ceil(tile_count/8) bytes. Immutable generated tables retain the existing single-object LVGL drawing and core physics contracts. `ui_tile_at` / `ui_tile_is_solid` expose read-only queries, and tile-manifest.json records names/IDs/values without adding runtime string tables or JSON parsing. See [Tilesets](Tilesets.md) for source and target budgets, static-map scope and unsupported terrain/animation formats.

## Target guidance boundary

TargetConfig is an optional, strictly validated part of the document. Catalog profiles are versioned data with reference parts, primary URLs, capacities and separate accelerator capabilities. They are never board definitions. A pure workload scanner expands scenes, measures exported content and derives conservative live-resource indicators; a pure analyzer applies explicit user assumptions and advisory policy. No renderer, Electron, compiler or hardware dependency enters these modules.

The React adapter caches palettes by immutable asset identity and debounces content scans. Target controls update assumptions without recompressing assets. Export scans the current project afresh and attaches exact payload statistics to target-guidance.json. This developer-facing JSON never enters compiled C and never changes the board port. Recommendations join project warnings, while only structural validation errors can block export. Linux/host targets suppress MCU policy, preserving engine validation. The desktop reference-link adapter restricts external navigation to official HTTPS domains.

Reference documentation, memory formulas, policy thresholds and unsupported measurements are in [Target guidance](TargetGuidance.md). The [catalog](TargetCatalog.md) preserves vendor provenance separately from application heuristics.

## 2D examples and camera

`camera2d.ts` owns camera validation, clamping and render projection. Optional Scene.camera2d stores world dimensions, a resolved follow path and follow axes; old scenes retain screen-sized behavior. The C definition stores an index to the resolved world object. Physics keeps world coordinates and uses world bounds. The camera only offsets world-layer drawing, including LVGL collision overlays; UI stays pinned. It is pixel aligned and adds no framebuffer or step allocation. Transient editor panning also feeds pointer-to-tile coordinates and overlays. Structural scene commands migrate camera references alongside sequence and override paths; graph validation prevents a dangling follow target. The ui_camera_position facade exposes the draw offset without changing world-coordinate APIs.

The longer side-scroller exposed a float precision issue in the C movement solver: testing `next-origin-delta` against a fixed tolerance falsely zeroed velocity around larger world coordinates. The solver now compares `next` with the already-rounded requested destination; preview uses the same form. Analytical playthroughs, original runtime regressions and actual native C beyond one display validate the correction. Full journey playback is an explicit toolbar action; current-scene preview retains its existing behavior.

## 2D gameplay ownership

src/gameplay separates validated schema, reusable recipe data, the bounded preview VM, word/UTF-8 dialogue pagination, source-only usage indexing, save packet codec, C emission and the original lab. GameplayEditor and node/remap inspectors edit through App document/history transactions. A memoized usage index avoids scanning all rooms per state row. Scripts use stable step IDs and object roles; explicit per-object state bindings survive linked-scene composition and overrides. Each loaded instance owns its runner context while session values belong to the default game session.

engine/lge_story.c depends on portable lge.h, never on React/LVGL/storage/audio drivers. Its immutable instructions/pages/remaps refer to precompiled indices; eight fixed coroutines and a fixed 512-value table bound storage and per-tick interpreter work. ui.c owns the instance, translates core events, applies deferred room spawns, renders the optional LVGL dialogue view, and exposes the stable coding facade. Custom game hooks remain independent. No automatic disk writes or MCU board policy enter the VM. Pure TS/C codecs use the same schema fingerprint, endian encoding and checksum; actual exported integration compares their bytes.

The engine keeps physical input separate from step input and rising-edge pulses. Brief input is latched until a fixed step without overwriting input fed by user hooks. Modal state skips world physics but continues the event clock, dialogue input and user update hook. Rendering sorts a transient node/index list by UI/world, Z and optional feet Y; it never reorders the canonical hierarchy or physics arrays. LVGL object order changes only when required, outside draw callbacks. Animation uses immutable resized frame descriptors under the selected image-packing policy and constant motion/direction clip tables; its runtime state belongs to each live node.

The loaded-scene/node limits are independent of the larger project room/resource limits. Target scanning counts animated variants and story/text/remap metadata; the base context allowance was raised to 20KiB. save-buffer APIs leave storage ownership with the port. They validate the complete packet before assignment and deliberately do not serialize live pointers, objects, rooms or coroutine stacks. See Gameplay2D.md for capacities, ABI measurements and explicit genre coverage limits.

## Bounded 2D toolkit

`gameplay/toolkit.ts` owns bounded resource contracts/validation and deterministic RPG mechanics; `toolkit-export.ts` compiles immutable flash records. `gameplay/projectiles.ts` owns fast-preview pool state, while `engine/lge_gameplay.h/.c` supplies caller-owned pooled projectiles and independent RPG queries/helpers. The LVGL adapter allocates that pool only for emitter scenes and draws one surface between world/UI; core callers can attach static pool storage. Existing physics modules own ramps and kinematic passenger sweeps. The engine retains fixed-step scheduling, mutable speed and scene-local time.

Pattern forms, preview lifecycle and RPG database forms are separate components, sharing a bounded numeric field. The existing once-per-document usage index guards resource deletion. Tile profile edits update every authored map atomically; branch duplication copies nested physics/path/profile/emitter containers. Target analysis includes optional pool RAM, flash tables, projectile demand and collision work. Generated ui remains the integration facade and native play uses the same canonical sources. No per-shot heap, runtime JSON, growing entity graph or battle rules are hidden in rendering.

## Optional RPG sessions and tile animation

`src/rpg/model.ts` validates optional party/status rules; `runtime.ts` owns bounded combat/session mechanics; `view.ts` is a renderer-independent menu model plus preview nodes; `save.ts` owns the party envelope. Existing database IDs and saved inventory fields remain authoritative. `PartyBattleEditor` and `RpgBattleFields` present these resources through the document transaction boundary. Battle actions in the existing story VM yield with an explicit ownership claim, so a second runner cannot steal an unconsumed result. Outcome links use stable action IDs and are cleared when a destination is deleted.

Portable `lge_rpg.c`, `lge_rpg_ui.c` and `lge_rpg_save.c` mirror the same mechanics/menu/codec. `lge_rpg_view.c` alone owns LVGL widgets. Generated constant tables resolve actor/status/inventory references to indices; no RPG JSON or strings are allocated at runtime. The default facade allocates its 712-byte host battle context only for party projects; MCU ports may provide static storage. Enemy advancement is budgeted to 32 automatic activations/tick. Menu objects live for one open menu and refresh only when party/story revisions change. Scene transitions cancel battle/menu ownership but retain session health/progression. Storage drivers remain outside the engine. LGR2 restore validates into fixed temporary storage before committing story and party data; old LGS1-only projects retain their exact packet format.

## Board deployment and optional melee

`src/boards/stm32h7s78.ts` owns an explicit deployment policy; generic target profiles remain capability advice. `boards/export.ts` emits a narrow board adapter and manifest alongside the portable UI. `scripts/build-stm32h7s78.py` composes that export with a pinned upstream LVGL port. It reuses ST's boot, memory/cache, display and interrupt configuration and selects the M7 Nema library; no HAL dependencies enter simulation or the portable runtime. The adapter rejects incompatible GPU/color settings. NeoChrom and DMA2D have distinct ownership: the former draws supported tasks, the latter belongs to LTDC flush. Build reports distinguish linking from hardware verification.

`src/action2d` separates melee configuration/validation from fixed-step state and collision events. `engine/lge_melee.c` mirrors it using an optional bounded eight-actor pool, fixed target bitsets and immutable definitions. The LVGL adapter owns allocation at scene boundaries; attacks allocate nothing. Melee emits the existing Hit trigger and callback-scoped typed metadata; it does not own RPG damage rules. Attack animation slots and physics locking consume that state. Platformer vertical velocity remains under gravity. Touch buttons contribute to a separate virtual input source, then merge with physical inputs before fixed-step edge detection. Held-button bits prevent one button release from clearing another mapped to the same action.

The following camera keeps world coordinates independent from drawing, leaving UI fixed. Large maps remain RLE/RAW8 data with viewport draw culling; no world-sized surface or object-per-tile tree is introduced. Demo generation uses deterministic original art and a normal project model, so it exercises the same editor/export path as user content.

## Editor board jobs and live diagnostics

`desktop/board/service.cjs` owns one build/flash operation and its artifacts. Its trusted IPC adapter stays separate from tool execution, probe/telemetry parsers and React presentation. `src/boards/useBoard.ts` owns subscriptions, controls and document/build staleness; `BoardPanel` presents the three-step workflow. Tool paths are persisted in the app profile. Jobs write only an app-owned workspace, retain unchanged input mtimes and invoke executables with argument arrays. The Python builder is bundled as an external resource, while vendor sources are pinned in a separate SDK cache. Build IDs plus binary SHA-256 values bind a flash request to a completed artifact. Serial selection and the H7RS device check happen before any write; the flash job owns the programmer until verification/reset finishes.

`boards/diagnostics.ts` emits the optional hardware adapter. A display event observer samples rendered refreshes and DWT render/flush/wait costs. The pinned IRQ handler's prepared copy adds one GPU interrupt counter call. A fixed twelve-word wire block sits in the uncached RAM_CMD linker section; magic/version and matching even sequence words validate SWD samples. Renderer selection is reported by the executing firmware, not inferred from the project. HOTPLUG reads avoid resetting/halting; stale uptime is surfaced to the editor. The software comparison disables GPU drawing while retaining the common display-flush path.

Scenery and traveller atlases are imported offline into native-size, bounded-palette resources. The scene factory composes these resources into the normal project model. Tall sprites use ground colliders for both collision footprints and Y ordering; sorting still operates only on a transient draw list. World and UI layering, stable IDs and canonical physics iteration remain unchanged.

## Touchscreen input composition

`input/touch-controls.ts` builds a normal authored UI group inside a validated undo transaction; it reuses existing controller buttons and checks the expanded node cap. `Scene.touchControls` is an optional root-scene policy applied in the shared composition pass, including instanced buttons, so preview and export agree without rewriting source visibility. Legacy button mappings remain enabled. No second widget model, framebuffer or hardware-specific input layer is introduced.

`input/pointer-input.ts` owns preview pointer IDs, slide/gap routing, short action pulses and independent holds. Preview releases hidden controls and clears state on cancel, blur, pause and scene transitions. Native LVGL maps PRESSED/PRESSING/RELEASED/PRESS_LOST through the existing fixed held-button bitset, merging it with the physical mask. Press lock is disabled on controller buttons and the scene root, allowing direction changes through empty space. Version-specific LVGL flags stay behind `lge_lvgl_compat.h`. Board touch drivers remain owned by the display port.

The character importer accepts whole-pixel display scale separately from source extraction. Its collision-safe source-cell deduplication reduces authoring slots without changing pixels or frame timelines. Optional full source cells align P1 locomotion with P2 overhead-tool poses. The local pack-village builder composes the player from these sources, adds a separate deterministic sword-effect layer, and retains the original player identity, input, melee and world feet. No special runtime renderer or equipment subsystem is required for this authoring path.

## Prefab lifecycle

`src/editor/prefab-commands.ts` builds reusable sources and explicit reserve groups through existing graph commands. `Scene.prefab` classifies object sources; `GameNode.spawnable` marks an instance root reserved for acquisition. No parallel serializer, template hierarchy or image cooker is introduced. `resolveScene` validates linked sources, cycles, nested pools and the full expanded budget. `moveSceneNode` owns reparenting and sibling ordering; SceneTree only reports a drag intent, so each change uses one transaction and Undo step.

`src/prefabs.ts` mirrors the C lifecycle in `engine/lge.c`. All nodes/widgets exist at scene entry. Active state is separate from visibility, so visibility scripts cannot accidentally reactivate a retired root. Globally advancing generation tokens invalidate stale handles across reuse and scene reload. Reset is parent-before-child; positions are validated before mutation. Spawn/despawn callbacks cannot recursively mutate pools. Core cleanup resets contacts, melee hits and owned projectiles; the UI adapter cancels node-bound story runners and starts visible members on acquisition. Session state is deliberately independent. Guidance assumes every slot can be live. See [Prefabs](Prefabs.md) for the user/API contract.

## Editor scene navigation

`viewport-navigation.ts` supplies pure zoom/anchor/bounds operations, and `useSceneNavigation` owns transient per-scene presentation and input capture. Automatic fitting is explicit; manual actions disable it, so ResizeObserver notifications cannot overwrite zoom. Game and Scene contexts are independent. Navigation does not commit document changes or change physics/camera state. Scene rasterization uses a visible-window rectangle and a bounded overview backing resolution; display-relative DOM authoring handles stay on the same coordinate grid. Pan capture takes precedence over painting and object/collider gestures. See [Scene navigation](SceneNavigation.md).
