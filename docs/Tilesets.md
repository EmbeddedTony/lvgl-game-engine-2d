# Tilesets and placement

Open **Help → Open Tileset Workshop** for a playable example. Its reusable terrain resource includes transparent slots, a merged duplicate, solid platforms and water. The source sheet is [WorkshopTilesheet.png](../examples/WorkshopTilesheet.png); import it with **16px tiles, 1px margins and 1px spacing**. [TilesetWorkshop.lge.json](../examples/TilesetWorkshop.lge.json) is the portable project.

## Import a sheet

Use **Project → Import tileset…**, **Project dock → Tilesets → Import tileset**, or the Tilemap dock's **Import sheet** button. Choose an image or drop it into the import dialog.

The source atlas grid is retained, including holes and repeated references. The project stores only selected non-empty tile pixels, not a second full-sheet bitmap. A tileset is one resource in the Tilesets folder; imported tiles do not flood the Sprites folder. Import plus optional layer creation/attachment is one undo operation. Canceling does not modify the project.

**Output tile size** starts at **Original** for every sheet, including a batch's next sheet. Keep the source tile size to preserve its detail. Selecting 16px output for a 32px tile retains only 25% of its source samples: nearest sampling prevents blur but still discards detail during reduction. The importer displays this loss before import. Exact duplicate merging and I4/I8 image packing are lossless; tilemap RLE changes map storage, not artwork.

For the local H7 village with the supplied Country Woods pack at its original 32px resolution, run `npx tsx scripts/create-h7-country-example.ts /path/to/Country-Woods-pack`. Open `.local-examples/WillowlightH7-Country32/WillowlightH7-Country32.lge.json` and use Native LVGL. The script uses ordinary A5 slicing plus A2/A1 terrain assembly and bakes transparent borders over the grass. It preserves the existing world, collisions, bank values and animation timing. The pack files are read locally and are not bundled with the editor. The earlier Country Crossing example deliberately uses 16px tiles; it is a reduced-resolution example.

## Paint a layer

Select the tilemap in Hierarchy and enable **Paint tiles**, or open **Tilemap** in the bottom dock. Choose the target layer and palette. Double-clicking a Tilesets asset opens its palette without changing scene content. Use **New layer** or **Use tileset on this layer** explicitly. Attaching appends missing tile types and preserves existing bank values and painted cells. A palette with a different tile size needs a new matching layer.

Click a tile for a single brush or drag across the atlas for a rectangular stamp, up to 16×16 tiles. Blank stamp cells preserve existing terrain. Merged duplicate cells select the same tile definition. Arrow keys navigate the palette; Enter/Space selects. The small number on a palette cell is its value in the current map bank.

| Tool | Shortcut | Behavior |
| --- | --- | --- |
| Brush | B | Paint the stamp; pointer strokes interpolate between events |
| Eraser | E | Clear the stamp footprint; right-drag pans the view |
| Rectangle | R | Drag a region; preview before release, repeating the stamp |
| Flood fill | F | Fill the connected region of the clicked value using the stamp |
| Pick tile | I | Read the clicked map cell; Alt-click temporarily picks |

Shortcuts apply while the Scene viewport is focused. Each stroke/fill/rectangle is one undo step. Escape cancels an unfinished rectangle; a partially painted brush stroke can be undone. Native and renderer undo cancel active gestures before changing history. Picking and palette browsing do not dirty the project.

Resize rows/columns and position the layer in Inspector. Reparenting and reusable scenes use the normal scene-tree rules; open a linked scene's source to change its tiles. A map is a single scene node, with world/UI ordering and inherited translation/visibility.

## Tile collision

Select one or more tiles and toggle **Solid**. The green marker denotes full-cell collision. Shared tileset collision changes update every authored map using those IDs, including the sources of linked instances, as one undo operation. Other maps see the same tile definition. Legacy sprite palettes retain their map-local collision controls.

Static tilemaps block character bodies through the existing collision layer/mask system. Empty and non-solid cells stay passable. Physics → None disables the layer's participation in physics. Physics debug drawing shows the actual solid cells in both preview and Native LVGL.

## Firmware and memory

Tile bank values are stable: **0 is empty; 1–255 identify tile types**. Attaching another tileset never renumbers existing cells. Inspect `ui/tile-manifest.json` for scene/node IDs, map dimensions and each bank value's image ID, name, solidity and used flag. The manifest is integration metadata; the C runtime does not parse it.

```c
#include "ui.h"

uint16_t tile = ui_tile_at("terrain", column, row);
bool solid = ui_tile_is_solid("terrain", column, row);
/* Missing maps and out-of-range coordinates return 0 / false. */
```

These queries read immutable definitions; `ui_tile_is_solid` reports the cell's solid flag independently of visibility/body masks. Runtime mutation of the cell array is not part of this release. Use `lge_tile_at` / `lge_tile_is_solid` for independently owned engine instances.

The exporter includes **only painted tile graphics**, plus any tile used independently as a sprite. Unused bank entries remain NULL so values stay stable. Repeated byte-equal image/size combinations share a descriptor and payload across resources; hash matches are confirmed with exact pixel comparisons. Images choose I4, I8 or ARGB8888 according to actual size and transparency. Maps choose RLE16 or RAW8 according to actual encoded size, including sparse flash seek checkpoints for streams longer than 16 runs. Runtime drawing clips before decoding and does not allocate a decompressed map. A 100-cell uniform map takes 4 bytes of run data instead of 100 raw bytes.

Collision flags use `ceil(tile_count / 8)` bytes, at most 32 bytes for 255 types. The legacy 32-bit mask remains supported for hand-authored C definitions. Tile definitions, images, cell data and flags are const and can remain in flash. The LVGL adapter uses one object per tilemap, culls off-screen images, and requires no full-sheet decompression or per-cell widget. Pixel Perfect draws visible tiles into one shared game-resolution editor canvas; fractional display mode uses one viewport-clipped canvas per layer. See [Pixel Perfect](PixelPerfect.md).

Budgets exclude pointer tables (`tile_count × sizeof(void*)` per distinct bank), image descriptors, LVGL decoder caches, draw buffers and physics state. The on-screen packed estimate covers tile image payloads; map estimates cover cell data and collision bits. Profile cache settings, flash access and frame time on the target MCU.

Limits: 8 MB input file, 2048×2048 source image, 4096 atlas cells, 255 unique tiles per tileset/map, 32 tilesets and 2048 imported tile definitions per project, plus the existing 24 MB project limit. Maps have at most 128×128 cells and 2048 pixels per axis. Source grids and unused pixels are editor-only. Small display presets remain independent of the board port.

This release supports static orthogonal square tiles and full-cell collision. Terrain/Wang autotiling, Tiled/Godot project-file import, animated tiles, rotations/flips, non-square/isometric/hex grids and in-place tileset reimport are not provided yet. Use the original sheet and Import to create another resource; Undo corrects an import before subsequent edits.

The workflow draws on [Godot's atlas slicing and TileSet resources](https://docs.godotengine.org/en/stable/tutorials/2d/using_tilesets.html) and [Tiled's stamp, shape and fill tools](https://docs.mapeditor.org/en/stable/manual/editing-tile-layers/). Implementation and example artwork are original to this project.
