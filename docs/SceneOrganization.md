# Scenes, instances and game flow

A scene owns content; a sequence owns progression; a folder owns neither. Keeping those responsibilities separate lets a game grow without spreading navigation rules through object code.

## Build a scene tree

Every scene has an implicit root. Add **Group** nodes to organize branches, then choose a node's **Parent** in the Inspector. Expand/collapse branches in the scene tree. X/Y are local translations relative to the parent. Reparenting preserves the world position; moving or hiding a parent affects its descendants. World/UI draw layers remain independent of logical ownership. Groups and scene-instance roots are logical nodes and allocate no LVGL widget.

Use a scene for a whole level, a character, a HUD, a menu or a reusable level section. **Add object → Instance scene…** places a linked copy of another scene. The source remains editable independently; its changes appear in every instance. Nested instances are supported. The picker excludes sources that would introduce a dependency cycle.

Select an inherited child in the tree to override its local X/Y, text, color, visibility, player speed or audio cue for this copy. An outer instance's override wins over an inner instance's override. **Revert node overrides** restores the source values. Structure, sprite assignments, dimensions, tile cells and behaviors are edited in the source. **Open source scene** opens that source; **Back to …** returns to the placement you were editing.

**Save branch as scene** extracts the selected branch into a new reusable source and replaces it with a linked instance. **Duplicate object** copies a complete branch with new IDs. **Unpack to editable nodes** bakes an instance's effective values into local nodes and breaks its source link, including nested instances. Each command is one undo step. Deletion removes a whole authored branch. Referenced sequence buttons and dangling overrides block destructive edits with an explanation.

Extraction and unpacking migrate project-owned sequence-button and override references through containing scenes. They can change runtime paths; hand-written C constants/strings must be reviewed after those structural operations. Renaming and ordinary reparenting preserve IDs.

Open [SceneComposition.lge.json](../examples/SceneComposition.lge.json) for a playable example with a character, three instances of one crystal scene, a shared HUD and one menu-button source reused by Title and Results.

## Runtime ownership and paths

Ordinary authored IDs are scene-local, independent of parent names. Crossing an instance boundary prefixes the source ID with the instance ID: `hero/player`, `hud/title`, or `menu/panel/action`. A source can be instanced twice without node-ID collisions. Generated `UI_NODE_*` constants include these paths. Names and folders never form runtime IDs.

```c
lge_node_t *body = ui_find_node(UI_NODE_HERO_PLAYER); /* "hero/player" */
ui_node_set_local_position(UI_NODE_HERO, 144, 154);   /* Move the whole branch. */
ui_node_set_visible(UI_NODE_HUD, false);             /* Hide its descendants. */
const char *parent = ui_node_parent(UI_NODE_HERO_PLAYER); /* "hero" */
```

`ui_node_set_position()` uses world pixels; `ui_node_set_local_position()` uses parent-local pixels. Runtime `node->x/y` remain world positions for existing C hooks. Parent deltas also propagate after direct field writes and controller movement. `node->visible` is the node's own flag; `node->effective_visible` includes its ancestors. Hidden descendants do not render, collide or accept clicks. `ui_find_object()` returns NULL for groups/instance roots.

The exporter resolves composition ahead of time into bounded parent-before-child C tables. No runtime JSON parser, recursive scene interpreter or gameplay heap is needed. Images and identical tilemap payloads are shared across instances; maps still use RLE16 or RAW8 according to size. A loaded scene is limited to **128 expanded nodes**, including logical roots, and **16 tree levels**. Source edits are checked against every containing scene's budget.

This implementation supports translation and inherited visibility. Nested scenes share their containing scene's lifetime, input, score, completion state, event hooks and audio backend; a nested source's background/objective/music do not take over the level. It does not yet provide rotation/scale inheritance, scene inheritance variants, unbounded dynamic allocation, additive scene loading or persistent scene stacks. Independent advanced `lge_view_t` instances remain available to firmware code. These boundaries keep MCU memory use explicit.

## Authoring model

| Concept | Responsibility | Example |
| --- | --- | --- |
| Scene | Objects, tile layers, UI, local music and initial state | Title, Forest, Results |
| Folder | Editor organization; never changes runtime behavior | Menus, Chapter 1, Shared |
| Sequence | Ordered references to scenes, step rules and an explicit ending | Tutorial, Main journey |
| Game entry | One scene or sequence to start in firmware | Main journey |
| Session state | Game-wide progress owned by application C state | Unlocked levels, settings, inventory |

Open **Game flow** or press **⌘4**. The scene library supports search, folders, rename, duplicate, deletion and reference information. The selected scene can be opened directly in Design. Sequences are named tabs with ordered steps. A compact journey strip shows the route at a glance and jumps directly to any step. Each step selects a scene and advances through C code, an accepted COMPLETE event (all visible collectibles found), or a specific UI button. The last step either finishes on the current scene, loops, or opens a chosen scene.

Reusing a scene in several steps or sequences references the same authored definition. Runtime entry creates fresh state each time. This is useful for a common Results screen, repeated challenges or tutorial variations driven by your session state. It does not clone scene definitions or keep hidden LVGL screens alive.

The [Scene Journey project](../examples/SceneJourney.lge.json) demonstrates Title → Forest → Results → Title. The title and results buttons advance their steps; collecting the forest's three crystals advances automatically.

## Stable references and ownership

Names and folders are presentation. Scene, sequence, step and button IDs are the contracts. Renaming a scene or moving it to a folder preserves its references. Reordering a sequence preserves step IDs, so code can distinguish visits to a reused scene. UI constants are generated in `ui_ids.h`.

Removing a referenced scene or advance button is blocked with an explanation. Change those references first. Removing a folder ungroups its scenes. Duplication gives a scene a new ID and preserves its scene-local object IDs. Undo restores structural changes.

Version 1 project files without flow metadata continue to start at their first scene. Flow is optional authoring metadata; existing scene/audio/tilemap definitions stay compatible. Imports validate references and table limits. Empty sequences can be saved as drafts; an empty entry sequence prevents export/play. Completion rules without visible collectibles and rules bound to hidden buttons produce warnings.

The project limits are 256 scenes, 32 folders, 32 sequences, 64 steps per sequence and 256 total steps. These are validated authoring limits, not unbounded heap-based runtime collections.

## One transition boundary

The generated default UI owns one active scene and a small sequence cursor. Immutable `generated/game_flow.c` tables reference scene definitions by generated indices; developers use stable IDs. `engine/lge_flow.c` is portable C99 with no LVGL dependency and no allocations. Folder metadata never enters these runtime tables.

`ui_init()` uses Game entry. `ui_init_with_config()` may override `start_scene` or `start_sequence`, but rejects both together. Existing advanced `game_create()` / `lge_view_t` instances remain independent and do not run the default UI's authored sequence dispatcher.

```c
ui_sequence_start(UI_SEQUENCE_JOURNEY);  /* Queue its first step. */
ui_sequence_next();                     /* Queue one advance. */
ui_request_scene(UI_SCENE_TITLE);        /* Leave the sequence for a direct branch. */
```

All calls run on the LVGL owner thread. A request never deletes the widgets currently dispatching an event. The next timer pass loads at most one queued scene, commits its cursor, then calls START after its widgets exist. Queries report the committed scene/step until that transition. An explicit request made in a hook takes precedence over the automatic rule for that event. The first queued request wins; later requests return false until the pending transition is applied. This prevents repeated clicks or fixed-step callbacks from skipping steps.

At a hold ending, `ui_sequence_next()` ends the cursor without recreating the final scene. `ui_sequence_stop()` cancels the sequence and pending transition while keeping the current scene. Sequence start/advance reject requests while paused; a direct scene request can replace a paused scene. Invalid IDs leave the current state intact. There are no recursive sequence nesting or immediate transition chains.

Scene replacement emits EXIT while old nodes/widgets still exist, then stops its audio voices and releases its LVGL objects. START runs after the replacement widgets exist. EXIT also runs during shutdown; transitions and recursive deinitialization are rejected during EXIT. Node/object pointers are scene-local and must be reacquired in START. Live state such as score and collected objects restarts on every scene entry. Pause uses `ui_set_paused()` to retain the current scene; a pause scene or scene stack is not provided in this release.

## Keep gameplay rules local

Avoid a single long event handler full of scene names and numeric level indexes. Keep the shared hook as a short dispatcher to scene-specific C functions. Organize larger firmware code by feature directories such as `game/menus`, `game/levels` and `game/session`, linking those files in your firmware target. The editor currently edits one `user/game_hooks.c`; additional firmware modules are maintained in your IDE and can be called from that hook. Re-export preserves unknown files, but does not automatically add them to CMake.

Use `game->scene->id` to dispatch the callback you were actually given. Use `ui_current_step()` when the same scene appears twice in a sequence. Put campaign progress in application-owned state passed as `ui_config_t.user`, not in LVGL widget pointers or scene-local node storage. That state persists across scene changes; storage/backups remain a board responsibility.

```c
typedef struct { unsigned unlocked_level; unsigned attempts; } game_session_t;
static game_session_t session;

void start_campaign(void) {
    const ui_config_t config = { .user = &session };
    ui_init_with_config(&config); /* Authored Game entry; session outlives the UI. */
}
```

Use authored sequences for a normal chapter/tutorial path. Use `ui_request_scene()` or `ui_sequence_start()` for conditional branches such as retry, unlocked chapters or a return to menus. Keep those decisions in gameplay functions. The current sequence editor is an ordered journey, not a cinematic animation timeline or a general visual programming graph.

## Preview and export

Design's Play tests only the selected scene. **Preview sequence** tests a sequence; **Play game** starts from Game entry. The preview implements button/completion rules and offers Next step for manual steps. New sequence start/advance requests are rejected while paused; an already accepted transition remains queued. Stop restores the scene that was selected before preview without changing authored objects. Custom C branches execute in Native LVGL playtesting and firmware.

Export adds `generated/game_flow.h/.c`, the portable flow runtime and the public sequence API to the existing `ui/` structure. It requires no runtime JSON parser, graph interpreter or extra task. Host tests exercise the same generated dispatcher and actual LVGL buttons, including automatic completion, looping, duplicate requests, cancellation and branches.

The separation of scene content from orchestration is consistent with Godot's guidance on [scene organization](https://docs.godotengine.org/en/4.4/tutorials/best_practices/scene_organization.html). EEZ's [page and flow tools](https://www.envox.eu/studio/studio-introduction/) informed the discoverability of separate authoring and progression workspaces. This engine uses its own schema and bounded C runtime.

Reusable object sources and bounded runtime spawning now have a dedicated [Prefab workflow](Prefabs.md). Hierarchy supports drag parenting, sibling ordering and detaching to the scene root, with world position preservation and Undo.
