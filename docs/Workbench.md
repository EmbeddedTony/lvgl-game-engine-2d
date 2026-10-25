# Editor workbench

The compact header contains File, Edit, Scene, Project, View and Help menus, document actions and Export. The second row groups Add/Undo/Redo, Play/Pause/Stop, Native LVGL and display settings. Native macOS menus and existing keyboard shortcuts remain available.

## Layout

Hierarchy is on the left, the Scene/Game work area is in the center, Inspector is on the right, and Project/Console spans the bottom. Drag a divider to resize a dock. A focused divider also supports arrow keys, Home/End and double-click reset. Sizes and dock collapse are saved as local editor preferences. They do not dirty a project or enter its undo history.

View → Focus viewport hides surrounding docks. The viewport restore button or Escape (outside play/text editing) restores them. View → Reset editor layout restores default sizes and expands the bottom dock. At narrow widths, toolbar buttons reveal Hierarchy and Inspector as overlays. Dock positions are fixed in this version; panels do not float or drag to different docking locations.

## Scenes and play

Scene document tabs select authored scenes. The Scene workspace retains the existing Design shortcut, ⌘1. Code, Audio and Game flow remain separate workspaces. Inspector component sections fold to keep long property lists manageable. Rulers show logical pixels. With **Pixels on**, Fit and Zoom use whole physical-pixel multipliers, including Retina/fractional OS scaling; a small viewport scrolls instead of dropping pixels. The saved project setting is also in Project settings. Inspector → Sprite pixel scale chooses native size or whole enlargement. See [Pixel Perfect](PixelPerfect.md).

Game starts the current scene's fast built-in preview. Play in the global toolbar does the same. Pause/Resume and Stop control transient state; switching back to Scene stops preview and restores authored state. Starting from another workspace focuses the newly mounted viewport. Editor menus/resource controls do not send movement keys into the game; click the game viewport to resume directing input there. Resume also returns focus to it.

Native LVGL (F6) still opens the compiled C playtest. Game flow's Play game/Preview sequence follows the authored entry and journey. Fast preview and actual native C execution remain explicitly distinguished.

## Project resources

Project has Scenes, Sprites, Tilesets, Audio and Code folders, search and thumbnail/list views. Single-click selects a resource without changing the document. Double-click or Enter opens a scene/script, places a sprite or auditions audio. The selection row offers explicit actions, including instancing a selected scene in the current scene. Scene cycles and node budgets still use the normal authoring validation.

Folder actions are contextual: New scene, Import image, Import WAV and Open hooks. Generated ui.h/ui_ids.h open read-only in Code. Images and WAVs remain embedded in the portable project and are processed by the existing exporter.

## Console

Console displays bounded editor messages and current project validation issues. Filter Messages, Warnings or Errors, or use All. Clear removes editor messages; validation issues remain until their project cause is resolved. Compiler diagnostics and native printf output stay in the Native LVGL playtest panel, where locations can open the C editor.

## Tilemap dock

The Tilemap tab provides layer/palette selection, a reusable atlas, stamp tools and map/collision byte estimates. Import a sheet from Project or the dock; explicitly create a new layer or attach it to a matching map. Folder browsing never places tiles. Selecting an atlas region creates a stamp; paint it in the Scene viewport with Brush, Eraser, Rectangle, Flood fill or Pick. Right-click temporarily erases and Alt-click picks. Shared Solid changes affect every map using those tile IDs. See [Tilesets](Tilesets.md) for shortcuts, import settings, MCU budgets and the example sheet.

## Target advice

Project → Target guidance… opens the searchable MCU catalog and budget planner. The status bar shows the selected family and advisory count; Project settings and Export provide the same entry point. Choosing a family initializes editable reference budgets. Plan installed RAM/flash/SD, draw/scanout buffers, refresh throughput and custom C effects, then confirm only acceleration actually integrated by your firmware. Recommendations update with scene edits, save with the project and remain non-blocking. Linux/Host PC suppress routine MCU advice. See [Target guidance](TargetGuidance.md) and the [vendor catalog](TargetCatalog.md).
