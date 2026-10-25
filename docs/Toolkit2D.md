# 2D toolkit: ramps, platforms, patterns and RPG data

Open **Help → Open 2D Toolkit Lab**. The first scene demonstrates ramps, a ping-pong lift and a platform driven by `game_on_update`. The second is a pooled bullet arena. Gameplay → Bullet patterns / RPG database edits the reusable resources. All edits use normal project undo/save/export; Play never modifies the authored scene.

## Motion and simulation time

Coordinates and collider sizes use world pixels. Velocity uses pixels/second; gravity uses pixels/second². Every physics/update step is **1/60 second**, independently of display refresh. Catch-up is bounded to 100 ms. Pausing freezes the simulation clock and hooks. Modal dialogue freezes built-in world simulation, including platforms/projectiles, while the script VM and hooks continue.

`game_on_update(game, dt_seconds, user)` is the delta-time equivalent. `ui_delta_seconds()` reads that fixed delta during a simulation callback and returns zero outside a step. `ui_time_seconds()` is scene-local simulation time and resets on entry. It is not wall-clock time.

| API | Contract |
| --- | --- |
| `ui_body_set_velocity(id, vx, vy)` | Character or Platform velocity, each axis ±1,200 px/s. Code controllers retain it; input controllers replace the relevant axes next tick. |
| `ui_body_velocity(id, &vx, &vy)` | Read runtime velocity; false for missing/non-moving body types. |
| `ui_node_set_speed(id, speed)` / `ui_node_speed(id)` | Change/read the input controller's speed, 0–600 px/s. Source definitions stay immutable. Missing getter returns zero. |
| `ui_platform_move(id, dx, dy)` | Apply a Platform displacement now and carry/push passengers; each axis ≤20 px per call. False for invalid motion or a blocked axis; partial movement can already have occurred. |
| `ui_node_set_position(id, x, y)` | Teleport; descendants follow, passengers do not. Use unoccupied destinations. |

A platform can absolutely move from the update loop. Give it **Physics → Platform → Velocity / code**, leave initial velocity zero, and choose one motion owner:

```c
void game_on_update(lge_engine_t *game, float dt_seconds, void *user)
{
    (void)game;
    (void)user;
    /* A custom controller can reverse direction at endpoints. */
    ui_platform_move("ferry", 40.0f * dt_seconds, 0.0f);
}
```

Alternatively, set `ui_body_set_velocity("ferry", 40, 0)` once and let built-in integration move it. Do not also apply that displacement manually. Velocity changes in update hooks apply to the next physics tick; `ui_platform_move` applies immediately. Fast Play runs authored built-in motion. **Native LVGL → Build & run executes custom C hooks inside the editor**, without flashing hardware. The Toolkit Lab includes a complete reversing update-loop example.

## Floor ramps and tiles

Select a static object, then **Physics → Floor shape → Ramp ↗ / ↘**. Its independent collider width/height defines the run/rise. Match the visual with a sprite. The collision overlay shows the triangular profile while retaining all bounding-box editing handles.

In the Tilemap palette, select tile types and choose **Floor shape**. Ramps become solid automatically; shared tileset edits propagate to every authored map. Turning Solid off removes the ramp profile. Attaching the tileset copies current profiles without renumbering cells. A tile-bank ramp is a 45° square cell; rectangular object ramps support other inclines.

Compressed RAW8/RLE16 cell data is unchanged. A map with ramps adds one flash byte per bank tile; maps without ramps have no profile table. Tile manifests expose the profile. Runtime collision evaluates a bounded linear height function rather than generating triangle meshes.

## Kinematic platforms

**Physics → Platform** is an explicit body type, separate from static geometry and characters. Choose a relative ping-pong endpoint and one-leg duration, or initial velocity/code control. The collision overlay shows the endpoint/path. Parent translations remain independent of the path offset.

A platform carries characters standing on its top, releases upward-moving jumpers and pushes characters in front of a solid moving face. One-way platforms carry standing riders and allow passage from below/sides. Passenger movement is swept against the world's boxes/tiles; a blocked passenger stops that platform axis before crushing. Motion uses bounded ≤1px substeps, with no impulses, rigid-body stacks or runtime allocation. A stalled ping-pong path tracks actual displacement so it does not accumulate drift; the desired path clock continues and catch-up remains capped at 20px per axis/tick.

Platform trajectories are prescribed: the platform itself does not navigate around or stop on static scenery. Design clear paths. Passenger preflights stop against scenery; they are not a general depenetration/crush damage system. Tilemap layers remain static. Areas moved by a custom hook are sampled at the next physics tick.

## Reusable bullet patterns

Gameplay → **Bullet patterns** provides searchable folders, fan/ring/aimed presets, a live preview, burst count, angular spread, rotation per burst, speed, interval, lifetime, radius, color, target mask and damage payload. Pause retains the preview. Attach a pattern using an object's **Bullet emitter** component; its center is the emission origin. Event scripts can enable/disable an emitter; code uses `ui_emitter_set_enabled`.

Each scene has **one shared pool, 1–64 active slots**. Each pattern can emit 1–32 shots per burst, at intervals ≥50ms, at speeds ≤600 px/s. A full pool drops new shots, never steals live shots or grows a queue. `ui_projectiles_count()` and `ui_projectiles_dropped()` expose activity/overflow. Preview Session displays the same counters. Setting a smaller scene limit bounds active work; the native allocation is still the fixed 64-slot structure. That allocation exists only while an emitter scene is loaded, and is released on leaving it. There is no allocation per shot, per-cell widget or projectile scene-node spawning.

Shots sweep against visible Character/Area AABBs selected by the eight-bit target mask. First nearest hit wins; scene order resolves exact ties. The shot radius expands the AABB conservatively. Shots ignore their owner/ancestors/descendants and sensors belonging to the same Character. Static terrain does not block this arena-oriented system. Lifetime bounds shots outside the screen. Bullets draw in one LVGL surface above world objects and below UI; old/new occupied bounds are invalidated for repaint.

A hit sends `LGE_EVENT_PROJECTILE_HIT` with the **target** as `node`, the **emitter** as `ui_event_other()`, and callback-only `ui_projectile_hit()` data. Copy any needed values before returning. No automatic HP mutation is hidden in the renderer:

```c
if (event == LGE_EVENT_PROJECTILE_HIT) {
    const lge_projectile_t *hit = ui_projectile_hit();
    if (hit) {
        unsigned damage = hit->pattern->damage;
        /* Apply your HP/invulnerability rules using node and damage. */
        (void)damage;
    }
}
```

An authored **Hit** event page starts a normal bounded script. As with other triggers, concurrent starts of the same script/owner coalesce; simultaneous bullets do not enqueue unlimited copies. Use C callbacks if every individual hit must be counted, or conditional state/wait scripts for invulnerability windows. Blocking scripts/dialogue suspend bullet clocks and emission as well as world motion. Scene entry clears all shots, counters and emitter clocks.

## RPG databases

Gameplay → **RPG database** separates searchable, folder-organized resource types with stable IDs:

| Resource | Data and links |
| --- | --- |
| Items | Description, icon, price, healing amount and optional saved inventory-stack field. Create a stack directly from the item form. |
| Skills | Damage/heal effect, integer power, MP cost, accuracy and description. |
| Actors & species | Sprite/portrait, HP/attack/defense/speed, linear per-level growth, experience reward and up to eight linked skills. A level preview shows resulting stats. |
| Encounter tables | Up to eight weighted actor entries, each with a level range. Relative selection percentages are shown. |

Each collection supports up to 128 records. Referenced resources cannot be deleted in the editor. Import/export validates missing links, inventory-field kinds, bounds, duplicate IDs and encounter ranges. Folders are authoring metadata; the exporter compiles one immutable C database, shared by every scene. Portrait/icon image descriptors use the existing palette packing and pixel deduplication pipeline.

`ui_rpg_database()` is valid even before `ui_init`. Use generated `UI_ITEM_*`, `UI_SKILL_*`, `UI_ACTOR_*`, `UI_ENCOUNTER_*` constants:

```c
const lge_rpg_database_t *db = ui_rpg_database();
const lge_rpg_actor_def_t *actor = lge_rpg_actor(db, UI_ACTOR_RANGER);
lge_rpg_stats_t stats;
if (lge_rpg_stats(actor, 3, &stats)) { /* stats.hp, attack, defense, speed */ }
const lge_rpg_item_t *potion = lge_rpg_item(db, UI_ITEM_POTION);
/* potion->image is a const LVGL image descriptor; potion->stack is its state ID. */
uint8_t level;
const char *actor_id = lge_rpg_choose(lge_rpg_encounter(db, UI_ENCOUNTER_GROVE),
                                     random_roll, level_roll, &level);
```

Queries are bounded linear scans; cache immutable record pointers for a combat/menu session. Stat levels are 1–100 and values saturate at 9,999. `lge_rpg_skill_amount(skill, attack, defense, roll)` uses an explicit accuracy roll modulo 100; damage is `max(1, power + attack − floor(defense/2))`, capped at 9,999, healing is power. Encounter selection and levels use separate caller-supplied unsigned rolls. No global RNG or floating-point combat simulation is required.

An optional party controller now supplies turn combat, current HP/MP, XP/levels, inventory menus, statuses, gold and validated saves. See [RPG guide](RPG.md). Equipment, shops and specialized elemental/type rules remain game-owned.

## MCU costs and architecture

Portable physics, projectiles and RPG helpers are separate from editor presentation and LVGL rendering. The fast-preview implementations mirror C; Native Play executes the canonical exported files. Definitions remain const in flash, and mutable state belongs to the scene/engine or caller. No gameplay JSON parser, dynamic projectile queue, runtime entity graph growth or per-shot allocation is introduced.

Target guidance includes RPG/pattern/profile flash, optional projectile-pool RAM, estimated pool overflow, projectile swept tests and platform passenger preflights. Ordinary MCU warnings stay off for host/embedded Linux. Graphics accelerators do not eliminate gameplay collision work. Start with modest pools/rates, sparse active areas, a few platforms and narrow masks. C math uses trigonometry only when spawning shots; motion is linear between emissions. Test the real MCU's timing, memory layout and display dirty-area behavior.

Verification uses independent TS and C behavioral tests plus exported LVGL 9.4/9.6 builds, editor flows and the packaged standalone app. Host sizeof results are not board ABI measurements.
