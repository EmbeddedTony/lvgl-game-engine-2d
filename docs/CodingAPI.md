# The Little Grove: firmware API

## Integrate

Add this entire ui folder to your firmware. LVGL 9.4–9.6 must already initialize its display, tick and input port.

```cmake
add_subdirectory(ui)
target_link_libraries(your_firmware PRIVATE lvgl_game_ui)
```

```c
#include "ui/ui.h"

void board_start_game(void) {
    if (!ui_init()) { /* report initialization failure */ }
}
void board_poll_input(uint8_t actions) {
    ui_set_input(actions); /* e.g. UI_INPUT_LEFT | UI_INPUT_UP */
}
```

The board keeps calling lv_timer_handler and advancing the LVGL tick. The UI owns its 16 ms timer and 60 Hz simulation. Do not add a second lge_update loop. All UI calls run on the LVGL owning thread/lock.

## Use the API

| Function | Result |
| --- | --- |
| ui_init() | Start the authored Game entry on lv_screen_active; false if already running |
| ui_init_with_config(&config) | Supply parent/audio/user state; optionally override start_scene or start_sequence |
| ui_deinit() | Stop voices, remove timer and delete objects; safe to repeat |
| ui_request_scene(UI_SCENE_...) | Queue a valid scene change, safe inside a hook; unknown ID returns false |
| ui_sequence_start(UI_SEQUENCE_...) | Queue a named sequence's first step; false if paused, invalid or a transition is pending |
| ui_sequence_next() | Queue one step, including loop/end behavior; false outside a sequence or while paused/pending |
| ui_sequence_stop() | Cancel sequence/pending transition while retaining the current scene |
| ui_current_scene() | Current scene ID; NULL outside a running UI |
| ui_current_sequence() / ui_current_step() | Current sequence/step IDs; NULL outside a sequence |
| ui_find_node(UI_NODE_...) | Current scene's runtime node, or NULL; cache only until scene changes |
| ui_find_object(UI_NODE_...) | LVGL object, or NULL for missing/logical nodes |
| ui_node_set_position(id,x,y) | Set world pixel position; descendants follow |
| ui_node_set_local_position(id,x,y) | Set parent-local position; descendants follow |
| ui_node_parent(id) | Stable parent path, or NULL at scene root |
| ui_node_set_visible(id,visible) | Set own visibility; descendants inherit it |
| ui_label_set_text(id,text) | LVGL copies the text; false for missing/non-text/bound labels |
| ui_set_paused(true/false) | Pause/resume simulation and backend audio |
| ui_audio_play(UI_SOUND_...) | Voice token, or 0 if silent, paused, missing or rejected |
| ui_audio_complete(token) | Natural playback completion; marshal from audio worker to LVGL thread |
| ui_audio_set_bus(LGE_BUS_SFX,gain) | Live 0–1 bus gain |
| ui_audio_set_master(gain) | Live 0–1 master gain |

Constants are in ui_ids.h. Object IDs are scoped to the current scene. Display names may change without changing IDs. Avoid retaining node/object pointers across a scene change. Use ui_request_scene rather than destroying/loading the scene during an event. Pause clears held input; repoll your board's state after resume.

## Compose scenes

Sprite melee adds a bounded optional pool for up to eight actors, directional attack clips and windup/active/recovery phases at the fixed 60 Hz clock. Configure Sword & melee in the inspector, then Space/Action starts the player attack. ui_melee_start(id) starts configured C-driven actors; ui_melee_active(id) includes all phases. A target receives one Hit event per swing according to collision layers. During Hit, ui_melee_hit() returns attacker/target/damage metadata (NULL for projectiles); ui_projectile_hit() returns the projectile counterpart. Game scripts own health/damage rules. Movement locking preserves platformer gravity. Controller input on a UI button merges touch with physical keys and preserves short taps until a simulation tick. No per-attack allocation occurs. See docs/STM32H7S78-DK.md for the board demo and acceleration setup.

Project settings → Touchscreen controls enables editable on-screen controls per scene (enabled in the DK demo). Hold/slide between arrows; release to stop. The board supplies an ordinary LVGL pointer driver. Physical ui_set_input(mask) and touch merge independently; polling zero physical keys does not cancel touch. Disabling preserves authored layout and hides mapped buttons, including instanced ones. See docs/TouchControls.md for preset costs, customization and the DK single-pointer limit.

The 2D camera control separates scene world size from display size. A scene can follow a resolved world object horizontally or on both axes, with integer pixel alignment and clamped edges. Editor view panning is transient; it does not move authored objects. World physics bounds use camera world dimensions. World objects draw at world position minus the camera; UI-layer widgets/textboxes remain pinned. ui_camera_position(&x,&y) reads the drawing offset (false/zero without a scene camera); ui_node_set_position and collider APIs always use world coordinates. Camera references are validated and migrated by branch extraction/unpacking. Existing projects omit camera2d and retain screen-sized behavior. No extra framebuffer or runtime allocation is required.

The Design tree supports parents, logical groups and linked scene instances. Source edits update instances; child overrides support local position, text, color, visibility, speed and cue. Revert restores the source. Save branch as scene extracts a reusable source; Unpack breaks the link. These commands migrate project-owned references; review hand-written C after structural path changes.

Instance boundaries create scoped paths: hero/player or menu/panel/action. Ordinary reparenting preserves IDs. Use generated UI_NODE_* constants with ui_find_node. Runtime node->x/y are world positions. node->visible is its own flag; effective_visible includes ancestors. Hidden descendants cannot render, collide or click. Groups/instance roots allocate no LVGL widget. Nested sources share the loaded root's lifetime, score, input, hooks and audio; their background/music/objective do not replace the level's.

Composition is compiled into immutable parent-indexed C tables, limited to 128 expanded nodes and 16 levels. Images and identical compressed tilemaps share payloads. The runtime supports translation/visibility inheritance and event/state-remap components on linked nodes; runtime spawning, additive loading, rotation/scale inheritance and inherited-scene variants are not provided yet.

## Organize scenes and sequences

Game flow in the editor separates scene content, organizational folders and named sequences. Sequences reference scenes and have stable step IDs; reusing a scene does not duplicate its data. Steps advance manually with ui_sequence_next(), on COMPLETE (all visible collectibles found), or on a chosen button's CLICK. An ending holds the last scene, loops, or opens a chosen scene. Game entry selects the initial scene or sequence.

The generated constant tables live in generated/game_flow.h/.c. The portable engine/lge_flow.c has no allocations or LVGL dependency. Folders are editor-only. Limits: 256 scenes, 32 sequences, 64 steps per sequence, 256 total steps. Old projects default to their first scene.

Transitions are deferred until a safe LVGL timer boundary. The first queued request wins; repeated requests return false until applied. An explicit request inside a hook takes precedence over that event's automatic step rule. The new sequence cursor is committed before START, after its widgets exist. A direct ui_request_scene leaves the sequence when the new scene opens. Hold endings clear the cursor without recreating the scene. ui_sequence_stop cancels pending work and keeps the current scene. No recursive sequence stacks are used.

Every scene entry resets scene-local node motion/collectible state and stops old voices. Authored Gameplay state survives scene changes. Use ui_state_get/set/add for flags, counters and inventory stacks; object state remaps specialize linked actors/props. Application-owned state can also live in config.user. Keep gameplay functions in scene-specific firmware modules and use the shared game_on_event hook as a short dispatcher based on game->scene->id. ui_current_step distinguishes repeated visits to the same scene. Add your extra modules to your firmware target; re-export preserves unknown files but does not register them automatically in CMake.

Design's Play tests one scene. Preview sequence / Play game exercise authored flow; Next step simulates a manual advance. Native LVGL playtesting compiles and runs the generated C inside the desktop editor. Hardware drivers and MCU behavior still require firmware tests. Sequences organize scene journeys, not animation timelines. Advanced game_create instances remain independent of the default UI's sequence dispatcher.

## Gameplay, dialogue and save buffers

The Gameplay workspace authors named bounded state, reusable action scripts, eight conditional event pages per object, and motion/directional sprite clips. Last matching page wins per trigger. Up to eight script coroutines execute 32 immediate instructions each per 60Hz step. Waits and dialogue yield; full slots reject starts. Role selectors self/player/other make scripts reusable. Object state remaps specialize saved fields without copying behavior.

ui_state_get/set/add use generated UI_STATE_* IDs. ui_node_state_get/set/add resolve an object's remaps. ui_script_start(UI_SCRIPT_*,owner) starts the same actions used by preview. ui_dialogue_text reads the current wrapped UTF-8 page; ui_dialogue_choose advances/chooses a zero-based answer. Feed UI_INPUT_INTERACT separately from jump; short action taps are latched until a fixed step. ui_request_scene_at queues a player spawn before START and requires a destination containing a player.

ui_save_size reports 16 + 4 bytes per persistent field for story-only projects. An enabled party adds an LGR2 envelope (20 bytes), a 12-byte party header and 28 bytes/member. Active battles cannot be saved. ui_save_write fills an exact-sized caller buffer; ui_save_read validates identity/schema/length/checksum/bounds atomically and resets transient fields. Packets store state and optional party health/progression/statuses/RNG, excluding room positions and coroutine stacks. Story-only LGS1 packets remain unchanged. The board owns storage, atomic writes, flash wear and migrations. Restore outside blocking interactions and reconstruct room objects from Start pages. Advanced game_create instances retain the lower-level view contract; authored scripts/state are provided by the default ui facade.

Sprite frames remain immutable packed images; animation does not change colliders. Grid movement completes a released tile step and sweeps obstacles. One-way static geometry catches descent only. Z index and optional foot-Y sorting affect drawing independently of hierarchy/physics order. The 2D Toolkit adds floor ramps, passenger-carrying platforms, bounded bullet patterns and typed RPG databases. Melee hit detection and optional RPG party/battle sessions are built in; game-specific combat, enemy AI and progression rules remain authored. See docs/Toolkit2D.md in the repository. See the repository's docs/Gameplay2D.md for the full authoring contract and scope.

## Tilesets and tilemaps

Project → Import tileset slices PNG/WebP/JPEG sheets into reusable square tiles (8–64px). Set symmetric margins and spacing, select atlas regions, and optionally merge exact duplicates. Transparent cells are omitted. Choose a new tilemap layer, attach to a matching selected layer, or import only the resource. Tilemap in the bottom dock provides Brush (B), Eraser (E), Rectangle (R), Flood fill (F), Pick (I), multi-tile stamps and shared Solid properties. Right-click erases; Alt-click picks. Stamps skip empty atlas cells. Each completed gesture is one undo step.

Firmware uses 0 for empty and 1..255 for map-bank values, shown on palette cells. Attaching a tileset appends types without renumbering existing cells. ui_tile_at(id,column,row) returns that value, or 0 outside/missing. ui_tile_is_solid(id,column,row) tests the collision bit. tile-manifest.json maps each scene/node/value to stable image IDs, names and solidity for integration. These queries are read-only; map definitions remain const in flash.

Only painted tile images are emitted. Unused bank slots remain NULL so indices stay stable, and byte-equal images share one descriptor/payload across resources. The map chooses RLE16 or RAW8 according to actual size; collision uses ceil(tile_count/8) bytes, at most 32. Each tilemap is one LVGL object drawing visible tiles; there is no full-sheet decode, runtime JSON parsing or per-cell widget. Source atlas coordinates and unpainted pixels remain editor-only. Compression reports exclude pointer tables, LVGL caches, widgets and board buffers. Profile the real board. This version uses orthogonal square tiles, optional floor-ramp profiles and static layers; Tiled/Godot project import, terrain autotiling, animation, rotations/flips and hex/isometric grids are not implemented.

## Physics and hitboxes

Child Area nodes follow their parent and allocate no LVGL widget. Hitbox, Hurtbox and Trigger presets configure eight named collision layer bits. Membership is separate from the directional detection mask. Hitboxes detect hurtboxes; areas never block movement. Sensors attached to the same character ignore one another. Hiding an area disables detection independently of the artwork. Area cues play once per entering object through the injected audio backend.

AREA_ENTER / AREA_EXIT pass the detecting area as node. ui_event_other() returns the other node ID during that callback. ui_area_contains(area,other) reads the latest filtered sample. ui_nodes_overlap(a,b) queries geometry and visibility without layer filtering; ui_node_bounds(id,&box) reads world collider bounds. ui_body_is_on_floor(id) and ui_body_jump(id,speed) support custom character logic. ui_set_collision_debug(true) draws optional LVGL outlines.

Physics uses no gameplay heap. The engine stores 2 KiB of overlap bits, per-node velocities and contact flags; immutable definitions remain in generated C. Velocity is bounded to ±1200 px/s and area samples to at most 20 substeps per fixed tick. Axis sweeps stop thin walls. Spawn/teleport positions must be unoccupied. Scene loads clear contacts. This release adds floor-only linear ramps and prescribed kinematic platforms with passenger carry/push and crush prevention. Arbitrary polygons, sloped ceilings and force-based rigid bodies remain outside this solver. Test performance and floating-point behavior on the target board.

## Motion, patterns and RPG data

The update hook already receives dt_seconds = 1/60. ui_delta_seconds() reads the current fixed-step delta (zero outside a step); ui_time_seconds() is scene-local simulation time, frozen during pause. ui_body_velocity reads actual px/s velocity; ui_node_set_speed/ui_node_speed change/read the mutable 0–600 px/s input speed. Code controllers and Platforms accept ui_body_set_velocity. Choose one motion owner: either velocity integration or ui_platform_move(id,vx*dt,vy*dt). The latter carries/pushes riders now, each axis ≤20px/call, stopping an axis before crushing; false may mean partial movement already occurred. Position setters teleport and do not carry passengers. For custom code, select Platform → Velocity/code with zero initial velocity. Native LVGL Play executes the C update loop; fast Play runs built-in authored motion.

Gameplay → Bullet patterns authors fans, rings and aimed volleys with live preview. Attach an emitter to a world object; scripts or ui_emitter_set_enabled control it. A shared scene pool holds 1–64 shots and drops new shots when full. ui_projectiles_count/dropped report it. A fixed 64-slot allocation exists only in emitter scenes; a smaller limit bounds active work, not allocation size. Shots sweep against masked Character/Area AABBs, ignore their owning character, and draw above world/below UI. PROJECTILE_HIT passes target node, ui_event_other emitter and callback-only ui_projectile_hit()->pattern->damage. Hit pages start ordinary scripts; duplicate same-owner/script starts coalesce. Game code owns HP/invulnerability. Static terrain is not a projectile obstacle in this system.

Gameplay → RPG database authors up to 128 each of items, skills, actors/species and weighted encounter tables. ui_rpg_database returns immutable shared C records. Query via lge_rpg_item/skill/actor/encounter using generated UI_ITEM_*, UI_SKILL_*, UI_ACTOR_* and UI_ENCOUNTER_* IDs. Portrait/icon image pointers use normal packed LVGL descriptors. lge_rpg_stats computes bounded linear level growth; lge_rpg_skill_amount and lge_rpg_choose use explicit random rolls and integer rules. Optional inventory links use normal saved state. Gameplay → Party & battle enables an optional bounded turn-based controller (4 allies, 4 enemies, 16 status definitions). Battle event actions yield until the result is acknowledged, then branch to victory/defeat/escape. P / UI_INPUT_MENU opens inventory; arrows select; E / Enter confirms. ui_rpg() returns the optional session; lge_party_member/add/remove/rest/use_item and lge_inventory_count use database IDs. ui_battle_start and ui_battle_command support custom C controllers; lge_battle_acknowledge closes results. Targets 0–3 are party slots, 4–7 are enemies. The built-in menu handles HP/MP, skills, items, guard, escape, XP/levels/gold and fixed-duration poison/regen/stun/buffs/slow. Equipment and special game rules remain application-owned. See docs/RPG.md. See docs/Toolkit2D.md for the full contract, costs and examples.

## Write game rules

Edit user/game_hooks.c in the editor's Code workspace or in your firmware IDE. game_on_event receives START after scene objects exist, COLLECT after score/visibility is accepted, COMPLETE once, CLICK for UI buttons, AREA_ENTER/AREA_EXIT for explicit detection areas, and EXIT before old nodes/widgets are released. EXIT also runs during shutdown; transitions and recursive ui_deinit are rejected during EXIT. game_on_update receives fixed dt_seconds at 60 Hz after built-in simulation. It pauses with the game. Hooks must return promptly; do not block on storage, serial or audio.

Existing v0.1 hooks using #include "game.h", lge_find, lge_audio_play and game_create remain compatible. Advanced apps can own multiple lge_view_t instances through engine/lge_lvgl.h; the ui_* facade owns one default instance.

## Connect audio

Fill all four callbacks in lge_audio_backend_t and pass it through ui_config_t.audio. Queue work to your board's audio worker: play/stop/pause/set_gain. That worker owns filesystem URI resolution, PCM16 WAV decoding, looping, mixing, I²S/DAC/PWM and DMA. play returns false when it cannot accept a request. Stop/pause must be delivered reliably. The eight-voice runtime handles bus gain, priorities, stealing and late completion tokens. NULL audio runs silently. See examples/board_port.example.c.

Copy assets/audio to storage while preserving the exact relative URIs in audio-manifest.json. The engine does not decode audio on the LVGL thread. Compressed audio codecs are a backend capability; exports contain PCM16 WAV. Physical board performance and speaker output need target testing.

## Re-export safely

generated/ and engine/ are generated. user/game_hooks.c is editable. Native folder export tracks hashes in .lge-export.json, retains unknown files and preserves external edits when only one side changed. If both the editor and disk changed a file, export stops and asks you to choose. Keep the .lge.json project as your authoring source; do not expect firmware-side edits to silently change the editor.

## Configure LVGL

Resolution: 320 × 240; output 16 bits. Enable LV_USE_LABEL, LV_USE_BUTTON, LV_USE_IMAGE and LV_FONT_MONTSERRAT_14. LVGL 9.4/9.5 use LV_COLOR_DEPTH=16; 9.6 uses LV_COLOR_FORMAT_DEFAULT=LV_COLOR_FORMAT_RGB565. Indexed images use LVGL's normal software decoding/cache. Pixel/font rendering should be checked on the real target. See compression-report.json for image/map payload sizes; these exclude widgets, decoder caches and hardware buffers.

## Target planning snapshot

The editor's Target guidance feature is advisory. target-guidance.json records the selected reference/source, catalog review date, memory/display/effect assumptions, workload recommendations and exact export payload counts. It is not compiled into firmware and does not configure an MCU port, linker, filesystem, decoder or accelerator. Confirm available memory, DMA access, real heap/linker use and target timing. SD capacity does not relocate generated C image arrays; external WAV storage still needs a hardware audio backend. Linux/host selections suppress routine MCU advice. No target selected means no MCU warnings.

## Pixel art

Pixel Perfect is enabled (GAME_PIXEL_PERFECT in generated/game_data.h). The project resolution is the game's logical pixel grid. LVGL renders it at 1:1 by default; game positions remain floating point and only final world draw positions round to the nearest integer (negative halves round away from zero). Parent/child positions are composed before snapping. Physics and collision queries retain subpixel precision.

Nearest sampling is explicit on sprite images and tile draws. Sprite sizes are baked with nearest sampling into image variants, avoiding runtime image transforms and their decoder/color differences. Software ports use compact palettes; NeoChrom exports use aligned ARGB8888 textures for compatible GPU and software-fallback rendering. The image manifest and target guidance include the cooked payload sizes. Byte-identical variants share flash payloads. Larger sprites cost more flash; native 1× art is the cheapest option. Arbitrary sprite sizes still export by nearest resampling and produce authoring warnings because their source pixels can be uneven. Use the Sprite pixel scale selector for native size or whole enlargement. Tile imports preserve source pixels; use matching tile sizes.

Keep the game's root and ancestors at integer positions. For a larger hardware display, center the unchanged game viewport, or implement whole-number nearest enlargement in the board's display port with matching touch-coordinate conversion. The engine does not allocate a second framebuffer or silently stretch to the panel. Fractional screen scaling, arbitrary rotations, antialiased fonts and fractional alpha artwork cannot promise uniform opaque pixel blocks. LVGL fonts retain their configured rendering; pixel fonts are separate assets.
