# 2D gameplay authoring

## Layered NPCs

Open **Gameplay → Sprite animation → Import layered character**. Select matching Mana Seed **P1** PNGs for one body and its clothing/accessories, give the NPC a name, then choose **Create animated NPC**. The importer retains original pixels, creates four-direction idle/six-frame walk clips, and adds one NPC to the active scene. It sorts rear cloak → body → outfit → front cloak/mantle → facewear → hair → hood. Pick one color variant per part and one hood alternative. Source rows are Down, Up, Right, Left; the importer maps these to the corresponding editor directions for every layer. The GUI wizard imports P1 idle/walk sheets; P2 tool-swing assembly has a pure helper described below. Other actions can still be assembled as ordinary clips.

Find a character with **Search animations**, open a clip's **Layers · bottom to top**, and edit visibility, order, offsets or frame references. **Frames & offsets → Static accessory** holds one image across the shared timeline. Frame thumbnails and the composed preview show the final stack. Changes are undoable and persist with the project. Export precomposes each frame, keeping one LVGL image per character. Layer visibility/order are baked outfit settings; they are not a runtime equipment API.

Run `npm run example:h7-village` with the supplied packs installed to rebuild `.local-examples/WillowlightH7-PackVillage/WillowlightH7-PackVillage.lge.json`. This local review village uses native scenery from Country Woods and Modern+, Mira's four-layer Alchemist outfit and Rowan's six-layer cloak outfit. The protagonist now also uses the supplied Character Base, Alchemist coat and Cloak & Hood packs: gold hood/cloak over a red coat. All three actors use crisp 2× display scaling and matching feet colliders. Rowan's event-script patrol runs in both editor preview and native C. Sword animation uses matching pack P2 tool-swing poses plus an editable deterministic blade/sweep layer; camera, touch controls and animated terrain are retained. Native LVGL is the review path before flashing.

Open **Help → Open 2D Gameplay Lab**. Use **Play**, WASD/arrows to move, and **E / Z / Enter** to interact or confirm. Up/Down selects dialogue answers. The lab contains two playable rooms and a linked chest source scene. Two copies of that chest share artwork and one script, have separate saved opened flags, and contribute to the same inventory. The shrine encounter can be resolved by breaking its three sigils or listening.

This is an original small example, not a reproduction of a commercial game's content. Existing Amber Trail and Willowlight examples remain available with their editable textboxes.

## An organized project

Keep room content in scenes, reusable actors/props in linked source scenes, journey order in Game flow, and reusable behavior in the **Gameplay** workspace. Gameplay separates:

- **Event scripts**: named resources with folders, search, ordered action cards, stable step links, duplication and reference-aware deletion.
- **State & items**: named bounded integers grouped by folder. Flags describe switches/quests, counters describe health/currency, and items describe inventory stack counts.
- **Sprite animation**: ordered frame resources, FPS and looping; sprites select idle/move/jump/fall and optional four-direction idle/move clips.

Resource names/folders can change without changing IDs. The editor lists authored usages and prevents deleting referenced scripts, fields and clips. Handwritten C references remain developer-owned. Undo/Redo applies to document edits; Play never rewrites source defaults or transforms.

## Create an interaction

1. Add the state fields it needs, or choose a recipe in Event scripts.
2. Edit its action cards. Branch and choice destinations reference stable step IDs; reordering cards preserves those links. An empty destination means the following step.
3. Select an object in Scene and add a **Gameplay events** page. Choose a trigger and script. Optionally require a state comparison.
4. Play the scene, or use Native LVGL to execute the generated C and custom hooks.

Recipes cover a conversation with choices, a one-time item chest, a keyed doorway, a non-blocking timed patrol, and a small turn-based encounter. They generate ordinary editable scripts and state; no game-specific branch exists in the runtime.

Each object supports eight pages. **The last matching page for a trigger wins.** An event runs at most one of those pages. Different objects can run concurrent scripts. Start runs for each visible object on scene entry; Complete is the existing collectible completion event. Enter/Exit require a Physics Area and appropriate masks, Collect requires a collectible, and Click requires a button. Changing a state field does not continuously rerun pages; pages are selected when their event occurs.

Interact selects one nearest eligible, visible object within 40 world pixels of the player, in its facing half-plane with an eight-pixel tolerance. Keep interactable prop bounds near the player-facing edge of large objects. Movement input determines facing; the initial facing is down. Interact is a separate action from platformer jump.

## Reuse behavior with independent state

A shared script normally uses shared project fields. A reusable chest's `chest_opened` field would consequently be shared unless you give that copy its own field.

Create a second flag, then use **Object state remaps** on the object or an inherited child of a linked scene: map the script's `chest_opened` to `second_chest_opened`. State changes, branches and conditional event pages resolve that mapping once through the event's owner. Keep inventory/currency fields unmapped to share them across the game. Remaps are explicit and non-recursive, with at most 16 per object.

The lab's `chest/body` and `other_chest/body` demonstrate this arrangement. Their structure and event pages belong to the same source scene. The second instance overrides only its state mapping. Source edits update both copies; their saved opened flags remain independent. Extraction/unpacking preserves these components. Prefer role selectors `self`, `player` and `other` in reusable scripts. Literal node paths are checked against each loaded scene and require review after structural changes, like handwritten C paths.

## Available actions

| Action | Behavior |
| --- | --- |
| Dialogue / choice | Speaker, wrapped/paginated text, adjustable typewriter speed, up to four answers, optional branch destinations |
| Change state / inventory | Set or add/subtract; values saturate at declared min/max |
| Branch on state | Equals, not equal, less than, at least; select a destination for each result |
| Go to step | Reuse a stable step, including a bounded loop |
| Wait | Yield the coroutine for game time; pause freezes the wait |
| Change room + spawn | Defer a scene change and place its player at world X/Y before START |
| Show / hide object | Affects drawing and collision, including descendant visibility |
| Set velocity | Drive a Character in Code movement mode, such as a patrol or preallocated projectile |
| Play audio | Use the existing cue/backend/priority/bus system |
| End script | Release the coroutine and movement lock |

`self` is the event owner, `other` is the contact/player context where available, and `player` finds the scene's visible player. Enter/Exit provide their detected object, Collect provides its collecting player, and Interact provides the player. Start/Complete/Click have no other context. Literal resolved IDs such as `hero/weapon` can target another object in that scene.

Dialogue always locks world physics; blocking scripts also lock it during waits. Non-blocking scripts allow patrols/timers to continue. Hooks and the event clock continue so the conversation can advance. Animation can continue while physics is locked. The default dialogue view uses the bundled 14px font, conservative word/UTF-8 pagination and keyboard or pointer choices. Visible touch controls in the lower half of the display reserve space below the dialogue when a page fits above them. Every page has a 40px Reveal, Continue, Confirm or Close button; Confirm uses the currently selected answer. Small displays fall back to the full viewport while keeping that button inside the panel. Use short pages for very narrow displays; larger/custom fonts and very small displays require customizing the generated LVGL dialogue adapter. Text shaping, translation and rich portraits require custom integration.

Dialogue reveals at **30 characters per second** by default. Set **Gameplay → Say action → Text speed (characters/s)** to 1–120, or 0 for instant text. Press **E / Z / Enter**, **TALK**, or the in-panel **Reveal** button once to show the rest of the current page. A fresh press after it is fully visible advances to the next page/message, confirms a choice, or closes the conversation. Holding a button does not repeatedly advance. Choices appear only after reveal finishes; the panel and button positions reserve the full page from the start. Every new page resets the reveal cursor. Pausing the game pauses typing.

The JSON/CLI action field is optional `textSpeed`; existing projects get the default automatically. C exports resolve that default into `lge_action_t.text_speed` (0 = instant). `ui_dialogue_text()` keeps returning the complete wrapped page; `ui_dialogue_visible_bytes()` gives its visible UTF-8 prefix length and `ui_dialogue_revealing()` reports whether it is typing. `ui_dialogue_choose(index)` follows the same reveal-then-advance rule for code callers. Unicode code points are revealed whole; combining sequences are not grouped into grapheme clusters. The portable runtime reuses its existing bounded page buffer, adds a small cursor/timing state and performs no heap allocations for reveal. LVGL updates the dialogue only when its revision changes and measures the complete page once for stable layout.

## Character and drawing tools

Choose **Physics → Movement**:

- Top down: continuous normalized movement and wall sliding.
- Grid: one axis at a time, an 8–64px step (default 16). A released tap finishes its current step; turns wait for the step boundary. Sweep collision still blocks obstacles. Align room spawns, tile size and colliders to the same grid to retain tile alignment; arbitrary partial obstacles can stop a step early.
- Platformer: gravity and grounded jump, with optional 0–250ms coyote grace and jump buffering. Zero preserves the old strict behavior.
- Code: integrate velocities from actions or C.

**Z index** controls drawable order; **Sort by feet Y** uses world Y + visual height within that Z value. Put ground maps at -10, actors at 0 with feet sorting, and overhead artwork at 10. UI always draws above world content. Sorting is stable and does not mutate hierarchy, physics order or project arrays. It applies per drawable, without inherited group depth transforms.

Animation selects clips from actual body velocity and retains the last direction while idle. Missing directional clips fall back to the base motion clip, then idle. Jump/Fall use platformer vertical velocity. Frame changes affect only the image, never collision bounds. Frames are baked to the sprite's display size, palette packed and pixel-deduplicated by the normal exporter. Import individual sprite frames through Project → Import image; a rectangular actor-sheet/animation slicing wizard is not included yet.

## State, testing and firmware API

All state fields survive room changes during a session. **Include in save** controls which enter a save packet; transient fields reset to their authored defaults on restore. State does not automatically persist object visibility or positions: use saved flags and Start pages to reconstruct those on room entry.

During Play, **Session state** shows values, active script count and capacity diagnostics. Save/Restore checkpoint uses an in-memory state packet for the current preview. It changes no project source. Restore when no blocking interaction is active; room visuals refresh on room entry. Stop ends the preview checkpoint's usable lifetime.

```c
#include "ui/ui.h"

int32_t keys = 0;
ui_state_get(UI_STATE_AMBER_KEY, &keys);
ui_state_add(UI_STATE_AMBER_KEY, 1);

/* Resolve this instance's state mapping. */
int32_t opened = 0;
ui_node_state_get("other_chest/body", "chest_opened", &opened);

/* Same authored actions as Play; no blocking interpreter call. */
ui_script_start(UI_SCRIPT_CHEST, "other_chest/body");
ui_set_input(UI_INPUT_RIGHT | UI_INPUT_INTERACT);
ui_request_scene_at(UI_SCENE_SHRINE, 48, 128);
```

Use the generated IDs for your actual project; scene constants depend on its stable IDs. All UI calls remain on the LVGL owner thread. Custom C runs in Native LVGL and firmware, not the fast TypeScript preview.

`ui_save_size()` reports an exact size. Pass that size and a caller-owned buffer to `ui_save_write()`, then store it using your board's storage service. `ui_save_read()` checks format, schema/project identity, length, checksum and every value's bounds before changing any state. It rejects incompatible/corrupt packets atomically. For projects without a party, packet size is **16 + 4 × persistent-field-count bytes**, with little-endian integers, not raw struct dumps. The board owns asynchronous/atomic storage, slot management and flash wear policy. The packet stores state and optional party progression/health/statuses, excluding current room positions, velocities and coroutine instruction positions. Party projects use the LGR2 envelope described in [RPG](RPG.md). Store a checkpoint field and use a boot/entry script to return to a chosen room. Schema changes require a deliberate save migration strategy; there is no automatic migration engine.

## MCU budgets and execution

Project limits: 256 scenes, 2048 source sprite assets, 512 state fields, 512 scripts, 128 actions per script, 64 animation clips, 32 frames per clip. The 24MB authoring import cap remains. Only one scene's maximum 128 expanded nodes is live. Linked scene composition remains bounded to 16 levels.

Eight fixed coroutine slots each execute at most 32 immediate actions per 60Hz tick. Loops yield at that budget; waits/dialogue yield earlier. A script already running on the same owner cannot restart concurrently. A full pool rejects a new start; it does not allocate or grow an event queue. Start events can fill that pool, so keep room initialization short and use a few coordinated scripts rather than a long-running Start script on every decoration. One shared dialogue view serializes conversations. Room exits cancel its old scripts/dialogue. Automatic Game flow Complete/Click rules retain their transition precedence; for a final conversation before leaving, use a manual flow step and a script-ending room warp, or advance the sequence from C after dialogue finishes. No recursive calls, eval, runtime JSON parser, scene-wide heap spawning or growing state dictionary is introduced.

The portable story context is 3,312 bytes on this arm64 host; the core engine is 13,568 bytes before LVGL view/widgets/buffers. These host sizes are evidence, not measurements on every MCU ABI. State metadata, scripts, remaps, clips and images are immutable exported C tables. Target guidance includes animation variants, action/text/remap tables and a 20KiB base engine/story/view allowance plus its existing widget/system/buffer allowances. Actual board profiling still decides memory, CPU and display throughput.

## Coverage against the genre targets

| Inspiration | Supported building blocks | Still game-specific or missing dedicated tooling |
| --- | --- | --- |
| A Link to the Past | Rooms, reusable props, continuous top-down movement, foot colliders/Y sorting, item counts, quest switches, keyed doors, dialogue, areas/hitboxes and C hooks | Combat/invulnerability/push-block rules, equipment UI, enemy AI and dungeon-specific puzzles need authored actions/C; built-in directional melee supplies Hit events and attack animation phases |
| Undertale | Branching paginated conversations, choices, conditional saved routes, repeatable turn menus and alternative encounter outcomes | Reusable fans/rings/aimed patterns, a pooled arena and RPG encounter tables are now provided; full battle arena UI, bespoke encounter rules and alternative combat systems remain game-specific |
| Super Mario World | Scrolling world/camera, tile collision, jump buffering/coyote grace, one-way platforms, motion animation and areas | Variable-height jumps, tile mutation and dedicated enemy/power-up controllers remain game-owned; ramps/platform carry are supplied by the 2D Toolkit |
| Pokémon Crystal / FireRed | Tile-step movement, linked actors/props, room warps/spawns, conditional NPCs, item stacks, flags, save buffers and turn-menu recipes | Actor/species, skill, item and encounter databases plus integer stat/amount helpers are now provided; party battles, inventory, core statuses and progression now have built-in tools; boxes, type charts, capture/evolution and specialized menus remain game-specific |

These features support a coherent small-game workflow and reusable foundations for larger projects. This release does not establish complete feature parity with those commercial games or make every mechanic trivial. Large worlds still need room budgeting; projectile-heavy scenes can use the separate fixed 64-shot pool and authored patterns. Typed RPG databases provide reusable items/skills/actors/encounters; optional battle/party instances are now supplied by the [RPG system](RPG.md). General-purpose rigid bodies, arbitrary polygons/sloped ceilings, navigation/pathfinding, runtime scene spawning/streaming and a multi-file gameplay-code resource manager are separate engineering work.

## Ramps, platforms, projectiles and RPG records

See [2D Toolkit](Toolkit2D.md) for the implemented floor ramps (including tile-bank profiles), kinematic passenger carry/push/crush prevention, live bullet-pattern tools, typed RPG databases, and velocity/speed/time APIs. Help → Open 2D Toolkit Lab includes both built-in motion and a real C update-loop platform example.

### Character display scale and action poses

The layered character importer offers 1×–4× integer display scale. Source pixels stay at native resolution; display bounds and the feet collider scale together, and the exporter bakes nearest-neighbor image variants. Exact repeated source cells are shared to conserve the 512-source-sprite authoring budget.

The pure `importLayeredToolSwing` helper imports matching P2 body/outfit sheets as four directional, four-frame overhead-tool clips. A P1 actor imported with `fullCell: true` shares the full 64×64 source-cell origin, leaving room for tools and sword effects. The GUI P1 wizard handles idle/walk; P2 tool-swing assembly currently uses the helper, with the resulting clips and layers editable in Gameplay. All outfits/poses still bake to one ordinary runtime image per actor.

Cutscenes add staged actors, camera cues and explicit completion skips through the same VM. See [Cutscenes](Cutscenes.md) and the private [Willowlight campaign](WillowlightCampaign.md).
