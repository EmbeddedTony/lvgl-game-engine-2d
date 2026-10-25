# Colliders, hitboxes and character physics

Open **Help → Open Physics Playground** or `examples/PhysicsPlayground.lge.json`. The example includes a platforming character, solid platforms, a child hurtbox, a hazard hitbox and a checkpoint trigger. Play runs the built-in preview; Native LVGL compiles and runs the exported C, including the example's contact hooks.

## Choose a body

Select an object and use **Inspector → Physics · 2D**.

The blue selection rectangle describes the artwork. The physics rectangle describes gameplay collision. **Fit visual bounds** follows the object's dimensions; **Custom box** has its own local offset and dimensions. **Edit collider in scene** lets you drag the rectangle and its corner handles. One drag is one undo action. Changing a collider never resizes the artwork.

Use **Show collision shapes** in the viewport toolbar to see blue characters, green static geometry and amber areas. The Native LVGL playtest's **Colliders** button draws the same shapes in the actual LVGL renderer. Debug drawing is off by default in firmware; `ui_set_collision_debug(true)` enables it without creating extra debug widgets.

## Movement

**Top down** maps directional input to the configured speed, normalizes diagonal movement and slides along walls. Gravity normally stays zero.

**Platformer** maps Left/Right to horizontal speed, integrates positive downward gravity, and jumps only when grounded. Space, W or Up triggers a jump in the editor. Firmware sends `UI_INPUT_ACTION` or `UI_INPUT_UP`. A held jump button does not repeat jumps when landing. Set gravity and jump speed in pixels/second² and pixels/second.

**Code** integrates velocity set by `ui_body_set_velocity`. Uncheck **Player input** for independently controlled characters. The runtime exposes `velocity_x`, `velocity_y`, `on_floor`, `on_wall` and `on_ceiling` on `lge_node_t`; contact flags describe the last fixed step. `ui_body_jump` returns false unless the character is grounded. Update hooks run after built-in physics; velocity changes apply on the next fixed step.

**Keep inside display** confines the collider to the logical display. Disable it for an off-screen projectile or scrolling world. Artwork can extend beyond its collider. Setting a transform directly is a teleport and bypasses collision response; spawn characters in unoccupied space.

Grid movement, one-way static layers, jump buffering/coyote time, frame animation, and Z/foot sorting are documented in [2D gameplay](Gameplay2D.md). World bounds use scene camera dimensions when present.

## Hitboxes and hurtboxes

Hitboxes and hurtboxes are ordinary **Area** nodes with useful layer presets. **Add child detection area → Hitbox / Hurtbox / Trigger** creates a named child under the selected object. An Area is a logical node: it allocates no LVGL object and exports no artwork. Move/resize it using Transform, or customize its collision rectangle. Its position follows its parent, including linked scene instances.

| Preset | Belongs to | Detects |
| --- | --- | --- |
| Hitbox | Hitbox | Hurtbox |
| Hurtbox | Hurtbox | Nothing; passive target |
| Trigger | Trigger | Player |

There are eight named layer bits: World, Player, Enemy, Hitbox, Hurtbox, Pickup, Trigger and Custom. **Belongs to layers** is membership. **Detects / Collides with layers** is the object's scan mask. Detection is directional: an area's mask must include the other object's layer; the other object's mask does not have to include the area. The mover's mask controls which static/character bodies block its motion.

Areas ignore their ancestors, descendants and other sensors attached to the same character, so a character's weapon cannot hit its own hurtbox. Use multiple child areas for different damage zones. Hide a child area with `ui_node_set_visible` to disable it during inactive attack frames or invulnerability, independently of the character's artwork. Ancestor visibility also disables descendant collisions.

The **Area event** inspector can link an audio cue. Each entering object plays the cue once through the normal injected audio backend. Hurtboxes are passive by default; attach the sound to the hitbox or call `ui_audio_play` from a hook for custom damage rules.

```c
#include "ui.h"
#include <string.h>

/* Inside game_on_event: */
if(event == LGE_EVENT_AREA_ENTER &&
   strcmp(node->definition->id, "enemy/attack") == 0) {
    const char *other = ui_event_other();
    if(other && strcmp(other, "hero/hurtbox") == 0) {
        /* Apply damage in application-owned game state. */
        ui_audio_play("cue_damage");
    }
}
```

`AREA_ENTER` and `AREA_EXIT` receive the detecting area as `node`. `ui_event_other()` (or `game->event_other`) identifies the other body/area during that callback only. Do not retain runtime node pointers across scene changes. Use deferred scene requests inside callbacks.

`ui_area_contains(area, other)` reads the most recent filtered physics sample. `ui_nodes_overlap(a,b)` performs an immediate geometric query, respects effective visibility and solid tile cells, and does not apply collision masks. `ui_node_bounds(id,&box)` returns the independent world rectangle. Inputs, physics, contacts and audio pause together. Scene loads clear velocity/contact state and initialize the new scene; there are no synthetic area-exit callbacks during teardown.

Built-in collectibles still hide and increment score on player contact. Old projects without explicit Physics components keep their original full-rectangle player/solid/collectible behavior. Their callbacks remain COLLECT/COMPLETE only. Editing physics does not require migrating a project. Existing exhaustive C event switches compiled with `-Wswitch -Werror` should add the two Area cases or a `default` case. Collider structure belongs to a reusable scene's source; instance overrides continue to cover translation, visibility, text, color, speed and audio.

## Embedded contract and scope

`engine/lge_physics.c` is portable C99 and has no LVGL or allocator dependency. Immutable components live in generated scene data, so they can remain in flash. The engine stores 2 KiB of directed area contact bits for the 128-node limit, plus character velocity/contact fields. Each fixed 60 Hz step caps velocity to ±1200 px/s and samples areas at up to one pixel per axis (at most 20 substeps). Wall/tile movement uses swept axis tests. Catch-up stays bounded to 100 ms. Event order follows expanded scene order.

This is a rectangle character controller with gravity and overlap areas. Floor ramps and kinematic platform carry/push are supported as described below. Rotation, circle/capsule/polygon colliders, force-based rigid bodies, mass, restitution and stacking are not implemented. Characters do not push one another. Existing overlaps after a teleport/spawn are not automatically separated. Area samples are discrete; infinitesimal corner grazes are not a continuous collision guarantee. Floating-point results are not bit-identical across architectures. Profile the actual board, especially many simultaneous characters/areas or large compressed tilemaps.

The architecture takes inspiration from [Godot's documented separation of bodies, collision shapes, areas and masks](https://docs.godotengine.org/en/stable/tutorials/physics/physics_introduction.html). This engine uses its own small implementation; it does not embed Godot's physics server.

## Floor ramps and moving platforms

The 2D Toolkit extends this solver with linear floor-only ramp profiles on static objects/tile banks, and a separate Platform body with prescribed velocity/ping-pong/code motion. Riders are carried, solid leading faces push characters, and passenger preflights stop an axis before crushing. Custom platform updates use `ui_platform_move(id, vx * dt_seconds, vy * dt_seconds)`; teleports deliberately do not carry riders. See [Toolkit2D](Toolkit2D.md) for constraints, units and the complete contract. These additions supersede earlier limits listing ramps or passenger carry as absent.
