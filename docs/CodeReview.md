# Code and architecture review — 19 October 2026

This review followed implementation of Native LVGL playtesting and covered the authoring model, preview lifecycle, C generation/runtime, desktop persistence/export, IPC, native build supervision and audio adapters. It was a self-review with compiler, runtime and end-to-end validation, not an independent security audit.

The architectural rule is one authoring model and one C generator, with separate adapters for fast preview, native desktop testing and firmware hardware. UI components present state; controllers own timers/cancellation; the native supervisor owns subprocesses; portable C owns game behavior; hardware ports own display/input/audio integration.

| Finding | Resolution |
| --- | --- |
| P2: `App.tsx` owned preview timing, input, audio, sequence state and async lifecycle alongside document editing | Extracted `src/editor/useScenePreview.ts`. It owns preview lifetime and exposes explicit commands. App supplies selection/navigation callbacks. Native playtesting has its own hook/panel and does not reuse simulation as if it were C execution. |
| P2: export generated obsolete v0.1 files, then sliced/replaced C strings to derive the final layout | Removed the dead CMake/readme/function-generation path. The generator now emits `ui/generated` headers/data directly and keeps only the explicit `game.h` compatibility include. Both playtesting and export consume this output. |
| P2: an asynchronous sound audition could finish after preview cancellation | Audition and preview now share a cancellation generation in their controller; stale decode completions cannot start playback after Stop/navigation. Audio suspend/resume teardown failures are contained. |
| P1: blocking or crashing authored C must not run inside the Electron renderer/main event loop | Native C runs in a supervised process group. Compiler timeout, runtime heartbeat, Stop, panel/window teardown and app shutdown own termination. Run IDs reject stale controls/events. Tests intentionally run an infinite START hook and confirm termination/recovery. |
| P2: an audio completion during START can arrive before the first running-status packet | Controls are accepted when the game child exists, independently of first-render UI status. The renderer prepares clips before launch and returns completion tokens on the C loop. Voice policy and final gain remain in C. |
| P2: arbitrary native output must not create an unbounded renderer queue or corrupt framing | Frames use a separate bounded protocol pipe and one outstanding acknowledgement. Logs have a bounded tail; protocol sizes/kinds and control payloads are checked; excessive audio command rates stop the game. |
| P2: caller-created audio cues could send NaN gain to a backend | `lge_audio_play` now rejects non-finite cue gain before allocating a voice or calling the backend. The portable runtime test covers that boundary. |

Existing checks continue to cover schema/reference limits, stable IDs, malformed compression/WAV input, thin-wall/tile collision, accepted events, deferred scene changes, stale audio tokens, atomic saving, safe folder publication and preservation of external edits. The review found no additional P0/P1 defect in the exercised paths after these changes.

`App.tsx` still contains a large amount of inspector and layout JSX. That is a remaining P3 maintainability item: extract editor presentation sections as features change, without moving document ownership into individual controls. The stylesheet is also still global. The new native subsystem is separated by concern from its first version; there is no generic plugin framework or abstraction over hypothetical board flash tools.

`desktop/playtest/service.cjs` is the use-case controller, `protocol.cjs` handles transport, `ipc.cjs` is the Electron adapter, `native/host.c` is the LVGL hardware-port substitute, and `src/playtest/native-audio.ts` is the audio backend adapter. These boundaries keep compilation/process policy out of React and Electron out of the portable game engine. Dependencies such as SDK location, compiler and event sink are explicit service inputs so behavior can be tested without the desktop UI.

Validation and known host/hardware limits are recorded in [Verification](Verification.md). The [native playtest guide](NativePlaytest.md) explains user-visible behavior, toolchain requirements and ownership contracts.

## Scene composition review

The scene implementation was reviewed across schema validation, composition, editor commands, preview, export and C/LVGL ownership. The implementation uses one pure resolver and explicit command functions; new presentation lives in SceneTree, SceneInstancePicker and InheritedNodeInspector. These components do not own project documents.

| Finding | Resolution |
| --- | --- |
| Separate hierarchy interpretation in preview/export could produce different games | Both consume src/scenes.ts. C tables retain parent indices and scoped paths; portable/native tests cover propagation. |
| Nested source graphs can cycle or exceed MCU capacity despite small authored scenes | Import/export and editor transactions reject cycles, orphan references, depth above 16 levels and expansion above 128 nodes. Source edits are checked through all containing scenes. |
| Extraction/unpacking can strand sequence-button and outer-override paths | scene-commands.ts migrates project-owned paths through containing scenes. Tests cover nested references. Hand-written C remains developer-owned and must be reviewed after structural path changes. |
| Unpacking/duplicating can retain mutable source-owned tilemap/override containers | Commands explicitly clone owned containers and operate correctly inside Immer transactions. Isolation and undo workflows are tested. |
| Extracting a root can incorrectly add a source-position override to the new instance offset, or leave a visibility override behind a hidden instance | Reference migration splits root translation/visibility overrides onto the new instance and keeps visual/behavior overrides on the original inner node. A regression test checks positions and visibility before/after extraction. |
| Linked instances can duplicate compressed tile data in flash | Export interns identical tilemap definitions/payloads alongside existing image-variant interning. A repeated-map test verifies one emitted payload. |
| Parent motion/visibility must affect gameplay as well as pixels | C propagates world deltas and effective visibility; collisions/clicks use effective flags. Logical roots allocate no LVGL object. Raw world-position writes in existing hooks are synchronized. |
| EXIT callbacks can attempt recursive teardown/transitions | The LVGL view guards reentrancy; the default facade rejects transitions/deinit in EXIT. Scene definitions are validated before EXIT so invalid loads keep the current scene intact. |
| Insertion commands can return Array.push's result from an Immer producer | The graph transaction discards command return values explicitly. End-to-end tests cover Add/Instance and rollback paths. |

Verified boundaries are translation/visibility composition and root-scene lifetime. Runtime spawning, additive loading and rotation/scale inheritance remain explicit product limits. No physical MCU timing/RAM claim is made. App still owns a large inspector/layout surface; further presentation extraction remains a P3 maintenance item.

## Workbench reconstruction review

New workbench behavior is separated into resource navigation, command menus, bounded resizers and UI-only preferences. Document mutations still pass through App's validated commands. No changes were made to the firmware scene model, compressed asset formats, C ABI or native build supervisor.

The review addressed accidental placement during resource browsing by separating selection from explicit actions/double-click; isolated layout state from project JSON/history; added bounded/corruption-tolerant preference loading; supplied keyboard resizing/menu navigation and pointer cleanup; and stopped menu/control keystrokes from controlling a running game. Start/resume focuses the viewport, including a start from Code after the viewport mounts. Drag/resize tests now derive the actual viewport scale so fractional fit zoom is verified correctly.

Verification covers project selection versus mutation, explicit place/instance/code navigation, console filters/clear, resize/collapse/persist/reset/focus, Inspector folding, scene tabs, game switching, narrow layouts and the packaged offline interface. The workbench provides fixed dock positions with resizable dimensions, not freely rearrangeable/floating windows. The existing inspector still has substantial presentation JSX; extraction remains a maintenance item.

## Physics and collision review

Reviewed schema/import/export contracts, scene ownership, editor gestures, C/preview behavior, callbacks, debug rendering and native protocol integration. New presentation lives in PhysicsInspector and ColliderOverlay; physics lives in dedicated portable/preview modules. The existing lifetime, audio and export services remain the owners of those concerns.

The supported scope is a rectangle character solver with areas, gravity and jumping. It is not a force-based rigid-body solver. CPU/RAM and speaker behavior on real hardware still require target profiling. See [Physics](Physics.md) for remaining shape, platform, teleport and floating-point limits.

## Tileset importer and placement review

Reviewed import bounds, asset ownership, shared-resource commands, pointer gestures, export reachability, byte indices, native queries and legacy C compatibility. The feature is separated into a pure image foundation, tileset operations, sparse placement algorithms, a gesture hook and dedicated lazy UI components; model validation has no runtime dependency on editor commands.

| Finding | Resolution |
| --- | --- |
| The old 32-bit mask limited useful atlases to 32 tile types | New optional compact collision bytes cover 1–255; all physics/debug consumers use one checked helper. Legacy masks continue to work. Strict C and both LVGL versions test value 255. |
| Importing a sheet as individual sprites would clutter resources and retain unused pixels | One Tilesets resource stores selected crops and atlas IDs. Transparent tiles and hidden transparent RGB are discarded; exact duplicates can be merged. Source grids and pixels stay outside runtime tables. |
| An unchecked hash could merge different graphics | Hash buckets always confirm full byte equality and dimensions before sharing a C image descriptor. |
| Unused palette images increased flash; remapping used indices could break game code | Only painted graphics are emitted; unused entries are NULL and bank values stay stable. A tile manifest records their meaning. |
| Fast pointer events could leave gaps, and overlapping multi-cell stamps could keep an earlier overwrite | Integer line interpolation fills gaps. Sparse change accumulation deletes a prior write when a later stamp restores the original value. Regression tests cover both cases. |
| Empty stamp slots could erase existing terrain | Brush/rectangle/fill skip holes; erasing is an explicit tool. Unknown, unattached tile IDs fail without applying a partial edit. |
| Fill recursion and per-cell DOM rendering could grow with map size | Flood fill uses a bounded visited array/queue. Editor drawing uses one viewport-sized canvas per layer; MCU drawing remains one LVGL object, with no full-sheet decode or per-cell widget. |
| Changing tileset collision could leave reusable scene copies stale | Shared property commands update every authored map; linked instances resolve their source data as before. Import/layer attachment and property changes are atomic undo operations. |
| A native undo during pointer capture could continue writing into older history | Undo/redo explicitly cancel the active tile gesture before applying document history. Rectangle cancel commits nothing. |
| Late image decoding could update a closed importer | Generation tokens ignore stale reads, all ImageBitmaps close in finally, and closing the modal leaves the document untouched. |

Verified behavior includes actual PNG slicing, stamps, rectangle preview/commit, fill, picking, erasing, collision edits, reload and undo; the packaged executable exports and runs the painted pixels through bundled LVGL and the public query API. Remaining limits are static square maps, full-cell collision, bounded atlas/project sizes and no terrain autotiling, animation or in-place reimport. Hardware flash/RAM/cache/timing still require target profiling.

## Pixel-perfect rendering review

The review kept rendering precision separate from gameplay state and treated the exported C as the device contract. Shared pure helpers own zoom and final draw rounding; one presentation hook owns monitor scale and frame placement. The document flag is saved and undoable, while magnification remains an editor preference.

| Finding | Resolution |
| --- | --- |
| Nearest sampling alone allowed uneven pixel sizes at fractional Fit zoom | Quantize magnification in physical display pixels, preserve aspect ratio and scroll below the minimum useful scale. |
| Correct-looking DOM bounds could still produce blur, shifted sprites or clipped edges | Render the ordered scene once into a logical-resolution canvas, scale through layout and align its frame to shared CSS/physical-pixel boundaries. Screenshot assertions check actual colors and seams at 1×, 1.25× and 2×. The DOM retains input/authoring ownership. |
| JavaScript and C rounded negative half-pixels differently | One draw helper matches roundf, after hierarchy composition; clipping, painting and debug drawing use that convention. Physics state remains floating point. |
| Runtime enlargement of indexed art shifted colors; behavior also differed across LVGL versions | Keep prebaked nearest image variants and payload deduplication. Exact pixel assertions run on LVGL 9.4 and 9.6 and on the packaged native game. Native-size art avoids enlarged-variant flash costs. |
| Arbitrary sprite sizes silently destroyed uniform source pixels | Native/whole-scale sizing controls and non-blocking resampling warnings, with legacy project compatibility. |
| A large sprite or growing decode cache could waste desktop memory | Clip sprite bitmaps to the visible game area; limit retained variants to 4 MiB/512 entries. No additional MCU framebuffer is exported. |

Verified preference persistence/undo, resizing, Scene/Game switching, scaled pointer input and final exported pixels. Browser preview fonts remain an approximation of LVGL's configured font. RGB565 color quantization and hardware driver scaling still require target checks.

## Target guidance review

The guidance implementation was reviewed across schema validation, catalog provenance, scene measurement, policy rules, UI ownership, exports and the desktop navigation boundary. The review corrected several misleading-budget paths: SD capacity cannot satisfy working RAM or compiled image storage; shared external flash counts audio and code/assets together; external RAM retains an independent internal-engine/system check; additional RGB/LTDC scanout buffers are explicit; and a GPU cannot silence display-link, physics or map traversal pressure. Separate confirmed port flags prevent catalog capabilities from silently enabling LVGL integrations. STM32 DMA2D, 2D GPU, Helium, other SIMD and NPUs are not treated as interchangeable. Catalog operation scopes also prevent transfer-only ESP32-P4 DMA from receiving draw credit and keep PPA/PxP from suppressing general transform/rounded-shape advice.

A mutable global palette cache was replaced with an explicit per-UI immutable-asset cache and fresh scans for pure/export calls. Workload scans are debounced on content changes; typing custom C or editing target assumptions does not repack graphics. Exact final export payload statistics are recorded separately from conservative interactive estimates. Scene resolver failures remain visible, and target advice never changes structural export gating. The JSON catalog uses an explicit import attribute for both Vite and Node/Playwright compatibility. Vendor links use a small HTTPS/domain validator and the trusted IPC boundary, retaining the editor's navigation restrictions.

Remaining limits are deliberate: runtime/widget/table sizes are editable planning allowances, not linker/heap measurements; custom C timing is declared by the developer rather than statically analyzed; reference banks are not a simulated memory allocator; accelerator operation support, decoder policy and actual throughput need firmware verification. CPU/coverage thresholds are documented heuristics, not vendor benchmarks. The catalog is a sourced starting set rather than exhaustive SKU coverage. No new code is injected into the C runtime and no physical MCU performance claim is made.

## 2D example and camera review

Reviewed that both demos remain ordinary editable projects, with shared original art helpers and independent factories, no runtime demo dispatch, and complete preview/native scene sequences. Textboxes use plain labels so inspector text edits and ui_label_set_text work directly. World and HUD coordinates stay separate; camera panning does not mutate authored data, and native collision outlines use the same draw offset. Tile painting receives the inverse editor offset. Camera references are validated and migrated during extraction/unpacking. The camera is computed without another framebuffer or mutable runtime cache.

A real LVGL playtest caught false wall detection at large X coordinates due to subtraction rounding in `next-origin-delta`. Comparing against a saved requested destination fixes it without relaxing collision precision. Validation covers the full side-scroller jump route, both adventure room routes, text editing/undo, independent editor pan, fixed textboxes, real C motion past the first display, automatic scene transitions and replay. Exported image/map payloads remain palette-packed and RLE16/RAW8 selected; unused tile graphics are omitted. Pixel artwork and messages are original and use supported ASCII font characters.

## 2D gameplay review

Reviewed state lifetime, linked instance reuse, event reentrancy, input timing, fixed-capacity execution, dialogue ownership, render ordering, export/native source parity, import validation and serialization.

| Finding | Resolution |
| --- | --- |
| Plain textboxes do not supply reusable conversations, quest branching or room state | Typed action resources run in portable C and a matching fast-preview VM, separate from editor history and scene instances. |
| Reusing a chest script can accidentally share its opened flag | Explicit object state remaps, including linked-child overrides, resolve state writes/branches/pages through the owner. The lab/tests use two copies, separate flags and shared inventory. |
| A script loop or many simultaneous events can grow work/storage | Eight fixed slots, same-script/owner deduplication, 32-instruction tick budgets and rejection counts replace recursion or a growing queue. |
| Short keyboard taps can disappear between frame samples | Core step input and rising-edge latches preserve physical input; preview retains action pulses until a fixed step consumes them. Packaged native input exercises a fast E tap. |
| Dialogue should block movement while keeping its input/waits alive | A simulation-blocked flag gates world physics; the VM and serialized update callback continue. Pause still freezes both. |
| State restored from damaged or incompatible storage can partially mutate a session | Version/identity/schema/length/checksum/all bounds are verified first. Explicit LE encoding avoids struct padding and pointer dumps; TS/C bytes are compared in native integration. |
| Room spawn teleports can leave child hitboxes behind in preview | A shared simulation-position operation propagates hierarchy deltas; C uses the existing world-position API before START. |
| Added generated APIs can accidentally enter a header as definitions, or C helpers can be called before declaration | Actual strict exported CMake builds caught and corrected these template insertion errors. |
| A lazy editor declaration above the React import fails in Vite's transformed modules | Gameplay lazy initialization lives after the React import, covered by the full editor workflow. |
| A dropdown under the toolbar can be visually covered by the zoomed canvas | The open session monitor raises its toolbar stacking context, verified through actual pointer actions. |
| Y sorting must not reorder simulation/hierarchy data or mutate LVGL during drawing | Transient sorted index lists drive rendering; LVGL order changes only in view synchronization, and only when an index changed. |
| Resource deletion and usage display can create dangling links or O(fields × rooms) rescans | Referenced resources cannot be deleted in the UI; one usage index is built per document revision. Imports/exports validate all links and remaps. |

That milestone preceded the 2D Toolkit below, which adds floor ramps, platform carry, projectiles and RPG databases. Remaining boundaries include general dynamic scene spawning and complete genre combat packages. Literal scene paths and handwritten C need review after structural changes; role selectors and remaps support portable reuse. The current JSX action form is a sizeable presentation module, while schema, commands/recipes, execution, serialization and export remain independent. Hardware timing and storage policy still require the target port.

Lifecycle policy: explicit scene requests and configured automatic Game flow transitions retain their existing precedence and cancel old scene coroutines. A blocking script freezes world physics, not a separately configured sequence transition; final conversations should precede a script-ending warp/manual sequence advance. This policy is documented instead of adding an implicit event queue or ambiguous scene-transition ownership.

## 2D Toolkit review — 2026-10-19

Reviewed ramp transitions/headroom, kinematic passenger ownership, fixed-step API semantics, projectile lifetime/overflow/hit callbacks, RPG references/save links, export reachability, optional allocation, renderer ordering/dirty bounds and authoring transactions. The new systems keep immutable flash definitions separate from scene/caller-owned mutable state. Presentation is split into dedicated pattern form, preview lifecycle, RPG form and inspector components.

| Finding | Resolution |
| --- | --- |
| Center-foot ramp sampling caught toes on flat crests | Highest support under the foot interval joins ramps/flat floors; ascent preflights headroom and rolls horizontal movement back before penetrating a ceiling. |
| Platform movement by teleport lost passengers; blocked paths could accumulate drift | Explicit Platform body and displacement API sweep passengers before movement; path tracking uses actual relative displacement, independent of parent translation. Jumpers/hidden characters are excluded. |
| Projectile spawning could allocate/grow queues or tunnel through thin hurtboxes | One optional fixed pool, overflow drops new shots, stable earliest segment/AABB hits, bounded rate/count/lifetime and no per-frame trigonometry. |
| A child emitter could hit a sibling hurtbox on its own character | Shared-character ownership excludes those pairs in both runtimes. Hit payload/other pointers are callback-scoped and cleared afterward. |
| Per-bullet LVGL widgets and whole-screen invalidation would waste MCU resources | One pooled draw surface above world/below UI; old/new occupied bounds are invalidated. Dense patterns can still require full redraw and guidance warns on workload. |
| RPG references could dangle or images vanish from export | Structural/referential bounds at import/export, usage-index deletion guards, stable generated IDs and reachable packed portrait/icon descriptors. Integer helpers accept explicit random rolls. |
| Duplicating new nested components could share mutable authoring containers | Branch cloning copies colliders, path settings, emitters and tile-bank profiles. Source data remains unchanged during play. |
| Fast preview could imply custom C was running | Toolkit example/guide explicitly direct custom hooks to Native LVGL Play; exported C integration verifies update-loop motion/carry, time and speed. |

Limits are explicit in Toolkit2D.md: floor-only ramps, prescribed platform paths, conservative projectile AABB radii with no terrain collision, coalesced same-script hit pages, fixed pool allocation size, and databases rather than a complete RPG ruleset. Real MCU CPU/cache/ABI/driver timing is still measured on target.

## RPG and animated terrain review — 20 October 2026

The new subsystem separates database/party schema, combat state transitions, bounded menu presentation, serialization and native LVGL rendering. Shared immutable definitions remain in flash. Party state is optional and fixed-size; no dynamic per-turn entity/command graph was introduced. Existing App document transactions still own edits and undo. The supplied paid artwork is generated only into ignored `.local-examples`, outside distributable app resources.

Review fixes included: preserving terrain-group identity when source pixels deduplicate; rejecting saves during active combat and restoring atomically; claiming a battle result for its owning VM runner; clearing battle destinations when deleting steps; yielding after long automatic stun/enemy chains; rejecting ineffective item use without consuming inventory; checking native pause before menu clicks; latching short preview menu taps; preventing hidden dialogue/menu overlap; automatic text contrast for dark game buttons, ASCII built-in labels for the default MCU font, and matching the enemy heal threshold for odd maximum HP. The tile invalidator traverses RAW/RLE storage only after a frame pointer changes, clips invalidations to the viewport and allocates no per-cell state.

Validation compares initial and post-combat TS/C save bytes, compiles generated code with strict warnings on real LVGL 9.4/9.6, and exercises editor transactions and packaged native play/export. The source remains an early engine: combat is a small deterministic ruleset, saves do not capture live battle/room/script stacks, terrain presets import image geometry rather than full RPG Maker game data, and physical MCU RAM/timing still need board measurement. App.tsx remains a large composition root; new behavior lives in focused modules rather than adding combat rules there. This was a self-review, not an independent audit.

## STM32H7S78-DK, scrolling world and melee review

Self-review covered the optional pool lifetime, fixed-step input edges, attack phase/animation agreement, hierarchy visibility, physics locking, board dependencies and output layouts. The changes preserve portable C/preview separation and keep HAL configuration in the pinned board integration.

| Finding | Resolution |
| --- | --- |
| Short touch presses could vanish between simulation ticks, or releasing touch could clear keyboard input | Physical and virtual masks merge before latched edge detection. A fixed held-button bitset handles duplicate mappings. Pause/scene/reset clear state; hiding a button releases its hold. |
| Attack movement locking reset falling speed every tick | Horizontal movement locks while platformer gravity retains vertical velocity in both runtimes; dedicated regression tests check falling progression. |
| Generic NeoChrom configuration can default to a different CPU's Nema library | Board export explicitly selects `LV_NEMA_LIB_M7` and the H7RS HAL. The real ARM build links the Cortex-M7 hard-float library and checks GPU/HAL symbols and memory sections in the map. Static libraries are grouped to resolve Nema's callbacks into LVGL. |
| Enabling DMA2D drawing alongside the reference LTDC DMA2D flush creates shared peripheral ownership | The board keeps DMA2D drawing disabled and rejects conflicting configuration at compile time. |
| Legacy collider defaults differed between the initial C melee query and preview | C now uses the same default world/player/pickup layers and body fallback as physics. Both runtimes have a regression case for implicit solid colliders. |
| Future scene transitions could leak optional combat storage or expose stale hit metadata | The LVGL adapter prepares storage before replacing the scene, preserves old state on preparation failure, frees it after EXIT and resets state on load. Metadata is available only during Hit callbacks; teardown/reinit is tested under native LVGL. |
| A board project could keep its deployment label after incompatible display/renderer edits | Project validation explains how to reapply the board policy or choose generic export. The adapter also verifies the actual 800 × 480 display at startup. |

The melee solver is deliberately a bounded directional AABB query without wall occlusion or automatic RPG HP changes. The board build is compiled/linked, not hardware measured. These limits are documented in `STM32H7S78-DK.md`; no performance claim is inferred from desktop preview or the vendor benchmark.

## Editor build/flash, telemetry and village art

The new board service follows the existing native runner's adapter boundary. Review checked operation exclusivity, completed-artifact ownership, probe identity, programming addresses, cancellation, tool argument escaping, telemetry consistency, MCU resource budgets and depth-sorting parity.

| Finding | Resolution |
| --- | --- |
| A second request could enter during asynchronous flash preflight | Reserve the board operation before awaiting tool/probe checks; a regression test overlaps two flash requests. |
| A renderer edit could flash the previous snapshot, or external modification could replace a completed binary | Project/options fingerprint marks the UI stale. Backend build ID and SHA-256 checks reject stale IDs and changed binaries. |
| Inaccessible USB probes can have an empty serial field | Parser stays within the serial's line, requires a valid serial, and reports CubeProgrammer's open-device error instead of inventing a selectable probe. |
| A memory read could race a telemetry update or return an old frozen sample | A versioned sequence-checked block lives in uncached SRAM; mismatched/odd sequences are discarded, and unchanged uptime becomes stale. |
| Flush callback duration does not include all asynchronous display work | Diagnostics name the sum of flush submission and flush-wait CPU durations explicitly; the guide distinguishes this from wire latency and physical scanout FPS. |
| The software comparison inherited the project's required-GPU guard | The generated requirement is overrideable at build time; only the explicit comparison target disables it and NeoChrom. Both configurations cross-compile. |
| Full visual bounds make a tall lamp/tree sort incorrectly against a character with a small foot collider | Preview and C now use collider feet for Y sorting. A regression test moves the character from behind to in front of an overhang. |

Actual device programming and timing remain unverified: the installed official CLI and GUI both fail to open this attached ST-LINK. Tests of programmer sequencing use a simulated CLI; the packaged test does perform the actual ARM build. No simulated reading is presented as measured hardware FPS.

## Optional touchscreen controls review

Self-review kept touch as an authored UI/input concern, with no board HAL in game logic. The scene policy applies in the shared resolver rather than independently hiding controls in React and generated C. Disabling/re-enabling preserves source layout and visibility, including linked scene instances. The insertion command checks expanded node capacity and remains one validated undo transaction.

Preview input now tracks pointer ownership independently from physical keys. Multiple fingers on the same action retain independent holds; release/cancel/capture loss cannot clear another pointer or a held keyboard key. Hidden controls release their holds, and scene changes clear pending pulses. Native LVGL disables press lock on controller buttons and the scene root and accepts PRESSING, which is required to enter a new direction while a finger remains down. Tests inject an actual LVGL pointer driver to catch press-lock and empty-gap behavior that direct widget-event tests missed. Repeated PRESSING does not scan the node array unless button ownership changes.

The DK reference driver still reports a single pointer, so moving and pressing Sword/Talk are sequential actions on that port. Disabling an overlay retains its nodes/widgets; deleting the authored group reclaims them. These limits and host-versus-device validation are explicit in TouchControls.md.

## NeoChrom texture compatibility and recovered-board protection

The previous host tests expanded indexed images through the software decoder; they did not validate the GPU's indexed texture representation. A user report of correct UI controls and distorted artwork prompted inspection of the pinned NemaGFX driver and LVGL converter. NeoChrom cooking now uses standard ARGB8888 textures for both GPU and software fallback. A shared image-packing policy also controls target payload estimates. Compact indexed cooking remains the default on software ports, with authored assets unchanged.

Every generated texture has explicit alignment and an image manifest. The board builder rejects legacy indexed NeoChrom exports and verifies the final ELF's texture symbols, sizes, alignment and external-NOR placement. Native tests inspect actual image headers and pointers, then render the full scene in a 300 KiB heap. Byte comparison verifies the rendered world/controls against the earlier software reference; differences are confined to an earlier ASCII hint-label change.

Bootloader replacement now requires explicit selection in the board panel, and a programmer-service test checks the application-only path performs no internal-flash writes or erase/option-byte commands. Preparing this candidate involved local builds and a probe enumeration only, with no programming, reset, bootloader replacement or option-byte change. The physical checkerboard report remains pending on-device confirmation of the candidate.

## Application startup option-byte guard

Review of the inherited board application found that `MX_FLASH_Init` could call `HAL_FLASHEx_OBProgram` during startup. The prepared application now reads and checks those configuration bits without unlocking or programming flash. The builder rejects remaining flash-unlock/option-program calls in the prepared main. A regression test verifies the transformation and rejection of an unrelated write path, and actual M7 ELF symbol inspection confirms those programming/unlock functions are absent from both new applications. The existing Boot image is unchanged. Its firmware still owns its original board preparation; normal updates preserve it.

The CLI deployment stages complete 64 KiB erase sectors from a confirmed external backup, retains the final sector's bytes beyond the candidate, and checks both external readback and unchanged internal flash. Connection errors have prevented those backup/program stages from running on hardware. The recovery files and operation plan are retained under ignored `.local-examples/device-flash`.

## Layered animation and local pack village follow-up

Reviewed the new authoring, composition, import and export boundaries. Resolved findings: rear cloak/body ordering is explicit; all layers share one timeline; immutable-only caches retain one current source revision and latest bake per clip, while mutable script inputs recompute; source frames stay untouched; inactive layer editors avoid mounting thousands of frame selectors; stale image reads are rejected after replacement/unmount; imports check source/clip/resolved-scene budgets before their single undo transaction. Scene preview and export resolve the composed idle image before the first simulation tick.

The exported runtime receives ordinary precomposed frame pointers. No layered-rendering allocator, per-layer timers, additional LVGL children or portable C ABI changes are introduced. Runtime outfit swapping is outside this authoring feature: create another composed clip/outfit and select it through game logic. The importer preset covers compatible P1 sheets; other animation pages need manual clips or a later preset.

The local demo's generated scenery is replaced with native crops/assemblies from both supplied packs. Building siding fills roof gables beneath the source silhouette, the large sign clears the NPC patrol, and feet colliders are rebuilt for native object sizes. The source files remain unchanged. Review uses the standalone Mac app; no board programming is part of this follow-up.

## Dialogue and modular roof follow-up

The workshop roof assembly now repeats native source modules rather than stretching a malformed crop. Preview and portable story pagination share the touch-safe bottom-edge policy, including hidden-control exclusion and a small-screen fallback. The generated adapter owns a single reusable 40px advance widget, and its Confirm callback uses the selected choice. Regression coverage exercises pointer dismissal through both the authored TALK control and the generated Close widget.

## Pack protagonist and actor scale follow-up

The local demo now removes all old generated character sprites/clips and assigns the pack-based actor to the existing player identity. P1 locomotion and P2 overhead-tool poses share a full-cell origin; the blade effect is its own editable layer. Actor display scale and feet bounds use the same integer factor; world feet are preserved when replacing player/NPC visuals. Source cells are deduplicated using both a hash and an exact pixel comparison. The local project remains below the source-sprite and import-size caps, and the actual 300 KiB native harness still checks movement, dialogue, water and sword hits.

## Mana Seed side-facing mapping correction

P1 and P2 use source rows Down, Up, Right, Left. The importer previously associated the side-facing rows with the opposite directions. Both import paths now share one explicit row table, keeping editor clip order separate from source layout. Regression assertions inspect the source-row pixels for every P1 idle/walk layer and both P2 side swings. The native harness checks positive/negative player and NPC velocity against the selected directional clip, with rendered left/right review images. Movement and pixel data are unchanged.

## Hierarchy and prefab review

Tree drops report intent to `moveSceneNode`; validation and commit remain in the authoring transaction boundary. Parent and descendant cycles, inherited structural edits, orphan sources, nested spawn pools, depth and expanded budgets reject atomically. Sibling order changes independently of world positions and stable IDs. Existing parent selection and Undo remain available.

Prefabs reuse scene composition and the existing source/override/reference-migration pipeline. Pools are explicit authored linked slots, not a second hidden object graph. Source IDs use readable unique names while existing ID constant rules remain compatible. The core keeps activation separate from visibility, validates coordinates before resetting a branch and uses generation handles across reuse/reloads. Spawn/despawn callbacks reject recursive pool mutation and scene teardown. Contact bits, melee hit masks, owner projectiles, transient physics/animation and owner-bound scripts reset before reuse. The LVGL adapter restores mutable labels and button state before user spawn hooks without changing engine.user. Session state bindings intentionally preserve their semantics.

Verification caught and fixed three integration issues: browser drag tests needed a real threshold-crossing mouse movement; the preview popover needed absolute positioning to keep controls stable; and older sample event switches needed a default branch for newly added lifecycle events. The C harness checks 200 reuses and pickup accounting. The packaged native test verifies 200 reuses preserve widget pointers/counts, restore labels and reject stale handles. The target estimator budgets all slots as potentially live; host targets suppress routine pool advice. Rotation/whole-branch scale inheritance, independent prefab files/variants and unbounded spawning remain outside this implementation.

Final review also fixed instance-only metadata surviving a disabled-slot Unpack. Tests now round-trip the resulting group through the project parser. Native visibility tests observe LVGL synchronization rather than assuming one render per fixed simulation tick; the corrected packaged scenario passes twice.

## Scene navigation review — 2026-10-20

Navigation is transient presentation state, separate from authoring transactions, simulation and the exported camera. Pure zoom/anchor/bounds functions remain independently testable; the React adapter owns input capture and resize policy. A manual action disables automatic Fit, and document-session identity survives renaming or Save As without sharing a stale view with another opened document. Scene and Game views have independent state, bounded to 64 remembered contexts.

Capture-phase pan input prevents simultaneous object, collider or paint edits; cancellation releases capture and Space state. Keyboard shortcuts leave editable controls and menus alone. The visible-window raster and overview sampling avoid allocating a world-sized bitmap, while inspection scales retain the existing exact pixel grid and bounded sprite cache. The display background is confined to the game rectangle; editor hints stay at the panel edge and do not cover off-screen artwork.

Verification corrected two test assumptions: native Open must finish before testing the new document's zoom, and canvas pixel probes must include the new raster origin. The existing RPG UI test now waits for the typewriter's Close state before confirming dismissal; dialogue production behavior is unchanged. Remaining scope is explicit: 2D Scene navigation, session-only view memory and editor-only overview reduction. Exported assets, runtime physics and MCU framebuffers are unaffected.

## Firmware performance review — 2026-10-20

The optimization boundary stays in portable algorithms and explicit port policy. Sparse immutable RLE checkpoints include their storage cost before codec selection; caller-owned cursors prevent stale shared caches across engines/maps. Drawing clips before decoding; animated invalidation batches contiguous visible spans. Source graphics and collision ordering remain intact. Exported node capacity includes every resolved scene and reserved prefab slot. Ceiling-divided contact bitsets and the 1..128 guard preserve small/manual capacities without zero-length arrays or last-byte overruns.

Scalar reciprocal multiplication avoids per-pixel divisions while retaining finite-value validation; global fast-math is not enabled. ARM GCC verification exposed enum lower-bound checks that warn with unsigned enum representations; unsigned upper-bound validation now rejects negative/out-of-range values portably. Effective MVE reporting comes from the compiled kernel, avoiding a requested macro falsely reporting acceleration after fallback.

Generic fallback does not pull vendor headers into unrelated MCUs. Strict mode remains the default for the verified H7 port, preserving DMA ownership, texture/alignment and hardware integration checks. No cache/MPU/clock/bootloader modifications or automatic gameplay reduction were introduced. Target guidance accounts for visible tile work, node capacity, implicit areas/pickups, software-FPU load and external-memory traffic. The [full review](PerformanceReview.md) separates implemented changes, measured evidence and candidates requiring on-device profiling; it does not infer board FPS from a host microbenchmark.

## Cutscene and longer-campaign review (2026-10-20)

- Cutscenes extend the existing event VM: immutable flash commands, eight sequential runners, fixed instruction budgets, no new evaluator or timeline heap. One cinematic director owns the camera; staged actor tracks continue while player physics is modal. Completion, warp and prefab retirement release their tracks. Skip requires a started runner and an explicit completion beat, and cannot rewind after that beat. Player clicks cannot open another modal interaction during staging.
- Project catalogs grow to 512 scripts / 128 beats / 2048 source sprites while scene, clip, runner and projectile limits stay bounded. The campaign uses one loaded area, shared costumes and native 32px terrain. Source writing, world construction, content compilation, runtime tracks and beat controls are separate modules.
- Checkpoint packets retain schema/checksum/bounds validation and atomic restore. Desktop storage uses profile-local temporary-file replacement. Exported firmware receives explicit storage callbacks. The exporter allocates exact-size static scratch only for projects with checkpoint commands, avoiding a 4 KiB embedded task-stack temporary.
- A real 20.9 MB campaign exposed pretty-print expansion during editor and CLI saves. Both now share compact serialization. A large valid art fixture that exceeds 24 MiB when indented verifies that saving and reopening preserve its pixels within the file cap. The actual packaged app and CLI also save the campaign successfully; its original source project is unchanged.
- Story progression, quest rewards, late-game return routes, missing/incompatible saves and the earned ending gate have deterministic audits. A grid audit caught and fixed an isolated reservoir sign. Human completion time, full combat balance and hardware campaign FPS remain unmeasured; automated event traversal is not represented as a 2–4 hour human playtest.
