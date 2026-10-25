# Hierarchy and prefabs

Drag an authored object in **Hierarchy**:

- Drop in the middle of a row to make it a child.
- Drop at the top or bottom edge to reorder it beside that row.
- Drop onto **Drop here to move to scene root** to detach it.

World positions and IDs stay unchanged. Children move with their parent and inherit visibility. A move is one Undo step. Cycles are rejected. Linked children are protected: open their source to change shared structure. The Inspector's **Parent** selector remains available as a keyboard alternative. Explicit Z index and Y sorting still determine drawing order; hierarchy order breaks equal-priority ties.

## Create and reuse

1. Select an object or group and choose **Inspector → Scene tree → Create prefab from branch**. The branch becomes a linked instance at the same position.
2. Find the source in **Project → Prefabs**. **Edit prefab** opens its source with a Back button. Shared edits update all copies.
3. **Place instance** adds another linked copy. Select inherited children to override position, text, color, visibility, controller speed, sound or state bindings for one copy. **Revert all overrides** restores source values.
4. **Unpack to editable nodes** breaks the link. Disable runtime spawning first if the instance is reserved. Scenes containing reserved pools must retain their pool links.

Prefabs use the existing scene composition format (`Scene.prefab: true`), including nesting, reference migration and source-cycle validation. They compose 2D content only. Translation and visibility inherit; rotation and whole-branch scale inheritance are not implemented. Visual dimensions on the source are cooked into target-sized images at export. Prefabs are stored inside the project file, so moving the project carries its sources with it.

## Spawn pools

Select a prefab asset, choose **Copies**, then **Create spawn pool**. This creates a collapsed group of ordinary linked instances with **Reserve for runtime spawning** enabled. The reserved copies start inactive; they have no drawing, collision, input or Start scripts until acquired. You can inspect overrides and state bindings on each slot. Multiple groups of the same prefab share acquisition by source ID.

Capacity is explicit: 1–16 copies per creation command, subject to the **128 expanded nodes** and **16 hierarchy levels** per scene. A branch with three nodes consumes four slots per copy, including its instance root. Pools cannot nest inside a spawnable copy. The editor rejects overflow atomically. Target guidance budgets all reserved widgets as potentially active, even though initially hidden. Image payloads remain deduplicated.

In **Play**, open **Prefabs** beside the play controls. **Spawn copy** tests a copy near the player (or screen center); **Despawn last** retires it. Stop restores the authored scene. This tests the same lifecycle in the fast preview; use **Native LVGL** to execute C hooks and verify exported widgets.

## C API

Reserve copies before calling the API. Use the source's `UI_PREFAB_*` constant in `ui_ids.h`:

```c
static lge_prefab_handle_t slime;

/* From an update/event hook on the LVGL owner thread. */
slime = ui_prefab_spawn(UI_PREFAB_SLIME, 120, 80);
if (slime.generation) {
    lge_node_t *body = ui_prefab_node(slime, "body");
    lge_body_set_velocity(body, 30, 0);
}

/* Later, retire it. Old handles now return NULL/false, even after slot reuse. */
ui_prefab_despawn(slime);
slime = (lge_prefab_handle_t){0};
```

`UI_PREFAB_SLIME` is illustrative; copy the actual generated constant. Child paths are relative to the source, e.g. `body` or `equipment/sword`. NULL/empty path finds the logical instance root. Positions are world pixels. A full/missing pool or invalid position returns a zero handle; it never evicts another copy. Handles expire on despawn or scene change. Do not cache raw pointers across either.

Spawning restores authored transforms, visibility, image/animation, speed, initial body velocity, platform/grid/jump state and emitter settings. It resets area contacts, melee state/hit bits and projectiles owned by the copy. Despawning cancels scripts/dialogues/battles tied to its members. Visible members receive Start scripts on every acquisition. Core hooks also receive `LGE_EVENT_SPAWN` / `LGE_EVENT_DESPAWN` per member; recursive pool mutation during those callbacks is rejected. Queue scene requests through `ui_request_scene`, as with other callbacks.

Session variables, inventory and remapped state fields retain their authored state semantics; they are not automatically reset or cloned by respawning. Use per-slot state bindings for independent fields and a Start script for health/reset rules. Collected pickups keep their score; retiring an uncollected counted pickup removes it from the current total. Scene completion remains a once-per-scene signal.

Pool members and LVGL objects are created once when entering the scene. Spawn/despawn does not create/destroy LVGL objects or allocate engine memory; it reuses bounded tables. Custom callbacks and Start scripts can still allocate through application code or LVGL text/audio backends. Scene exit releases the view normally. Advanced independent views can use `lge_prefab_spawn`, `lge_prefab_node` and `lge_prefab_despawn` with their own engine.

## Automation

```sh
lge prefab.create --scene level --id actor --project-path Game.lge.json
lge prefab.pool --scene level --prefab scene_actual_source_id --capacity 4 --project-path Game.lge.json
lge node.move --scene level --id prop --target world --placement inside --project-path Game.lge.json
lge node.move --scene level --id prop --placement root --project-path Game.lge.json
```

Use the returned prefab ID, or query `prefab.list`. Live edits use the editor's normal validated transaction and Undo history. Offline edits use atomic saves and backups.

C hooks compiled with exhaustive-switch warnings should handle SPAWN/DESPAWN or retain a default branch for future lifecycle extensions. Bundled sample hooks include that fallback.
