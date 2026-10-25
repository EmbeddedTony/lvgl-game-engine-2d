# Playable 2D examples

Both examples appear on the welcome screen and in **Help**. They use original 16px artwork, a 320×240 display, pixel perfect rendering, compressed tilemaps, pickup audio and ordinary editable scene nodes. Every playable and completion scene has a visible dialogue textbox with a speaker and two lines of text.

| Example | Open in editor | Project | Firmware package |
| --- | --- | --- | --- |
| Amber Trail | Help → Open Side Scroller - Amber Trail | [AmberTrail.lge.json](../examples/AmberTrail.lge.json) | [AmberTrail.lvgl.zip](../examples/AmberTrail.lvgl.zip) |
| Willowlight | Help → Open Adventure - Willowlight | [WillowlightAdventure.lge.json](../examples/WillowlightAdventure.lge.json) | [WillowlightAdventure.lvgl.zip](../examples/WillowlightAdventure.lvgl.zip) |

Use **Play journey** to run the complete authored sequence, including completion and Play again. **Play** previews just the current scene. **Native LVGL / F6 → Build & run** runs exported C; its default target is the authored game entry. Stop restores the authored scene and positions.

## Amber Trail

Move with A/D or Left/Right. Jump from the floor/platforms with Space, W or Up. Collect six amber sparks across a 768px horizontal course, including raised platforms and a low step. There are no lethal pits, so missed jumps can be retried. Complete the course to reach the delivery scene; Play again restarts the journey.

The platformer demonstrates custom character bounds, gravity, grounded jumping, solid tile collision, pickups, a scrolling camera, a fixed HUD and Pip's dialogue textbox. The final raised platform is reached using the lower timber step. Camera follow and physics use world coordinates; the HUD and textbox remain in display coordinates.

Open **2D camera** in the viewport toolbar to inspect the world size and follow target. **Editor view X** pans across the course without changing the project or moving its objects. Tile painting, node dragging and collider handles use the panned view. **Frame follow target** returns to the player's view. Camera follow references survive branch extraction/unpacking and cannot be left dangling by deleting the target.

## Willowlight Adventure

Move with WASD or arrow keys. Explore Willowlight Grove, collect its three stones, then search both halves of the Sunstone Shrine for three relics. A doorway in the shrine's central wall connects the two sides. The journey ends with a restoration scene and a replay button.

This handheld-style exploration demo uses a small foot collider, tile-based hedge/water/wall collision, decorative flowers, Mira the scout, a stone counter, multiple scenes and dialogue. Its maps, characters and palette are original; no Zelda artwork or maps are included. It is a compact exploration example, with no combat or inventory system.

## Edit the textboxes

For code-controlled messages, call `ui_label_set_text("dialogue_text", "Your message.\nA second line.")` on the LVGL owner thread. Fast preview shows authored messages; Native LVGL executes custom C. Keep lines short enough for the configured font and textbox dimensions. The supplied messages use ASCII so they render with the bundled Montserrat 14 font.

## Embedded footprint and source

| Exported payload | Amber Trail | Willowlight |
| --- | --- | --- |
| Sprite + used tile images, packed | 3,008 bytes | 4,608 bytes |
| Same image variants as raw RGBA | 7,168 bytes | 11,264 bytes |
| Packed tilemaps | 48 bytes | 368 bytes |
| Raw 8-bit tilemap cells | 528 bytes | 440 bytes |
| Pickup PCM WAV | 9,746 bytes | 9,746 bytes |

These are asset payloads, excluding descriptors, engine/LVGL code, fonts, widgets, stacks and display/audio buffers. The exporter chooses RLE16 or RAW8 per map and omits unused tile graphics. The camera adds an immutable definition and draw offset, with no additional framebuffer or physics allocation. Target guidance still needs your real board/display/buffer assumptions. Audio resolves through the normal injected nonblocking hardware backend.

Factories live in `src/examples/side-scroller.ts` and `topdown-adventure.ts`; shared original art and scene-building helpers are in `art.ts` and `common.ts`. The examples use the normal platformer/top-down solver, audio, camera and sequence systems; there is no demo-specific gameplay branch in the runtime. Their C hooks are intentionally small starting points for game-specific logic. `npm run sample` recreates the project files and ready-to-integrate LVGL ZIPs.

Tests play the complete platforming route and pathfind through both adventure rooms using real preview collision. Native LVGL integrations verify camera offsets, fixed textboxes, collection, scene completion and replay. The desktop workflows also edit textbox text, undo, pan the editor, run native C and export the original assets.
